import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const ORCHESTRATOR_HEALTH_PATH = '/internal/healthz';

export const checkOrchestratorHealth = async ({ requestId } = {}) => {
  if (!env.orchestratorUrl) {
    throw new AppError(503, 'ORCHESTRATOR_UNHEALTHY', 'ORCHESTRATOR_URL manquante.');
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(env.orchestratorTimeoutMs, 5000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${env.orchestratorUrl}${ORCHESTRATOR_HEALTH_PATH}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Request-Id': requestId || randomUUID(),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppError(503, 'ORCHESTRATOR_UNHEALTHY', `Orchestrateur indisponible (${response.status}).`);
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.status !== 'ok') {
      throw new AppError(503, 'ORCHESTRATOR_UNHEALTHY', 'Etat orchestrateur invalide.');
    }

    return { status: 'ok' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.name === 'AbortError') {
      throw new AppError(503, 'ORCHESTRATOR_UNHEALTHY', 'Timeout healthcheck orchestrateur.');
    }

    throw new AppError(503, 'ORCHESTRATOR_UNHEALTHY', 'Orchestrateur injoignable.');
  } finally {
    clearTimeout(timeout);
  }
};
