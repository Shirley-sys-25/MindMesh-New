import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { mintInternalToken } from './internal-auth.service.js';

const ORCHESTRATOR_PATH = '/internal/orchestrate';

export const invokeOrchestrator = async ({ messages, requestId, userSub }) => {
  if (!env.orchestratorUrl) {
    throw new AppError(500, 'ORCHESTRATOR_CONFIG_MISSING', 'ORCHESTRATOR_URL manquante.', { expose: false });
  }

  const token = await mintInternalToken({
    userSub,
    requestId,
    scope: 'orchestrate:invoke',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.orchestratorTimeoutMs);

  try {
    const response = await fetch(`${env.orchestratorUrl}${ORCHESTRATOR_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(502, 'ORCHESTRATOR_BAD_RESPONSE', `Orchestrateur indisponible (${response.status})`, {
        details: text.slice(0, 250),
      });
    }

    const data = await response.json();
    if (!data || typeof data.content !== 'string' || !data.content.trim()) {
      throw new AppError(502, 'ORCHESTRATOR_INVALID_PAYLOAD', 'Reponse orchestrateur invalide.');
    }

    return {
      content: data.content,
      metadata: data.metadata || {},
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.name === 'AbortError') {
      throw new AppError(504, 'ORCHESTRATOR_TIMEOUT', 'Timeout orchestrateur.');
    }
    throw new AppError(502, 'ORCHESTRATOR_UNREACHABLE', 'Orchestrateur injoignable.');
  } finally {
    clearTimeout(timeout);
  }
};
