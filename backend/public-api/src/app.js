import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { chatRouter } from './routes/chat.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { transcribeRouter } from './routes/transcribe.routes.js';
import { metricsMiddleware } from './services/metrics.service.js';

const buildCorsOptions = () => {
  const allowed = new Set(env.corsAllowedOrigins);

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

  app.set('trust proxy', 1);
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
  app.use('/api', transcribeRouter);
  app.use('/', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
