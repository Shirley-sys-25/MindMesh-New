import { Router } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { authJwtMiddleware } from '../middleware/auth-jwt.js';
import { authorizeScope } from '../middleware/authorize-scope.js';
import { chatRateLimit } from '../middleware/rate-limit.js';
import { parseChatRequest } from '../schemas/chat.schema.js';
import { createLegacyChatStream } from '../services/openai.service.js';
import { invokeOrchestrator } from '../services/orchestrator-client.js';
import { recordChatRequest } from '../services/database.service.js';
import { decideOrchestrationPath } from '../services/orchestration-rollout.js';
import { recordOrchestratorCall, recordProviderError } from '../services/metrics.service.js';
import { AppError } from '../utils/errors.js';
import { closeSseWithDone, initSse, writeSseData, writeSseEvent } from '../utils/sse.js';

const streamLegacy = async (messages, res) => {
  const stream = await createLegacyChatStream(messages);
  let responseChars = 0;
  for await (const chunk of stream) {
    const content = chunk?.choices?.[0]?.delta?.content || '';
    if (!content) continue;
    responseChars += content.length;
    writeSseData(res, content);
  }
  return responseChars;
};

const streamChatHandler = async (req, res, next) => {
  let messages = [];
  let routingTarget = 'unknown';
  let persisted = false;

  const persistChat = ({ responseChars = 0, status = 'ok', errorCode = null } = {}) => {
    if (persisted) return;
    persisted = true;
    recordChatRequest({
      requestId: req.requestId,
      userSub: req.auth?.sub,
      mode: env.orchestrationMode,
      orchestrationPath: routingTarget,
      messages,
      responseChars,
      status,
      errorCode,
    });
  };

  try {
    ({ messages } = parseChatRequest(req.body));
    const routing = decideOrchestrationPath({
      mode: env.orchestrationMode,
      requestId: req.requestId,
      userSub: req.auth?.sub,
      crewaiPercent: env.orchestrationCrewaiPercent,
    });
    routingTarget = routing.target;

    res.setHeader('X-Orchestration-Path', routing.target);

    initSse(res, req.requestId);

    if (routing.target === 'legacy') {
      if (env.orchestrationMode !== 'legacy') {
        recordOrchestratorCall(env.orchestrationMode, 'rollout_legacy');
      }
      const responseChars = await streamLegacy(messages, res);
      persistChat({
        responseChars,
        status: 'ok',
      });
      closeSseWithDone(res);
      return;
    }

    try {
      const orchestrated = await invokeOrchestrator({
        messages,
        requestId: req.requestId,
        userSub: req.auth?.sub,
      });

      recordOrchestratorCall(env.orchestrationMode, 'ok');
      writeSseData(res, orchestrated.content);
      persistChat({
        responseChars: typeof orchestrated.content === 'string' ? orchestrated.content.length : 0,
        status: 'ok',
      });
      closeSseWithDone(res);
      return;
    } catch (orchestratorError) {
      recordOrchestratorCall(env.orchestrationMode, 'failed');
      logger.warn(
        {
          request_id: req.requestId,
          mode: env.orchestrationMode,
          error: orchestratorError.message,
        },
        'orchestrator_failed',
      );

      if (env.orchestrationMode === 'hybrid') {
        const responseChars = await streamLegacy(messages, res);
        recordOrchestratorCall(env.orchestrationMode, 'fallback_legacy');
        persistChat({
          responseChars,
          status: 'fallback_legacy',
          errorCode: orchestratorError?.code || 'ORCHESTRATOR_FAILED',
        });
        closeSseWithDone(res);
        return;
      }

      throw orchestratorError;
    }
  } catch (error) {
    recordProviderError('chat', error?.code || 'runtime_error');
    persistChat({
      responseChars: 0,
      status: 'error',
      errorCode: error?.code || 'CHAT_RUNTIME_ERROR',
    });

    if (res.headersSent) {
      writeSseEvent(res, 'error', 'Impossible de joindre le cerveau.');
      return res.end();
    }

    if (error instanceof AppError) return next(error);
    return next(new AppError(500, 'CHAT_RUNTIME_ERROR', 'Impossible de joindre le cerveau.'));
  }
};

export const chatRouter = Router();

chatRouter.post('/chat', authJwtMiddleware, authorizeScope('chat:write'), chatRateLimit, streamChatHandler);
