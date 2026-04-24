import assert from 'node:assert/strict';
import test from 'node:test';
import { runChecks } from './preflight.mjs';

const byName = (checks, name) => checks.find((item) => item.name === name);

test('preflight passes with valid baseline config', () => {
  const checks = runChecks(
    {
      ORCHESTRATION_MODE: 'hybrid',
      OPENAI_API_KEY: 'x',
      ORCHESTRATOR_URL: 'http://localhost:8081',
      INTERNAL_AUTH_SHARED_SECRETS: 's1,s2',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      ORCHESTRATOR_ENGINE: 'auto',
      DATABASE_ENABLED: 'true',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      DATABASE_INIT_MAX_RETRIES: '3',
      DATABASE_INIT_RETRY_MS: '1500',
      DB_LOG_RETENTION_DAYS: '90',
      DB_RETENTION_CLEANUP_INTERVAL_MIN: '360',
    },
    {
      requireProdFlags: false,
      expectedMode: null,
    },
  );

  assert.equal(byName(checks, 'orchestrator_engine_valid')?.pass, true);
  assert.equal(byName(checks, 'database_url_required_when_enabled')?.pass, true);
  assert.equal(byName(checks, 'database_init_retries_valid')?.pass, true);
  assert.equal(byName(checks, 'db_log_retention_days_valid')?.pass, true);
});

test('preflight fails on invalid db and engine config', () => {
  const checks = runChecks(
    {
      ORCHESTRATION_MODE: 'hybrid',
      OPENAI_API_KEY: 'x',
      ORCHESTRATOR_URL: 'http://localhost:8081',
      INTERNAL_AUTH_SHARED_SECRETS: 's1,s2',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      ORCHESTRATOR_ENGINE: 'invalid',
      DATABASE_ENABLED: 'true',
      DATABASE_URL: '',
      DATABASE_INIT_MAX_RETRIES: '0',
      DATABASE_INIT_RETRY_MS: 'abc',
      DB_LOG_RETENTION_DAYS: '-10',
      DB_RETENTION_CLEANUP_INTERVAL_MIN: '0',
    },
    {
      requireProdFlags: false,
      expectedMode: null,
    },
  );

  assert.equal(byName(checks, 'orchestrator_engine_valid')?.pass, false);
  assert.equal(byName(checks, 'database_url_required_when_enabled')?.pass, false);
  assert.equal(byName(checks, 'database_init_retries_valid')?.pass, false);
  assert.equal(byName(checks, 'database_init_retry_ms_valid')?.pass, false);
  assert.equal(byName(checks, 'db_log_retention_days_valid')?.pass, false);
  assert.equal(byName(checks, 'db_retention_cleanup_interval_min_valid')?.pass, false);
});

test('preflight enforces prod flags', () => {
  const checks = runChecks(
    {
      ORCHESTRATION_MODE: 'crewai',
      OPENAI_API_KEY: 'x',
      ORCHESTRATOR_URL: 'http://localhost:8081',
      INTERNAL_AUTH_SHARED_SECRETS: 'single-secret',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      DATABASE_ENABLED: 'false',
      AUTH_REQUIRED: 'false',
      AUTH_BYPASS: 'true',
      AUTH_STRICT_SCOPES: 'false',
      AUTH_JWKS_URI: '',
      AUTH_ISSUER: '',
      AUTH_AUDIENCE: '',
    },
    {
      requireProdFlags: true,
      expectedMode: 'crewai',
    },
  );

  assert.equal(byName(checks, 'auth_required_true')?.pass, false);
  assert.equal(byName(checks, 'auth_bypass_false')?.pass, false);
  assert.equal(byName(checks, 'database_enabled_true')?.pass, false);
  assert.equal(byName(checks, 'internal_auth_secrets_rotation_ready')?.pass, false);
});
