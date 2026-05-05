import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type ChatAttachment } from './useChatAttachments';

export interface ChatStreamMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tone?: 'error';
  attachments?: ChatAttachment[];
}

type SessionLogTone = 'info' | 'success' | 'warn';

interface UseChatStreamParams {
  apiBaseUrl: string;
  sessionId: string;
  getAuthorizationHeaders: () => Promise<Record<string, string>>;
  onLog?: (message: string, tone?: SessionLogTone) => void;
  onAgentStatus?: (agent: string, status: 'idle' | 'working') => void;
}

interface SendMessageOptions {
  attachments?: ChatAttachment[];
}

const shrinkText = (value: string, max = 260): string => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? compact.slice(0, max) + '...' : compact;
};

const readChatErrorPayload = async (response: Response): Promise<{ code: string; message: string }> => {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const rawBody = await response.text();
  const bodySnippet = shrinkText(rawBody);

  let payload: any = null;
  if (rawBody && (contentType.includes('application/json') || rawBody.trim().startsWith('{'))) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }
  }

  const nestedDetail = payload?.detail && typeof payload.detail === 'object' ? payload.detail : null;
  const code =
    (typeof payload?.error?.code === 'string' && payload.error.code) ||
    (typeof payload?.code === 'string' && payload.code) ||
    (typeof nestedDetail?.code === 'string' && nestedDetail.code) ||
    'CHAT_HTTP_ERROR';

  const message =
    (typeof payload?.error?.message === 'string' && payload.error.message) ||
    (typeof payload?.message === 'string' && payload.message) ||
    (typeof nestedDetail?.message === 'string' && nestedDetail.message) ||
    bodySnippet ||
    `Erreur HTTP ${response.status}`;

  return { code, message };
};

const normalizeAttachment = (attachment: any): ChatAttachment => ({
  id: typeof attachment?.id === 'string' ? attachment.id : '',
  name: typeof attachment?.name === 'string' ? attachment.name : 'fichier',
  mimeType: typeof attachment?.mimeType === 'string' ? attachment.mimeType : 'application/octet-stream',
  kind: attachment?.kind === 'image' ? 'image' : 'document',
  size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : 0,
  dataUrl: typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : undefined,
  textPreview: typeof attachment?.textPreview === 'string' ? attachment.textPreview : undefined,
});

const normalizeLoadedMessage = (item: any): ChatStreamMessage | null => {
  if (!item || typeof item !== 'object') return null;

  const attachments = Array.isArray(item.attachments)
    ? item.attachments
        .filter((attachment: any) => attachment && typeof attachment === 'object')
        .map(normalizeAttachment)
        .filter((attachment: ChatAttachment) => attachment.name.trim().length > 0)
    : undefined;

  const content = typeof item.content === 'string' ? item.content : '';
  const role = item.role === 'assistant' || item.role === 'system' ? item.role : 'user';
  const tone = item.tone === 'error' ? 'error' : undefined;

  if (content.trim().length === 0 && (attachments?.length || 0) === 0) return null;

  return {
    role,
    content,
    tone,
    attachments,
  };
};

export const useChatStream = ({ apiBaseUrl, sessionId, getAuthorizationHeaders, onLog, onAgentStatus }: UseChatStreamParams) => {
  const [messagesState, setMessagesState] = useState<ChatStreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const eventSource = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatStreamMessage[]>([]);

  const setMessages: Dispatch<SetStateAction<ChatStreamMessage[]>> = useCallback((value) => {
    setMessagesState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      messagesRef.current = next;
      return next;
    });
  }, []);

  const clearMessages = useCallback(() => {
    eventSource.current?.abort();
    eventSource.current = null;
    setMessages([]);
    setLatencyMs(null);
    setIsLoading(false);
  }, [setMessages]);

  const pushChatErrorMessage = useCallback((errorText: string) => {
    const fallback = `Connexion API impossible. Vérifie que le backend tourne sur ${apiBaseUrl}.`;
    const compact = shrinkText(errorText || '', 260);
    const messageText = compact || fallback;

    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        content: messageText,
        tone: 'error',
      },
    ]);
  }, [apiBaseUrl, setMessages]);

  const loadChatHistory = useCallback(async () => {
    try {
      const authHeaders = await getAuthorizationHeaders();
      const response = await fetch(`${apiBaseUrl}/api/chat/history?limit=100`, {
        headers: {
          ...authHeaders,
          'X-Session-Id': sessionId,
        },
      });

      if (!response.ok) return;

      const payload = await response.json();
      const loadedMessages = Array.isArray(payload?.messages)
        ? payload.messages
            .map(normalizeLoadedMessage)
            .filter((item: ChatStreamMessage | null): item is ChatStreamMessage => Boolean(item))
        : [];

      setMessages(loadedMessages);
    } catch (error) {
      console.error('Historique chat indisponible:', error);
    }
  }, [apiBaseUrl, getAuthorizationHeaders, sessionId, setMessages]);

  useEffect(() => {
    void loadChatHistory();
  }, [loadChatHistory]);

  useEffect(
    () => () => {
      eventSource.current?.abort();
      eventSource.current = null;
    },
    [],
  );

  const sendMessage = useCallback(
    async (promptInput: string, options: SendMessageOptions = {}) => {
      const trimmedMessage = promptInput.trim();
      const selectedAttachments = Array.isArray(options.attachments) ? options.attachments.map((attachment) => ({ ...attachment })) : [];
      const hasAttachments = selectedAttachments.length > 0;

      if ((!trimmedMessage && !hasAttachments) || isLoading) return;

      const nextUserMessage: ChatStreamMessage = {
        role: 'user',
        content: trimmedMessage,
        attachments: hasAttachments ? selectedAttachments : undefined,
      };

      const nextMessages = [...messagesRef.current, nextUserMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setLatencyMs(null);
      setIsLoading(true);
      onLog?.('Awaiting sync...');
      onLog?.('Routing to orchestrator...');

      eventSource.current?.abort();
      const controller = new AbortController();
      eventSource.current = controller;

      const requestStartedAt = Date.now();
      let latencyCaptured = false;
      let didLogCompletion = false;

      const captureLatency = () => {
        if (latencyCaptured) return;
        latencyCaptured = true;
        setLatencyMs(Date.now() - requestStartedAt);
      };

      const replaceAssistantMessage = (content: string) => {
        const updated: ChatStreamMessage[] = [...messagesRef.current];
        const last = updated[updated.length - 1];

        if (!last || last.role !== 'assistant') {
          updated.push({ role: 'assistant', content });
        } else {
          updated[updated.length - 1] = { ...last, content };
        }

        messagesRef.current = updated;
        setMessages(updated);
      };

      const appendAssistantMessage = (content: string) => {
        const updated: ChatStreamMessage[] = [...messagesRef.current, { role: 'assistant', content }];
        messagesRef.current = updated;
        setMessages(updated);
      };

      try {
        const authHeaders = await getAuthorizationHeaders();
        const response = await fetch(`${apiBaseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId,
            ...authHeaders,
          },
          body: JSON.stringify({ messages: nextMessages }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const { code, message } = await readChatErrorPayload(response);
          throw new Error(`${code}: ${message}`);
        }

        if (!response.body) {
          throw new Error('CHAT_STREAM_UNAVAILABLE: Réponse sans flux de données.');
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        if (!contentType.includes('text/event-stream')) {
          const rawBody = await response.text();
          let parsed: any = null;
          try {
            parsed = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            parsed = null;
          }

          const directResponse =
            (typeof parsed?.content === 'string' && parsed.content.trim()) ||
            (typeof parsed?.message === 'string' && parsed.message.trim()) ||
            rawBody.trim();

          if (!directResponse) {
            throw new Error('CHAT_EMPTY_RESPONSE: Le backend a répondu sans contenu exploitable.');
          }

          captureLatency();
          onLog?.('Generation complete.', 'success');
          appendAssistantMessage(directResponse);
          return;
        }

        onLog?.('Core engine ready.');

        const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = '';
        let hasAssistantMessage = false;
        let sseBuffer = '';
        let streamEnded = false;

        while (!streamEnded) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          sseBuffer += decoder.decode(value, { stream: true });

          let eventBoundary = sseBuffer.indexOf('\n\n');
          while (eventBoundary !== -1) {
            const rawEvent = sseBuffer.slice(0, eventBoundary);
            sseBuffer = sseBuffer.slice(eventBoundary + 2);

            const lines = rawEvent.split(/\r?\n/);
            let eventType = 'message';
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
                continue;
              }
              if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).replace(/^\s/, ''));
              }
            }

            if (dataLines.length > 0) {
              const payload = dataLines.join('\n');

              if (eventType === 'done' || payload === '[DONE]') {
                captureLatency();
                didLogCompletion = true;
                onLog?.('Generation complete.', 'success');
                streamEnded = true;
                break;
              }

              if (eventType === 'agent_status') {
                try {
                  const parsedStatus = JSON.parse(payload);
                  const mappedAgent = String(parsedStatus?.agent || '').trim().toLowerCase();
                  const nextStatus = parsedStatus?.status === 'working' ? 'working' : 'idle';

                  if (mappedAgent && onAgentStatus) {
                    onAgentStatus(mappedAgent, nextStatus);
                  }
                } catch (statusError) {
                  console.warn('agent_status SSE parse failed:', statusError);
                }
                continue;
              }

              if (eventType === 'error') {
                let streamErrorMessage = payload || 'Erreur de streaming';
                try {
                  const parsedError = JSON.parse(payload);
                  streamErrorMessage =
                    (typeof parsedError?.error?.message === 'string' && parsedError.error.message) ||
                    (typeof parsedError?.message === 'string' && parsedError.message) ||
                    streamErrorMessage;
                } catch {
                  // noop
                }
                throw new Error(`CHAT_STREAM_ERROR: ${streamErrorMessage}`);
              }

              assistantText += payload;
              if (!hasAssistantMessage) {
                captureLatency();
                onLog?.('Generation started...');
                appendAssistantMessage(assistantText);
                hasAssistantMessage = true;
                setIsLoading(false);
              } else {
                replaceAssistantMessage(assistantText);
              }
            }

            eventBoundary = sseBuffer.indexOf('\n\n');
          }
        }

        const tail = decoder.decode();
        if (tail) {
          assistantText += tail;
          if (!hasAssistantMessage && assistantText.trim()) {
            captureLatency();
            appendAssistantMessage(assistantText);
            hasAssistantMessage = true;
          }
        }

        if (!didLogCompletion) {
          captureLatency();
          onLog?.('Generation complete.', 'success');
        }
      } catch (error) {
        captureLatency();
        console.error('Erreur Chat:', error);

        if (controller.signal.aborted) {
          return;
        }

        onLog?.('Generation failed.', 'warn');

        const rawErrorMessage = error instanceof Error ? error.message : 'Connexion API impossible.';
        const cleanedErrorMessage = rawErrorMessage.replace(/^[A-Z0-9_]+:\s*/i, '').trim();
        pushChatErrorMessage(cleanedErrorMessage);
      } finally {
        if (eventSource.current === controller) {
          eventSource.current = null;
        }
        setIsLoading(false);
      }
    },
    [apiBaseUrl, getAuthorizationHeaders, isLoading, onAgentStatus, onLog, pushChatErrorMessage, sessionId, setMessages],
  );

  return {
    messages: messagesState,
    setMessages,
    isLoading,
    latencyMs,
    sendMessage,
    eventSource,
    clearMessages,
    loadChatHistory,
  };
};
