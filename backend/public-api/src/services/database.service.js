import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runDatabaseMigrations } from './db-migrations.service.js';
import { startDbRetentionScheduler, stopDbRetentionScheduler } from './db-retention.service.js';

const state = {
  initialized: false,
  initializing: false,
  initPromise: null,
  enabled: false,
  initError: null,
  pool: null,
  target: null,
};

const clampText = (value, max = 400) => {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  return compact.length > max ? compact.slice(0, max) + '...' : compact;
};

const toNonNegativeInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const redactDatabaseUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return 'postgresql://[invalid-connection-string]';
  }
};

const isReady = () => state.enabled && Boolean(state.pool);

const closePool = async (pool) => {
  if (!pool) return;
  try {
    await pool.end();
  } catch {
    // noop
  }
};

const getPublicDatabaseState = () => {
  if (!env.databaseEnabled) return 'disabled';
  if (state.enabled && state.pool) return 'ready';
  if (state.initializing) return 'initializing';
  if (state.initError) return 'error';
  return 'initializing';
};

export const initializeDatabase = async () => {
  if (!env.databaseEnabled) {
    const previousPool = state.pool;
    state.initialized = true;
    state.initializing = false;
    state.initPromise = null;
    state.pool = null;
    state.enabled = false;
    state.target = null;
    state.initError = null;
    stopDbRetentionScheduler();
    await closePool(previousPool);
    logger.info({ database_enabled: false }, 'database_disabled');
    return getDatabaseStatus();
  }

  if (isReady()) return getDatabaseStatus();
  if (state.initPromise) return state.initPromise;

  state.initialized = true;
  state.initializing = true;
  state.target = redactDatabaseUrl(env.databaseUrl);

  const previousPool = state.pool;
  state.pool = null;
  state.enabled = false;
  stopDbRetentionScheduler();
  await closePool(previousPool);

  state.initPromise = (async () => {
    let lastError = null;

    for (let attempt = 1; attempt <= env.databaseInitMaxRetries; attempt += 1) {
      let pool;

      try {
        pool = new Pool({
          connectionString: env.databaseUrl,
          ssl: env.databaseSsl ? { rejectUnauthorized: true } : false,
        });

        await pool.query('SELECT 1');
        await runDatabaseMigrations(pool);

        await closePool(state.pool);
        state.pool = pool;
        state.enabled = true;
        state.initError = null;
        startDbRetentionScheduler(pool);

        logger.info(
          {
            database_url: state.target,
            database_ssl: env.databaseSsl,
            attempt,
          },
          'database_initialized',
        );

        return getDatabaseStatus();
      } catch (error) {
        lastError = error;
        state.pool = null;
        state.enabled = false;
        state.initError = error?.message || String(error);
        await closePool(pool);

        logger.warn(
          {
            err: error,
            attempt,
            max_attempts: env.databaseInitMaxRetries,
            retry_ms: env.databaseInitRetryMs,
          },
          'database_initialization_attempt_failed',
        );

        if (attempt < env.databaseInitMaxRetries) {
          await sleep(env.databaseInitRetryMs);
        }
      }
    }

    logger.error(
      {
        err: lastError,
        max_attempts: env.databaseInitMaxRetries,
      },
      'database_initialization_failed',
    );

    return getDatabaseStatus();
  })().finally(() => {
    state.initializing = false;
    state.initPromise = null;
  });

  return state.initPromise;
};

export const getDatabaseStatus = () => ({
  enabled: state.enabled,
  initialized: state.initialized,
  initializing: state.initializing,
  status: getPublicDatabaseState(),
  path: state.target,
  error: state.initError,
});

export const getDatabasePublicStatus = () => {
  const status = getPublicDatabaseState();
  return {
    enabled: state.enabled,
    initialized: state.initialized,
    status,
    error: status === 'error' ? state.initError : null,
  };
};

export const checkDatabaseReadiness = async () => {
  if (!env.databaseEnabled) {
    return {
      ready: true,
      status: 'disabled',
      error: null,
    };
  }

  if (!isReady()) {
    await initializeDatabase();
  }

  const pool = state.pool;
  if (!pool) {
    return {
      ready: false,
      status: 'error',
      error: state.initError || 'DATABASE_NOT_READY',
    };
  }

  try {
    await pool.query('SELECT 1');
    state.enabled = true;
    state.initError = null;
    return {
      ready: true,
      status: 'ready',
      error: null,
    };
  } catch (error) {
    state.enabled = false;
    state.initError = error?.message || String(error);
    logger.warn({ err: error }, 'database_readiness_failed');
    return {
      ready: false,
      status: 'error',
      error: state.initError,
    };
  }
};

export const closeDatabase = async () => {
  stopDbRetentionScheduler();
  const pool = state.pool;
  state.pool = null;
  state.enabled = false;
  if (!pool) return;
  await closePool(pool);
  logger.info('database_pool_closed');
};

export const recordChatRequest = ({
  requestId,
  userSub,
  mode,
  orchestrationPath,
  messages,
  responseChars = 0,
  status = 'ok',
  errorCode = null,
}) => {
  if (!isReady()) return;

  const pool = state.pool;
  if (!pool) return;

  const messageList = Array.isArray(messages) ? messages : [];
  const lastUserMessage = [...messageList].reverse().find((item) => item?.role === 'user');
  const promptPreview = clampText(lastUserMessage?.content || '');

  void pool
    .query(
      `INSERT INTO chat_requests
      (request_id, user_sub, mode, orchestration_path, message_count, prompt_preview, response_chars, status, error_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        requestId || null,
        userSub || null,
        String(mode || 'unknown'),
        String(orchestrationPath || 'unknown'),
        messageList.length,
        promptPreview || null,
        toNonNegativeInt(responseChars),
        String(status || 'unknown'),
        errorCode ? String(errorCode) : null,
      ],
    )
    .catch((error) => {
      logger.warn({ err: error, request_id: requestId }, 'database_record_chat_failed');
    });
};

export const recordTranscribeRequest = ({
  requestId,
  userSub,
  mimeType,
  fileSize,
  textChars = 0,
  status = 'ok',
  errorCode = null,
}) => {
  if (!isReady()) return;

  const pool = state.pool;
  if (!pool) return;

  void pool
    .query(
      `INSERT INTO transcribe_requests
      (request_id, user_sub, mime_type, file_size, text_chars, status, error_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        requestId || null,
        userSub || null,
        mimeType ? String(mimeType) : null,
        toNonNegativeInt(fileSize),
        toNonNegativeInt(textChars),
        String(status || 'unknown'),
        errorCode ? String(errorCode) : null,
      ],
    )
    .catch((error) => {
      logger.warn({ err: error, request_id: requestId }, 'database_record_transcribe_failed');
    });
};
