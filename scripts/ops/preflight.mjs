#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const HELP = `Usage:
  node scripts/ops/preflight.mjs [options]

Options:
  --env-file <path>            Path to env file (default: .env)
  --require-prod-flags         Enforce strict production auth flags
  --expected-mode <mode>       Validate ORCHESTRATION_MODE (legacy|hybrid|crewai)
  --help                       Show this help
`;

const parseArgs = (argv) => {
  const options = {
    envFile: '.env',
    requireProdFlags: false,
    expectedMode: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const [rawKey, explicitValue] = token.split('=');
    const key = rawKey.slice(2);
    const value = explicitValue ?? argv[index + 1];

    const consume = () => {
      if (explicitValue === undefined) index += 1;
      return value;
    };

    if (key === 'help') {
      options.help = true;
      continue;
    }

    if (key === 'env-file') {
      options.envFile = consume();
      continue;
    }

    if (key === 'require-prod-flags') {
      options.requireProdFlags = true;
      continue;
    }

    if (key === 'expected-mode') {
      options.expectedMode = consume();
      continue;
    }

    throw new Error(`Option non reconnue: --${key}`);
  }

  return options;
};

const normalizeBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseEnvFile = async (envFile) => {
  const absolute = path.resolve(envFile);
  const raw = await readFile(absolute, 'utf8');
  return {
    absolute,
    values: dotenv.parse(raw),
  };
};

const check = (name, pass, detail) => ({ name, pass, detail });

const runChecks = (values, options) => {
  const checks = [];

  const mode = (values.ORCHESTRATION_MODE || '').trim().toLowerCase();
  checks.push(
    check(
      'orchestration_mode_valid',
      ['legacy', 'hybrid', 'crewai'].includes(mode),
      `ORCHESTRATION_MODE=${values.ORCHESTRATION_MODE || ''}`,
    ),
  );

  if (options.expectedMode) {
    checks.push(
      check(
        'orchestration_mode_expected',
        mode === String(options.expectedMode).trim().toLowerCase(),
        `expected=${options.expectedMode}, actual=${mode || 'empty'}`,
      ),
    );
  }

  const commonRequired = [
    'OPENAI_API_KEY',
    'ORCHESTRATOR_URL',
    'INTERNAL_AUTH_SHARED_SECRETS',
    'CORS_ALLOWED_ORIGINS',
  ];

  for (const key of commonRequired) {
    checks.push(check(`required_${key}`, Boolean(String(values[key] || '').trim()), `${key}=${values[key] ? 'set' : 'missing'}`));
  }

  if (mode === 'hybrid' || mode === 'crewai') {
    checks.push(
      check(
        'internal_auth_secrets_count',
        String(values.INTERNAL_AUTH_SHARED_SECRETS || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean).length >= 2,
        'INTERNAL_AUTH_SHARED_SECRETS must contain at least 2 comma-separated secrets',
      ),
    );
  }

  const orchestratorEngine = (values.ORCHESTRATOR_ENGINE || 'auto').trim().toLowerCase();
  checks.push(
    check(
      'orchestrator_engine_valid',
      ['auto', 'crewai', 'skeleton'].includes(orchestratorEngine),
      `ORCHESTRATOR_ENGINE=${values.ORCHESTRATOR_ENGINE || 'auto'}`,
    ),
  );

  const databaseEnabled = normalizeBool(values.DATABASE_ENABLED ?? 'true');
  checks.push(
    check(
      'database_url_required_when_enabled',
      !databaseEnabled || Boolean(String(values.DATABASE_URL || '').trim()),
      `DATABASE_ENABLED=${values.DATABASE_ENABLED ?? 'true'}, DATABASE_URL=${values.DATABASE_URL ? 'set' : 'missing'}`,
    ),
  );

  const initRetries = parsePositiveInt(values.DATABASE_INIT_MAX_RETRIES);
  checks.push(
    check(
      'database_init_retries_valid',
      values.DATABASE_INIT_MAX_RETRIES === undefined || values.DATABASE_INIT_MAX_RETRIES === '' || initRetries !== null,
      `DATABASE_INIT_MAX_RETRIES=${values.DATABASE_INIT_MAX_RETRIES || 'default(3)'}`,
    ),
  );

  const initRetryMs = parsePositiveInt(values.DATABASE_INIT_RETRY_MS);
  checks.push(
    check(
      'database_init_retry_ms_valid',
      values.DATABASE_INIT_RETRY_MS === undefined || values.DATABASE_INIT_RETRY_MS === '' || (initRetryMs !== null && initRetryMs >= 100),
      `DATABASE_INIT_RETRY_MS=${values.DATABASE_INIT_RETRY_MS || 'default(1500)'}`,
    ),
  );

  const retentionDays = parsePositiveInt(values.DB_LOG_RETENTION_DAYS);
  checks.push(
    check(
      'db_log_retention_days_valid',
      values.DB_LOG_RETENTION_DAYS === undefined || values.DB_LOG_RETENTION_DAYS === '' || retentionDays !== null,
      `DB_LOG_RETENTION_DAYS=${values.DB_LOG_RETENTION_DAYS || 'default(90)'}`,
    ),
  );

  const retentionIntervalMin = parsePositiveInt(values.DB_RETENTION_CLEANUP_INTERVAL_MIN);
  checks.push(
    check(
      'db_retention_cleanup_interval_min_valid',
      values.DB_RETENTION_CLEANUP_INTERVAL_MIN === undefined ||
        values.DB_RETENTION_CLEANUP_INTERVAL_MIN === '' ||
        retentionIntervalMin !== null,
      `DB_RETENTION_CLEANUP_INTERVAL_MIN=${values.DB_RETENTION_CLEANUP_INTERVAL_MIN || 'default(360)'}`,
    ),
  );

  if (options.requireProdFlags) {
    checks.push(
      check('auth_required_true', normalizeBool(values.AUTH_REQUIRED), `AUTH_REQUIRED=${values.AUTH_REQUIRED || ''}`),
    );
    checks.push(
      check('auth_bypass_false', !normalizeBool(values.AUTH_BYPASS), `AUTH_BYPASS=${values.AUTH_BYPASS || ''}`),
    );
    checks.push(
      check('auth_strict_scopes_true', normalizeBool(values.AUTH_STRICT_SCOPES), `AUTH_STRICT_SCOPES=${values.AUTH_STRICT_SCOPES || ''}`),
    );

    for (const key of ['AUTH_JWKS_URI', 'AUTH_ISSUER', 'AUTH_AUDIENCE']) {
      checks.push(check(`required_${key}`, Boolean(String(values[key] || '').trim()), `${key}=${values[key] ? 'set' : 'missing'}`));
    }

    checks.push(
      check('database_enabled_true', databaseEnabled, `DATABASE_ENABLED=${values.DATABASE_ENABLED ?? 'true'}`),
    );

    checks.push(
      check(
        'internal_auth_secrets_rotation_ready',
        String(values.INTERNAL_AUTH_SHARED_SECRETS || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean).length >= 2,
        'INTERNAL_AUTH_SHARED_SECRETS must contain at least 2 comma-separated secrets',
      ),
    );
  }

  return checks;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);
    return;
  }

  const { absolute, values } = await parseEnvFile(options.envFile);
  const checks = runChecks(values, options);
  const failed = checks.filter((item) => !item.pass);

  const report = {
    env_file: absolute,
    mode: (values.ORCHESTRATION_MODE || '').trim().toLowerCase() || 'unknown',
    passed: failed.length === 0,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exit(2);
  }
};

export { parseArgs, normalizeBool, runChecks };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(`Erreur preflight: ${error?.message || error}`);
    process.exit(1);
  });
}
