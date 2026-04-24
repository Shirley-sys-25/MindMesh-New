import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { importFresh } from './helpers/load-module.js';

const retentionServicePath = path.resolve(process.cwd(), 'backend/public-api/src/services/db-retention.service.js');
const envPath = path.resolve(process.cwd(), 'backend/public-api/src/config/env.js');

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

test('db retention deletes rows on both tables', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (String(sql).includes('chat_requests')) return { rowCount: 2 };
      if (String(sql).includes('transcribe_requests')) return { rowCount: 3 };
      return { rowCount: 0 };
    },
  };

  await withEnvPatch({ dbLogRetentionDays: 45 }, async () => {
    const retention = await importFresh(retentionServicePath);
    const result = await retention.runDbRetentionOnce(pool);

    assert.equal(result.deleted, 5);
    assert.equal(queries.length, 2);
    assert.equal(queries[0].params[0], 45);
    assert.equal(queries[1].params[0], 45);
  });
});

test('db retention scheduler triggers immediate cleanup', async () => {
  let callCount = 0;
  const pool = {
    query: async () => {
      callCount += 1;
      return { rowCount: 0 };
    },
  };

  await withEnvPatch({ dbLogRetentionDays: 90, dbRetentionCleanupIntervalMin: 1 }, async () => {
    const retention = await importFresh(retentionServicePath);
    retention.startDbRetentionScheduler(pool);

    await new Promise((resolve) => setTimeout(resolve, 30));
    retention.stopDbRetentionScheduler();

    assert.ok(callCount >= 2);
  });
});
