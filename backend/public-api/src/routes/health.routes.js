import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseReadiness, getDatabasePublicStatus } from '../services/database.service.js';
import { metricsRegistry } from '../services/metrics.service.js';
import { checkOrchestratorHealth } from '../services/orchestrator-health.service.js';

export const healthRouter = Router();

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

healthRouter.get('/metrics', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
});
