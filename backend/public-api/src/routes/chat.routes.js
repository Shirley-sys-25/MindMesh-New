import { Router } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { authJwtMiddleware } from '../middleware/auth-jwt.js';
import { authorizeScope } from '../middleware/authorize-scope.js';
import { chatRateLimit } from '../middleware/rate-limit.js';
import { parseChatRequest } from '../schemas/chat.schema.js';
import { createLegacyChatStream } from '../services/openai.service.js';
import { streamOrchestrator } from '../services/orchestrator-client.js';
import { buildSessionSummaryText, getChatHistory, getSessionState, recordChatRequest, upsertSessionState } from '../services/database.service.js';
import { decideOrchestrationPath } from '../services/orchestration-rollout.js';
import { recordOrchestratorCall, recordProviderError } from '../services/metrics.service.js';
import { AppError } from '../utils/errors.js';
import { closeSseWithDone, initSse, writeSseData, writeSseEvent } from '../utils/sse.js';
import { stringifyChatMessageForStorage } from '../utils/chat-attachments.js';

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

    const lastUserMessage = [...messages].reverse().find((item) => item?.role === 'user') || null;
    const userMessageText = stringifyChatMessageForStorage(lastUserMessage);

    recordChatRequest({
      requestId: req.requestId,
      sessionId,
      userSub: req.auth?.sub,
      mode: env.orchestrationMode,
      orchestrationPath: routingTarget,
      messages,
      userMessage: userMessageText,
      assistantMessage: nextAssistantMessage,
      responseChars,
      status,
      errorCode,
    });
  };

  const refreshSessionSummary = async (assistantText) => {
    try {
      const sessionState = await getSessionState({
        sessionId,
        userSub: req.auth?.sub,
      });

      const summary = buildSessionSummaryText({
        currentObjective: sessionState.currentObjective,
        userMessage: stringifyChatMessageForStorage([...messages].reverse().find((item) => item?.role === 'user') || null),
        assistantMessage: assistantText,
        messageCount: messages.length,
      });

      await upsertSessionState({
        sessionId,
        userSub: req.auth?.sub,
        sessionSummary: summary,
        objectiveStep: sessionState.objectiveStep,
        objectiveProgress: sessionState.objectiveProgress,
      });
    } catch (error) {
      logger.warn({ err: error, request_id: req.requestId }, 'session_summary_refresh_failed');
    }
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
      await refreshSessionSummary(assistantMessage);
      closeSseWithDone(res);
      return;
    }

    try {
      let streamEnded = false;
      const orchestratorStream = streamOrchestrator({
        messages,
        requestId: req.requestId,
        userSub: req.auth?.sub,
      });

      for await (const event of orchestratorStream) {
        if (event.type === 'message') {
          const chunk = typeof event.payload === 'string' ? event.payload : '';
          if (chunk) {
            assistantMessage += chunk;
            writeSseData(res, chunk);
          }
          continue;
        }

        if (event.type === 'agent_status') {
          writeSseEvent(res, 'agent_status', event.payload || '{}');
          continue;
        }

        if (event.type === 'done') {
          streamEnded = true;
          recordOrchestratorCall(env.orchestrationMode, 'ok');
          persistChat({
            responseChars: assistantMessage.length,
            status: 'ok',
            assistantMessage,
          });
          await refreshSessionSummary(assistantMessage);
          closeSseWithDone(res);
          return;
        }

        if (event.type === 'error') {
          const errorPayload = typeof event.payload === 'string' ? event.payload : '{}';
          writeSseEvent(res, 'error', errorPayload);
          recordOrchestratorCall(env.orchestrationMode, 'failed');
          persistChat({
            responseChars: assistantMessage.length,
            status: 'error',
            assistantMessage,
            errorCode: 'CREWAI_STREAM_FAILED',
          });
          return res.end();
        }
      }

      if (!streamEnded) {
        recordOrchestratorCall(env.orchestrationMode, 'ok');
        persistChat({
          responseChars: assistantMessage.length,
          status: 'ok',
          assistantMessage,
        });
        await refreshSessionSummary(assistantMessage);
        closeSseWithDone(res);
      }
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
        await refreshSessionSummary(assistantMessage);
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

chatRouter.get('/session-state', authJwtMiddleware, async (req, res, next) => {
  try {
    const sessionId = req.get('x-session-id') || req.query.session_id;
    const state = await getSessionState({
      sessionId,
      userSub: req.auth?.sub,
    });

    return res.json({
      session_id: state.sessionId,
      current_objective: state.currentObjective,
      session_summary: state.sessionSummary,
      current_view: state.currentView,
      active_tab: state.activeTab,
      objective_step: state.objectiveStep,
      objective_progress: state.objectiveProgress,
    });
  } catch (error) {
    return next(error);
  }
});

chatRouter.put('/session-state', authJwtMiddleware, authorizeScope('chat:write'), async (req, res, next) => {
  try {
    const sessionId = req.get('x-session-id') || req.body?.session_id || req.query.session_id;
    const currentObjective = typeof req.body?.current_objective === 'string' ? req.body.current_objective : null;
    const sessionSummary = typeof req.body?.session_summary === 'string' ? req.body.session_summary : null;
    const currentView = typeof req.body?.current_view === 'string' ? req.body.current_view : null;
    const activeTab = typeof req.body?.active_tab === 'string' ? req.body.active_tab : null;
    const objectiveStep = Number.isFinite(Number(req.body?.objective_step)) ? Number(req.body.objective_step) : 0;
    const objectiveProgress = Number.isFinite(Number(req.body?.objective_progress)) ? Number(req.body.objective_progress) : 0;

    await upsertSessionState({
      sessionId,
      userSub: req.auth?.sub,
      currentObjective,
      sessionSummary,
      currentView,
      activeTab,
      objectiveStep,
      objectiveProgress,
    });

    return res.json({
      ok: true,
      session_id: sessionId || null,
      current_objective: currentObjective,
      session_summary: sessionSummary,
      current_view: currentView,
      active_tab: activeTab,
      objective_step: objectiveStep,
      objective_progress: objectiveProgress,
    });
  } catch (error) {
    return next(error);
  }
});

chatRouter.post('/chat', authJwtMiddleware, authorizeScope('chat:write'), chatRateLimit, streamChatHandler);
