import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { mintInternalToken } from './internal-auth.service.js';
import { prepareChatMessagesForOrchestrator } from '../utils/chat-attachments.js';

const ORCHESTRATOR_PATH = '/internal/orchestrate';
const ORCHESTRATOR_STREAM_PATH = '/internal/orchestrate/stream';

const parseSseBlock = (rawBlock) => {
  let eventType = 'message';
  const dataLines = [];

  for (const line of rawBlock.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim() || 'message';
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
  }

  return {
    eventType,
    payload: dataLines.join('\n'),
  };
};

const readTextFromResponse = async (response) => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

export const invokeOrchestrator = async ({ messages, requestId, userSub }) => {
  if (!env.orchestratorUrl) {
    throw new AppError(500, 'ORCHESTRATOR_CONFIG_MISSING', 'ORCHESTRATOR_URL manquante.', { expose: false });
  }

  const token = await mintInternalToken({
    userSub,
    requestId,
    scope: 'orchestrate:invoke',
  });
  const preparedMessages = prepareChatMessagesForOrchestrator(messages);

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
      body: JSON.stringify({ messages: preparedMessages }),
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

export const streamOrchestrator = async function* ({ messages, requestId, userSub }) {
  if (!env.orchestratorUrl) {
    throw new AppError(500, 'ORCHESTRATOR_CONFIG_MISSING', 'ORCHESTRATOR_URL manquante.', { expose: false });
  }

  const token = await mintInternalToken({
    userSub,
    requestId,
    scope: 'orchestrate:invoke',
  });
  const preparedMessages = prepareChatMessagesForOrchestrator(messages);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.orchestratorTimeoutMs);

  try {
    const response = await fetch(`${env.orchestratorUrl}${ORCHESTRATOR_STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ messages: preparedMessages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await readTextFromResponse(response);
      throw new AppError(502, 'ORCHESTRATOR_BAD_RESPONSE', `Orchestrateur indisponible (${response.status})`, {
        details: text.slice(0, 250),
      });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    if (!response.body || !contentType.includes('text/event-stream')) {
      let data = null;
      try {
        data = await response.json();
      } catch {
        const text = await readTextFromResponse(response);
        data = { content: text };
      }

      const content = typeof data?.content === 'string' ? data.content : '';
      const metadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};

      if (content) {
        yield { type: 'message', payload: content, metadata };
      }

      yield { type: 'done', payload: '[DONE]', metadata };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamEnded = false;

    while (!streamEnded) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });

      let eventBoundary = buffer.indexOf('\n\n');
      while (eventBoundary !== -1) {
        const rawEvent = buffer.slice(0, eventBoundary);
        buffer = buffer.slice(eventBoundary + 2);

        const { eventType, payload } = parseSseBlock(rawEvent);
        if (!payload && eventType !== 'done' && eventType !== 'error') {
          eventBoundary = buffer.indexOf('\n\n');
          continue;
        }

        yield { type: eventType, payload };

        if (eventType === 'done' || eventType === 'error') {
          streamEnded = true;
          break;
        }

        eventBoundary = buffer.indexOf('\n\n');
      }
    }

    const tail = decoder.decode();
    if (tail) {
      buffer += tail;
    }

    if (buffer.trim()) {
      const { eventType, payload } = parseSseBlock(buffer);
      if (payload || eventType === 'done' || eventType === 'error') {
        yield { type: eventType, payload };
      }
    }
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
