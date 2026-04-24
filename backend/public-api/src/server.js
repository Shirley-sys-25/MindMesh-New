import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeDatabase, initializeDatabase } from './services/database.service.js';

const app = createApp();

const databaseStatus = await initializeDatabase();

if (env.databaseEnabled && !databaseStatus.enabled) {
  logger.warn(
    {
      database_status: databaseStatus.status,
      database_error: databaseStatus.error,
    },
    'database_not_ready_on_startup',
  );
}

const server = app.listen(env.port, () => {
  logger.info(
    {
      port: env.port,
      mode: env.orchestrationMode,
      model: env.openaiModel,
    },
    'mindmesh_public_api_started',
  );
});

let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'mindmesh_public_api_stopping');

  const forceExitTimer = setTimeout(() => {
    logger.error({ signal }, 'mindmesh_public_api_force_exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error, signal }, 'mindmesh_public_api_close_failed');
    }

    await closeDatabase();

    logger.info({ signal }, 'mindmesh_public_api_stopped');
    process.exit(error ? 1 : 0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
