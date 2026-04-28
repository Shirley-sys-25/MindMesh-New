import { Router } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { authJwtMiddleware } from '../middleware/auth-jwt.js';
import { authorizeScope } from '../middleware/authorize-scope.js';
import { chatRateLimit } from '../middleware/rate-limit.js';
import { parseChatRequest } from '../schemas/chat.schema.js';
import { createLegacyChatStream } from '../services/openai.service.js';
import { invokeOrchestrator } from '../services/orchestrator-client.js';
import { getChatHistory, recordChatRequest } from '../services/database.service.js';
import { decideOrchestrationPath } from '../services/orchestration-rollout.js';
import { recordOrchestratorCall, recordProviderError } from '../services/metrics.service.js';
import { AppError } from '../utils/errors.js';
import { closeSseWithDone, initSse, writeSseData, writeSseEvent } from '../utils/sse.js';

const streamLegacy = async (messages, res) => {
  const stream = await createLegacyChatStream(messages);
  let responseChars = 0;
  let responseText = '';
  for await (const chunk of stream) {
    const content = chunk?.choices?.[0]?.delta?.content || '';
    if (!content) continue;
    responseChars += content.length;
    responseText += content;
    writeSseData(res, content);
  }
  return { responseChars, responseText };
};

const streamChatHandler = async (req, res, next) => {
  let messages = [];
  let routingTarget = 'unknown';
  let persisted = false;
  const sessionId = (typeof req.get('x-session-id') === 'string' ? req.get('x-session-id').trim() : '') || req.auth?.sub || req.requestId;
  let assistantMessage = '';

  const persistChat = ({ responseChars = 0, status = 'ok', errorCode = null, assistantMessage: nextAssistantMessage = assistantMessage } = {}) => {
    if (persisted) return;
    persisted = true;
    recordChatRequest({
      requestId: req.requestId,
      sessionId,
      userSub: req.auth?.sub,
      mode: env.orchestrationMode,
      orchestrationPath: routingTarget,
      messages,
      userMessage: [...messages].reverse().find((item) => item?.role === 'user')?.content || '',
      assistantMessage: nextAssistantMessage,
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
      const legacyResult = await streamLegacy(messages, res);
      assistantMessage = legacyResult.responseText;
      persistChat({
        responseChars: legacyResult.responseChars,
        status: 'ok',
        assistantMessage,
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
      assistantMessage = typeof orchestrated.content === 'string' ? orchestrated.content : '';
      writeSseData(res, assistantMessage);
      persistChat({
        responseChars: assistantMessage.length,
        status: 'ok',
        assistantMessage,
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
        const legacyResult = await streamLegacy(messages, res);
        assistantMessage = legacyResult.responseText;
        recordOrchestratorCall(env.orchestrationMode, 'fallback_legacy');
        persistChat({
          responseChars: legacyResult.responseChars,
          status: 'fallback_legacy',
          assistantMessage,
          errorCode: orchestratorError?.code || 'ORCHESTRATOR_FAILED',
        });
        closeSseWithDone(res);
        return;
      }

      throw orchestratorError;
    }
  } catch (error) {
    recordProviderError('chat', error?.code || 'runtime_error');
    if (!assistantMessage) {
      assistantMessage = 'Impossible de joindre le cerveau.';
    }
    persistChat({
      responseChars: 0,
      status: 'error',
      assistantMessage,
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

chatRouter.get('/chat/history', authJwtMiddleware, async (req, res, next) => {
  try {
    const history = await getChatHistory({
      sessionId: req.get('x-session-id') || req.query.session_id,
      userSub: req.auth?.sub,
      limit: req.query.limit,
    });

    return res.json({
      session_id: history.sessionId,
      count: history.count || 0,
      messages: history.messages,
    });
  } catch (error) {
    return next(error);
  }
});

chatRouter.post('/chat', authJwtMiddleware, authorizeScope('chat:write'), chatRateLimit, streamChatHandler);
