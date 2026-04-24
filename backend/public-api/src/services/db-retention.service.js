import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const TABLES = ['chat_requests', 'transcribe_requests'];

let cleanupTimer = null;

const retentionIntervalMs = () => Math.max(60_000, env.dbRetentionCleanupIntervalMin * 60_000);

const pruneTable = async (pool, tableName) => {
  const query = `DELETE FROM ${tableName} WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`;
  const result = await pool.query(query, [env.dbLogRetentionDays]);
  return Number(result?.rowCount || 0);
};

export const runDbRetentionOnce = async (pool) => {
  if (!pool) return { deleted: 0 };

  let deleted = 0;
  for (const tableName of TABLES) {
    deleted += await pruneTable(pool, tableName);
  }

  if (deleted > 0) {
    logger.info({ deleted, retention_days: env.dbLogRetentionDays }, 'db_retention_pruned_rows');
  }

  return { deleted };
};

export const startDbRetentionScheduler = (pool) => {
  if (!pool) return;
  if (cleanupTimer) return;

  const runAndLog = async () => {
    try {
      await runDbRetentionOnce(pool);
    } catch (error) {
      logger.warn({ err: error }, 'db_retention_cleanup_failed');
    }
  };

  void runAndLog();
  cleanupTimer = setInterval(runAndLog, retentionIntervalMs());
  cleanupTimer.unref?.();

  logger.info(
    {
      retention_days: env.dbLogRetentionDays,
      interval_min: env.dbRetentionCleanupIntervalMin,
    },
    'db_retention_scheduler_started',
  );
};

export const stopDbRetentionScheduler = () => {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
  logger.info('db_retention_scheduler_stopped');
};
