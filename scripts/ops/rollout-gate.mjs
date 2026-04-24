#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASELINE_FILE = 'ops/rollout-baseline.json';
const DEFAULT_REPORT_FILE = 'ops/rollout-report.json';

const HELP = `Usage:
  node scripts/ops/rollout-gate.mjs baseline [options]
  node scripts/ops/rollout-gate.mjs evaluate [options]

Options:
  --api-base-url <url>                     Default: http://localhost:4020
  --duration-sec <seconds>                 Default: 1800
  --interval-sec <seconds>                 Default: 30
  --timeout-ms <ms>                        Default: 5000
  --baseline-file <path>                   Default: ops/rollout-baseline.json
  --out <path>                             Baseline: ops/rollout-baseline.json | Evaluate: ops/rollout-report.json
  --max-5xx-rate <ratio>                   Default: 0.02
  --max-chat-p95-increase <ratio>          Default: 0.5
  --max-orch-failed-per-min <number>       Default: 2
  --max-provider-errors-per-min <number>   Default: 2
  --max-auth-failures-per-min <number>     Default: 5
  --allow-readyz-degraded <true|false>     Default: false
  --help                                   Show this help

Examples:
  node scripts/ops/rollout-gate.mjs baseline --api-base-url http://localhost:4020 --duration-sec 300 --interval-sec 10
  node scripts/ops/rollout-gate.mjs evaluate --api-base-url http://localhost:4020 --duration-sec 300 --interval-sec 10
`;

const parseArgs = (argv) => {
  const options = {
    apiBaseUrl: 'http://localhost:4020',
    durationSec: 1800,
    intervalSec: 30,
    timeoutMs: 5000,
    baselineFile: DEFAULT_BASELINE_FILE,
    out: null,
    max5xxRate: 0.02,
    maxChatP95Increase: 0.5,
    maxOrchFailedPerMin: 2,
    maxProviderErrorsPerMin: 2,
    maxAuthFailuresPerMin: 5,
    allowReadyzDegraded: false,
  };

  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const [rawKey, explicitValue] = token.split('=');
    const key = rawKey.slice(2);
    const value = explicitValue ?? argv[index + 1];

    const consumeValue = () => {
      if (explicitValue === undefined) index += 1;
      return value;
    };

    if (key === 'help') {
      options.help = true;
      continue;
    }

    if (key === 'api-base-url') {
      options.apiBaseUrl = consumeValue();
      continue;
    }

    if (key === 'duration-sec') {
      options.durationSec = Number(consumeValue());
      continue;
    }

    if (key === 'interval-sec') {
      options.intervalSec = Number(consumeValue());
      continue;
    }

    if (key === 'timeout-ms') {
      options.timeoutMs = Number(consumeValue());
      continue;
    }

    if (key === 'baseline-file') {
      options.baselineFile = consumeValue();
      continue;
    }

    if (key === 'out') {
      options.out = consumeValue();
      continue;
    }

    if (key === 'max-5xx-rate') {
      options.max5xxRate = Number(consumeValue());
      continue;
    }

    if (key === 'max-chat-p95-increase') {
      options.maxChatP95Increase = Number(consumeValue());
      continue;
    }

    if (key === 'max-orch-failed-per-min') {
      options.maxOrchFailedPerMin = Number(consumeValue());
      continue;
    }

    if (key === 'max-provider-errors-per-min') {
      options.maxProviderErrorsPerMin = Number(consumeValue());
      continue;
    }

    if (key === 'max-auth-failures-per-min') {
      options.maxAuthFailuresPerMin = Number(consumeValue());
      continue;
    }

    if (key === 'allow-readyz-degraded') {
      const parsed = String(consumeValue()).trim().toLowerCase();
      options.allowReadyzDegraded = ['1', 'true', 'yes', 'on'].includes(parsed);
      continue;
    }

    throw new Error(`Option non reconnue: --${key}`);
  }

  return {
    command: positionals[0],
    options,
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const parsePrometheusMetrics = (text) => {
  const samples = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([+-]?(?:\d+\.?\d*|\d*\.\d+)(?:[eE][+-]?\d+)?)$/);
    if (!match) continue;

    const [, name, , labelsRaw = '', rawValue] = match;
    const labels = {};

    if (labelsRaw) {
      const labelMatches = labelsRaw.match(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g) || [];
      for (const item of labelMatches) {
        const parts = item.match(/^([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"$/);
        if (!parts) continue;
        const [, key, value] = parts;
        labels[key] = value.replace(/\\"/g, '"');
      }
    }

    samples.push({
      name,
      labels,
      value: Number(rawValue),
    });
  }

  return samples;
};

const labelsMatch = (labels, expected) =>
  Object.entries(expected).every(([key, value]) => labels[key] === value);

const sampleLabelKey = (labels) =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('|');

const mapSamplesByLabel = (samples, metricName, expectedLabels = {}) => {
  const filtered = samples.filter((sample) => sample.name === metricName && labelsMatch(sample.labels, expectedLabels));
  const map = new Map();

  for (const sample of filtered) {
    map.set(sampleLabelKey(sample.labels), sample.value);
  }

  return map;
};

const counterDelta = (start, end) => {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return end >= start ? end - start : end;
};

const deltaCounterSum = (startSamples, endSamples, metricName, expectedLabels = {}) => {
  const startMap = mapSamplesByLabel(startSamples, metricName, expectedLabels);
  const endMap = mapSamplesByLabel(endSamples, metricName, expectedLabels);

  let total = 0;
  for (const [key, endValue] of endMap.entries()) {
    const startValue = startMap.get(key) ?? 0;
    total += counterDelta(startValue, endValue);
  }

  return total;
};

const deltaCounterSumWhere = (startSamples, endSamples, metricName, predicate) => {
  const startMap = new Map();

  for (const sample of startSamples) {
    if (sample.name !== metricName || !predicate(sample.labels)) continue;
    startMap.set(sampleLabelKey(sample.labels), sample.value);
  }

  let total = 0;
  for (const sample of endSamples) {
    if (sample.name !== metricName || !predicate(sample.labels)) continue;
    const key = sampleLabelKey(sample.labels);
    const startValue = startMap.get(key) ?? 0;
    total += counterDelta(startValue, sample.value);
  }

  return total;
};

const computeHistogramQuantile = (startSamples, endSamples, baseMetricName, expectedLabels, quantile) => {
  const bucketName = `${baseMetricName}_bucket`;
  const startMap = new Map();

  for (const sample of startSamples) {
    if (sample.name !== bucketName || !labelsMatch(sample.labels, expectedLabels)) continue;
    startMap.set(sampleLabelKey(sample.labels), sample.value);
  }

  const cumulativeByLe = new Map();

  for (const sample of endSamples) {
    if (sample.name !== bucketName || !labelsMatch(sample.labels, expectedLabels)) continue;
    const labelKey = sampleLabelKey(sample.labels);
    const startValue = startMap.get(labelKey) ?? 0;
    const delta = counterDelta(startValue, sample.value);
    const le = sample.labels.le;
    cumulativeByLe.set(le, (cumulativeByLe.get(le) || 0) + delta);
  }

  const total = cumulativeByLe.get('+Inf') || 0;
  if (total <= 0) return null;

  const points = [...cumulativeByLe.entries()]
    .map(([le, value]) => ({
      le,
      numericLe: le === '+Inf' ? Number.POSITIVE_INFINITY : Number(le),
      value,
    }))
    .sort((a, b) => a.numericLe - b.numericLe);

  const target = total * quantile;

  for (const point of points) {
    if (point.value >= target) {
      if (Number.isFinite(point.numericLe)) return point.numericLe;
      const finitePoints = points.filter((item) => Number.isFinite(item.numericLe));
      return finitePoints.length > 0 ? finitePoints[finitePoints.length - 1].numericLe : null;
    }
  }

  return null;
};

const probeReadyz = async (apiBaseUrl, timeoutMs) => {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/readyz`;

  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    const text = await response.text();

    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    const isReady = response.status === 200 && payload?.status === 'ready';
    const isDegraded = payload?.degraded === true || payload?.status === 'degraded';

    return {
      ok: isReady,
      degraded: isDegraded,
      statusCode: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      degraded: false,
      statusCode: 0,
      payload: {
        error: error?.message || 'readyz_unreachable',
      },
    };
  }
};

const fetchMetricsSnapshot = async (apiBaseUrl, timeoutMs) => {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/metrics`;
  const response = await fetchWithTimeout(url, timeoutMs);

  if (!response.ok) {
    throw new Error(`Impossible de lire /metrics (${response.status})`);
  }

  const text = await response.text();
  return parsePrometheusMetrics(text);
};

const collectWindow = async (options) => {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();

  const startMetrics = await fetchMetricsSnapshot(options.apiBaseUrl, options.timeoutMs);

  const readyStats = {
    checks: 0,
    failures: 0,
    degraded: 0,
    non200: 0,
    samples: [],
  };

  const initialReady = await probeReadyz(options.apiBaseUrl, options.timeoutMs);
  readyStats.checks += 1;
  if (!initialReady.ok) readyStats.failures += 1;
  if (initialReady.degraded) readyStats.degraded += 1;
  if (initialReady.statusCode !== 200) readyStats.non200 += 1;
  readyStats.samples.push(initialReady);

  const deadline = startedAt + options.durationSec * 1000;
  while (Date.now() + options.intervalSec * 1000 <= deadline) {
    await sleep(options.intervalSec * 1000);

    const ready = await probeReadyz(options.apiBaseUrl, options.timeoutMs);
    readyStats.checks += 1;
    if (!ready.ok) readyStats.failures += 1;
    if (ready.degraded) readyStats.degraded += 1;
    if (ready.statusCode !== 200) readyStats.non200 += 1;
    readyStats.samples.push(ready);
  }

  const endMetrics = await fetchMetricsSnapshot(options.apiBaseUrl, options.timeoutMs);
  const endedAt = Date.now();
  const endedIso = new Date(endedAt).toISOString();
  const durationSec = Math.max(1, Math.round((endedAt - startedAt) / 1000));
  const windowMinutes = durationSec / 60;

  const totalRequests = deltaCounterSum(startMetrics, endMetrics, 'mindmesh_http_requests_total');
  const fiveXxRequests = deltaCounterSumWhere(startMetrics, endMetrics, 'mindmesh_http_requests_total', (labels) =>
    String(labels.status_code || '').startsWith('5'),
  );

  const chatP95 = computeHistogramQuantile(
    startMetrics,
    endMetrics,
    'mindmesh_http_request_duration_ms',
    {
      method: 'POST',
      route: '/api/chat',
    },
    0.95,
  );

  const orchestratorFailed = deltaCounterSumWhere(startMetrics, endMetrics, 'mindmesh_orchestrator_calls_total', (labels) =>
    labels.status === 'failed',
  );
  const providerErrors = deltaCounterSum(startMetrics, endMetrics, 'mindmesh_provider_errors_total');
  const authFailures = deltaCounterSum(startMetrics, endMetrics, 'mindmesh_auth_failures_total');

  const modeSamples = readyStats.samples.map((sample) => sample.payload?.mode).filter(Boolean);
  const observedModes = [...new Set(modeSamples)];

  return {
    started_at: startedIso,
    ended_at: endedIso,
    window_sec: durationSec,
    api_base_url: options.apiBaseUrl,
    observed_modes: observedModes,
    readyz: {
      checks: readyStats.checks,
      failures: readyStats.failures,
      degraded: readyStats.degraded,
      non_200: readyStats.non200,
    },
    metrics: {
      requests_total: totalRequests,
      requests_5xx: fiveXxRequests,
      rate_5xx: totalRequests > 0 ? fiveXxRequests / totalRequests : 0,
      chat_p95_ms: chatP95,
      orchestrator_failed_total: orchestratorFailed,
      provider_errors_total: providerErrors,
      auth_failures_total: authFailures,
      orchestrator_failed_per_min: windowMinutes > 0 ? orchestratorFailed / windowMinutes : 0,
      provider_errors_per_min: windowMinutes > 0 ? providerErrors / windowMinutes : 0,
      auth_failures_per_min: windowMinutes > 0 ? authFailures / windowMinutes : 0,
    },
  };
};

const ensureParentDir = async (targetPath) => {
  const dir = path.dirname(path.resolve(targetPath));
  await mkdir(dir, { recursive: true });
};

const writeJsonFile = async (targetPath, payload) => {
  await ensureParentDir(targetPath);
  await writeFile(path.resolve(targetPath), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const readJsonFile = async (targetPath) => {
  const content = await readFile(path.resolve(targetPath), 'utf8');
  return JSON.parse(content);
};

const evaluateGate = (windowResult, baselineResult, options) => {
  const checks = [];

  checks.push({
    name: 'readyz_stable',
    pass:
      windowResult.readyz.failures === 0 &&
      (options.allowReadyzDegraded ? true : windowResult.readyz.degraded === 0),
    actual: {
      failures: windowResult.readyz.failures,
      degraded: windowResult.readyz.degraded,
      allow_readyz_degraded: options.allowReadyzDegraded,
    },
  });

  checks.push({
    name: 'max_5xx_rate',
    pass: windowResult.metrics.rate_5xx <= options.max5xxRate,
    actual: windowResult.metrics.rate_5xx,
    threshold: options.max5xxRate,
  });

  const baselineP95 = baselineResult?.metrics?.chat_p95_ms;
  const currentP95 = windowResult.metrics.chat_p95_ms;
  const p95Threshold =
    Number.isFinite(baselineP95) && baselineP95 > 0
      ? baselineP95 * (1 + options.maxChatP95Increase)
      : null;

  checks.push({
    name: 'chat_p95_vs_baseline',
    pass: p95Threshold === null || (Number.isFinite(currentP95) && currentP95 <= p95Threshold),
    actual: currentP95,
    baseline: baselineP95,
    threshold: p95Threshold,
  });

  checks.push({
    name: 'orchestrator_failed_per_min',
    pass: windowResult.metrics.orchestrator_failed_per_min <= options.maxOrchFailedPerMin,
    actual: windowResult.metrics.orchestrator_failed_per_min,
    threshold: options.maxOrchFailedPerMin,
  });

  checks.push({
    name: 'provider_errors_per_min',
    pass: windowResult.metrics.provider_errors_per_min <= options.maxProviderErrorsPerMin,
    actual: windowResult.metrics.provider_errors_per_min,
    threshold: options.maxProviderErrorsPerMin,
  });

  checks.push({
    name: 'auth_failures_per_min',
    pass: windowResult.metrics.auth_failures_per_min <= options.maxAuthFailuresPerMin,
    actual: windowResult.metrics.auth_failures_per_min,
    threshold: options.maxAuthFailuresPerMin,
  });

  return {
    ok: checks.every((check) => check.pass),
    checks,
  };
};

const printSummary = (label, report) => {
  console.log(`\n=== ${label} ===`);
  console.log(`Window: ${report.window.started_at} -> ${report.window.ended_at} (${report.window.window_sec}s)`);
  console.log(`API: ${report.window.api_base_url}`);
  console.log(`Modes observes: ${report.window.observed_modes.join(', ') || 'unknown'}`);
  console.log(`readyz failures: ${report.window.readyz.failures} | degraded: ${report.window.readyz.degraded}`);
  console.log(`5xx rate: ${(report.window.metrics.rate_5xx * 100).toFixed(2)}%`);
  console.log(`chat p95: ${report.window.metrics.chat_p95_ms ?? 'n/a'} ms`);
  console.log(`orchestrator failed/min: ${report.window.metrics.orchestrator_failed_per_min.toFixed(3)}`);
  console.log(`provider errors/min: ${report.window.metrics.provider_errors_per_min.toFixed(3)}`);
  console.log(`auth failures/min: ${report.window.metrics.auth_failures_per_min.toFixed(3)}`);
};

const run = async () => {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (options.help || !command) {
    console.log(HELP);
    process.exit(0);
  }

  if (!['baseline', 'evaluate'].includes(command)) {
    throw new Error(`Commande non supportee: ${command}`);
  }

  if (!Number.isFinite(options.durationSec) || options.durationSec < 1) {
    throw new Error('duration-sec doit etre >= 1');
  }

  if (!Number.isFinite(options.intervalSec) || options.intervalSec < 1) {
    throw new Error('interval-sec doit etre >= 1');
  }

  const windowResult = await collectWindow(options);

  if (command === 'baseline') {
    const baselineReport = {
      version: 1,
      kind: 'baseline',
      window: windowResult,
    };

    const outPath = options.out || options.baselineFile || DEFAULT_BASELINE_FILE;
    await writeJsonFile(outPath, baselineReport);
    printSummary('BASELINE', baselineReport);
    console.log(`Baseline ecrite: ${path.resolve(outPath)}`);
    return;
  }

  const baseline = await readJsonFile(options.baselineFile);
  const gate = evaluateGate(windowResult, baseline.window, options);

  const evaluationReport = {
    version: 1,
    kind: 'evaluation',
    baseline_file: path.resolve(options.baselineFile),
    baseline_window: baseline.window,
    window: windowResult,
    gate,
  };

  const outPath = options.out || DEFAULT_REPORT_FILE;
  await writeJsonFile(outPath, evaluationReport);

  printSummary('EVALUATION', evaluationReport);
  console.log('\nGate checks:');
  for (const check of gate.checks) {
    console.log(`- ${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
  }

  console.log(`\nRapport ecrit: ${path.resolve(outPath)}`);

  if (!gate.ok) {
    console.error('\nGO/NO-GO: NO-GO');
    process.exit(2);
  }

  console.log('\nGO/NO-GO: GO');
};

run().catch((error) => {
  console.error(`Erreur: ${error?.message || error}`);
  process.exit(1);
});
