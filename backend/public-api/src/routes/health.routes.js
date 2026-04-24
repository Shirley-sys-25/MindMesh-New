import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseReadiness, getDatabasePublicStatus } from '../services/database.service.js';
import { metricsRegistry } from '../services/metrics.service.js';
import { checkOrchestratorHealth } from '../services/orchestrator-health.service.js';

export const healthRouter = Router();

const secureEquals = (left, right) => {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const parseBearer = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return '';
  const [scheme, token] = authorizationHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return '';
  return token.trim();
};

const metricsAuthMiddleware = (req, res, next) => {
  const bearerToken = parseBearer(req.headers.authorization);
  const headerSecret = typeof req.headers['x-metrics-secret'] === 'string' ? req.headers['x-metrics-secret'].trim() : '';

  const hasMetricsAdminToken = Boolean(env.metricsAdminToken);
  const hasMetricsHeaderSecret = Boolean(env.metricsHeaderSecret);

  const isBearerAllowed = hasMetricsAdminToken && secureEquals(bearerToken, env.metricsAdminToken);
  const isHeaderAllowed = hasMetricsHeaderSecret && secureEquals(headerSecret, env.metricsHeaderSecret);

  if (isBearerAllowed || isHeaderAllowed) return next();

  return res.status(401).json({
    error: {
      code: 'METRICS_UNAUTHORIZED',
      message: 'Acces metrics non autorise.',
      request_id: req.requestId || 'unknown',
    },
  });
};

healthRouter.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    database: getDatabasePublicStatus(),
  });
});

healthRouter.get('/readyz', async (req, res) => {
  const databaseReadiness = await checkDatabaseReadiness();
  if (!databaseReadiness.ready) {
    return res.status(503).json({
      status: 'degraded',
      mode: env.orchestrationMode,
      reason: 'DATABASE_UNHEALTHY',
      database: getDatabasePublicStatus(),
    });
  }

  if (!env.openaiApiKey) {
    return res.status(503).json({
      status: 'degraded',
      mode: env.orchestrationMode,
      reason: 'OPENAI_API_KEY manquante',
      database: getDatabasePublicStatus(),
    });
  }

  if (env.orchestrationMode === 'crewai') {
    try {
      await checkOrchestratorHealth({ requestId: req.requestId });
    } catch (error) {
      return res.status(503).json({
        status: 'degraded',
        mode: env.orchestrationMode,
        reason: error?.code || 'ORCHESTRATOR_UNHEALTHY',
        database: getDatabasePublicStatus(),
      });
    }
  }

  if (env.orchestrationMode === 'hybrid') {
    try {
      await checkOrchestratorHealth({ requestId: req.requestId });
    } catch {
      return res.status(200).json({
        status: 'ready',
        mode: env.orchestrationMode,
        degraded: true,
        reason: 'ORCHESTRATOR_UNHEALTHY_FALLBACK_ACTIVE',
        database: getDatabasePublicStatus(),
      });
    }
  }

  return res.json({
    status: 'ready',
    mode: env.orchestrationMode,
    database: getDatabasePublicStatus(),
  });
});

healthRouter.get('/metrics', metricsAuthMiddleware, async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
});
