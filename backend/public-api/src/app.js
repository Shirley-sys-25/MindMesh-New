import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { chatRouter } from './routes/chat.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { voiceRouter } from './routes/voice.routes.js';
import { transcribeRouter } from './routes/transcribe.routes.js';
import { metricsMiddleware } from './services/metrics.service.js';

const buildCorsOptions = () => {
  const rawAllowedOrigins = typeof process.env.CORS_ALLOWED_ORIGINS === 'string' ? process.env.CORS_ALLOWED_ORIGINS : '';
  const allowed = new Set(
    rawAllowedOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (allowed.size === 0 && !env.isProd) {
    env.corsAllowedOrigins.forEach((origin) => allowed.add(origin));
  }

  return {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
  };
};

export const createApp = () => {
  const app = express();
  const frontendDistPath = fileURLToPath(new URL('../../../dist', import.meta.url));
  const frontendIndexPath = path.join(frontendDistPath, 'index.html');
  const hasFrontendBuild = existsSync(frontendIndexPath);

  app.set('trust proxy', env.trustProxyLevel);
  app.use(requestIdMiddleware);

  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({
        request_id: req.requestId,
      }),
      customSuccessMessage: () => 'request_completed',
      customErrorMessage: () => 'request_failed',
    }),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use(metricsMiddleware);

  app.use('/api', chatRouter);
  app.use('/api/voice', voiceRouter);
  app.use('/api', transcribeRouter);
  app.use('/', healthRouter);

  if (hasFrontendBuild) {
    app.use(express.static(frontendDistPath, { index: false }));
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!req.accepts('html')) return next();
      return res.sendFile(frontendIndexPath);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
