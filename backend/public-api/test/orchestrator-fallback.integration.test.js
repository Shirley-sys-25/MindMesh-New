import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import { importFresh } from './helpers/load-module.js';

const appPath = path.resolve(process.cwd(), 'backend/public-api/src/app.js');
const envPath = path.resolve(process.cwd(), 'backend/public-api/src/config/env.js');
const loggerPath = path.resolve(process.cwd(), 'backend/public-api/src/config/logger.js');

process.env.AUTH_REQUIRED = 'false';
process.env.AUTH_BYPASS = 'true';
process.env.DATABASE_ENABLED = 'false';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.INTERNAL_AUTH_SHARED_SECRETS =
  process.env.INTERNAL_AUTH_SHARED_SECRETS || 'test-secret-1,test-secret-2';
process.env.METRICS_HEADER_SECRET = process.env.METRICS_HEADER_SECRET || 'test-metrics-secret';
process.env.ORCHESTRATION_MODE = process.env.ORCHESTRATION_MODE || 'hybrid';
process.env.ORCHESTRATION_CREWAI_PERCENT = process.env.ORCHESTRATION_CREWAI_PERCENT || '100';

const makeApp = async () => {
  const module = await importFresh(appPath);
  return module.createApp();
};

const withEnvPatch = async (patch, callback) => {
  const envModule = await import(pathToFileURL(envPath).href);
  const previous = {};

  for (const [key, value] of Object.entries(patch)) {
    previous[key] = envModule.env[key];
    envModule.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      envModule.env[key] = value;
    }
  }
};

const withMockedFetch = async (mockImpl, callback) => {
  const previousFetch = global.fetch;
  global.fetch = mockImpl;

  try {
    await callback();
  } finally {
    global.fetch = previousFetch;
  }
};

const withLoggerWarnSpy = async (callback) => {
  const loggerModule = await import(pathToFileURL(loggerPath).href);
  const previousWarn = loggerModule.logger.warn;
  const warnings = [];

  loggerModule.logger.warn = (...args) => {
    warnings.push(args);
  };

  try {
    await callback({ warnings });
  } finally {
    loggerModule.logger.warn = previousWarn;
  }
};

const buildOpenAiSseResponse = (chunks, model = 'gpt-5.5') => {
  const payload = [
    ...chunks.map(
      (content) =>
        `data: ${JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        })}\n\n`,
    ),
    `data: ${JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');

  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
};

const buildOrchestratorSseResponse = () => {
  const sseEvent = (eventName, payload) => {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return `event: ${eventName}\n${String(serialized)
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n')}\n\n`;
  };

  const payload = [
    sseEvent('agent_status', { agent: 'africonnect', status: 'working' }),
    sseEvent('message', 'Cadrage initial.'),
    sseEvent('agent_status', { agent: 'africonnect', status: 'idle' }),
    sseEvent('agent_status', { agent: 'analyste_marche', status: 'working' }),
    sseEvent('message', 'Plan en 3 etapes.'),
    sseEvent('agent_status', { agent: 'analyste_marche', status: 'idle' }),
    sseEvent('agent_status', { agent: 'stratege_seo', status: 'working' }),
    sseEvent('message', 'Strategie finale.'),
    sseEvent('agent_status', { agent: 'stratege_seo', status: 'idle' }),
    'event: done\ndata: [DONE]\n\n',
  ].join('');

  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const metricValue = (metricsText, metricName, labels) => {
  const labelText = Object.entries(labels)
    .map(([key, value]) => `${key}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
  const pattern = new RegExp(`^${escapeRegex(metricName)}\\{${escapeRegex(labelText)}\\} ([0-9]+(?:\\.[0-9]+)?)$`, 'm');
  const match = metricsText.match(pattern);
  return match ? Number(match[1]) : 0;
};

const fetchMetrics = async (app) => {
  const response = await request(app).get('/metrics').set('X-Metrics-Secret', 'test-metrics-secret');
  assert.equal(response.status, 200);
  return response.text;
};

test('POST /api/chat hybrid: orchestrateur nominal retourne un flux valide', { concurrency: false }, async () => {
  await withEnvPatch(
    {
      orchestrationMode: 'hybrid',
      orchestrationCrewaiPercent: 100,
      openaiApiKey: 'test-openai-key',
    },
    async () => {
      const app = await makeApp();

      await withMockedFetch(
        async (url) => {
          const target = String(url);

          if (target.includes('/internal/orchestrate/stream')) {
            return buildOrchestratorSseResponse();
          }

          throw new Error(`unexpected fetch target: ${target}`);
        },
        async () => {
          const response = await request(app)
            .post('/api/chat')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'Prépare le plan.' }] });

          assert.equal(response.status, 200);
          assert.equal(response.headers['x-orchestration-path'], 'orchestrator');
          assert.match(response.text, /event: agent_status/);
          assert.match(response.text, /data: Cadrage initial\./);
          assert.match(response.text, /data: Strategie finale\./);
          assert.match(response.text, /event: done/);
        },
      );
    },
  );
});

test('POST /api/chat hybrid: panne orchestrateur => fallback legacy réussi', { concurrency: false }, async () => {
  await withEnvPatch(
    {
      orchestrationMode: 'hybrid',
      orchestrationCrewaiPercent: 100,
      openaiApiKey: 'test-openai-key',
    },
    async () => {
      const app = await makeApp();

      await withMockedFetch(
        async (url) => {
          const target = String(url);

          if (target.includes('/internal/orchestrate/stream')) {
            return new Response('boom', {
              status: 500,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }

          if (target.includes('/chat/completions')) {
            return buildOpenAiSseResponse(['Flux de secours.']);
          }

          throw new Error(`unexpected fetch target: ${target}`);
        },
        async () => {
          const response = await request(app)
            .post('/api/chat')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'Prépare le plan.' }] });

          assert.equal(response.status, 200);
          assert.equal(response.headers['x-orchestration-path'], 'orchestrator');
          assert.match(response.text, /data: Flux de secours\./);
          assert.match(response.text, /event: done/);
        },
      );
    },
  );
});

test('POST /api/chat hybrid: fallback journalise le request_id et incrémente Prometheus', { concurrency: false }, async () => {
  await withEnvPatch(
    {
      orchestrationMode: 'hybrid',
      orchestrationCrewaiPercent: 100,
      openaiApiKey: 'test-openai-key',
    },
    async () => {
      const app = await makeApp();

      await withMockedFetch(
        async (url) => {
          const target = String(url);

          if (target.includes('/internal/orchestrate/stream')) {
            return new Response('boom', {
              status: 500,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }

          if (target.includes('/chat/completions')) {
            return buildOpenAiSseResponse(['Flux de secours observabilité.']);
          }

          throw new Error(`unexpected fetch target: ${target}`);
        },
        async () => {
          await withLoggerWarnSpy(async ({ warnings }) => {
            const beforeMetrics = await fetchMetrics(app);
            const beforeFailed = metricValue(beforeMetrics, 'mindmesh_orchestrator_calls_total', {
              mode: 'hybrid',
              status: 'failed',
            });
            const beforeFallback = metricValue(beforeMetrics, 'mindmesh_orchestrator_calls_total', {
              mode: 'hybrid',
              status: 'fallback_legacy',
            });

            const response = await request(app)
              .post('/api/chat')
              .set('Content-Type', 'application/json')
              .send({ messages: [{ role: 'user', content: 'Prépare le plan.' }] });

            assert.equal(response.status, 200);
            assert.match(response.text, /data: Flux de secours observabilité\./);

            const afterMetrics = await fetchMetrics(app);
            const afterFailed = metricValue(afterMetrics, 'mindmesh_orchestrator_calls_total', {
              mode: 'hybrid',
              status: 'failed',
            });
            const afterFallback = metricValue(afterMetrics, 'mindmesh_orchestrator_calls_total', {
              mode: 'hybrid',
              status: 'fallback_legacy',
            });

            assert.equal(afterFailed, beforeFailed + 1);
            assert.equal(afterFallback, beforeFallback + 1);

            const warningEntry = warnings.find((entry) => entry[1] === 'orchestrator_failed');
            assert.ok(warningEntry, 'expected orchestrator_failed warning to be emitted');
            assert.equal(warningEntry[0].request_id, response.headers['x-request-id']);
            assert.equal(warningEntry[0].mode, 'hybrid');
            assert.match(warningEntry[0].error, /Orchestrateur indisponible|Orchestrateur injoignable/);
          });
        },
      );
    },
  );
});
