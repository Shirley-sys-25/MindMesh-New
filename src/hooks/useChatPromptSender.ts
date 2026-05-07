import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AttachmentPreview, Message, SessionLog } from '../lib/appTypes';
import { readErrorPayload } from '../lib/apiErrors';
import {
  evaluatePromptSecurity,
  formatAttachmentSize,
  shrinkText,
} from '../lib/appUtils';

const knownAgentIds = new Set(['africonnect', 'analyste_marche', 'stratege_seo']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

interface UseChatPromptSenderArgs {
  apiBaseUrl: string;
  sessionId: string;
  isLoading: boolean;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  currentObjective: string | null;
  setCurrentObjective: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setLatencyMs: Dispatch<SetStateAction<number | null>>;
  setSecurityScore: Dispatch<SetStateAction<number>>;
  setObjectiveStep: Dispatch<SetStateAction<number>>;
  setObjectiveProgress: Dispatch<SetStateAction<number>>;
  setIsExecutingWorkspace: Dispatch<SetStateAction<boolean>>;
  setAgentStatuses: Dispatch<SetStateAction<Record<string, 'idle' | 'working'>>>;
  pushSessionLog: (logMessage: string, tone?: SessionLog['tone']) => void;
  getAuthorizationHeaders: () => Promise<Record<string, string>>;
}

export const useChatPromptSender = ({
  apiBaseUrl,
  sessionId,
  isLoading,
  messages,
  setMessages,
  currentObjective,
  setCurrentObjective,
  setMessage,
  setIsLoading,
  setLatencyMs,
  setSecurityScore,
  setObjectiveStep,
  setObjectiveProgress,
  setIsExecutingWorkspace,
  setAgentStatuses,
  pushSessionLog,
  getAuthorizationHeaders,
}: UseChatPromptSenderArgs) => {
  const sendPrompt = useCallback(async (promptInput: string, attachments: AttachmentPreview[] = []) => {
    const trimmedMessage = promptInput.trim();
    if (!trimmedMessage && attachments.length === 0) return;

    const attachmentSummary = attachments.length > 0
      ? ['Pièces jointes sélectionnées:', ...attachments.map((attachment) => `- ${attachment.name} (${attachment.type}, ${formatAttachmentSize(attachment.size)})`)].join('\n')
      : '';
    const outgoingPrompt = attachmentSummary
      ? `${trimmedMessage || 'Analyse les pièces jointes sélectionnées.'}\n\n${attachmentSummary}`
      : trimmedMessage;

    const compactPrompt = outgoingPrompt.replace(/\s+/g, ' ').trim();
    const normalizedPrompt = compactPrompt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!currentObjective) {
      const hasObjectiveIntent = ['objectif', 'analyser', 'je veux', 'lancer'].some((keyword) =>
        normalizedPrompt.includes(keyword)
      );

      if (hasObjectiveIntent) {
        const objectiveLabel = compactPrompt.length > 25 ? compactPrompt.slice(0, 25) + '...' : compactPrompt;
        setCurrentObjective(objectiveLabel);
      }
    }

    const requestStartedAt = Date.now();
    let latencyCaptured = false;
    let didLogCompletion = false;

    const captureLatency = () => {
      if (latencyCaptured) return;
      latencyCaptured = true;
      setLatencyMs(Date.now() - requestStartedAt);
    };

    const userMessage: Message = { role: 'user', content: outgoingPrompt };
    setSecurityScore(evaluatePromptSecurity(outgoingPrompt));
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setAgentStatuses({
      africonnect: 'idle',
      analyste_marche: 'idle',
      stratege_seo: 'idle',
    });
    setMessage('');
    setIsLoading(true);
    setObjectiveStep((prev) => Math.min(prev + 1, 5));
    setObjectiveProgress((prev) => Math.min(prev + 20, 100));

    pushSessionLog('Awaiting sync...');
    pushSessionLog('Routing to orchestrator...');

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
      });

      if (!response.ok) {
        const { code, message: apiMessage } = await readErrorPayload(response);
        throw new Error(`${code}: ${apiMessage}`);
      }

      if (!response.body) {
        throw new Error('CHAT_STREAM_UNAVAILABLE: Réponse sans flux de données.');
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      if (!contentType.includes('text/event-stream')) {
        const rawBody = await response.text();
        let parsed: Record<string, unknown> | null = null;

        if (rawBody) {
          try {
            const candidate: unknown = JSON.parse(rawBody);
            parsed = isRecord(candidate) ? candidate : null;
          } catch {
            parsed = null;
          }
        }

        const directResponse =
          (typeof parsed?.content === 'string' && parsed.content.trim()) ||
          (typeof parsed?.message === 'string' && parsed.message.trim()) ||
          rawBody.trim();

        if (!directResponse) {
          throw new Error('CHAT_EMPTY_RESPONSE: Le backend a répondu sans contenu exploitable.');
        }

        captureLatency();
        pushSessionLog('Generation complete.', 'success');
        setMessages((prev) => [...prev, { role: 'assistant', content: directResponse }]);
        return;
      }

      pushSessionLog('Core engine ready.');

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
              pushSessionLog('Generation complete.', 'success');
              streamEnded = true;
              break;
            }

            if (eventType === 'agent_status') {
              try {
                const parsedStatus: unknown = JSON.parse(payload);
                if (isRecord(parsedStatus)) {
                  const mappedAgent = typeof parsedStatus.agent === 'string' ? parsedStatus.agent.trim().toLowerCase() : '';
                  const nextStatus = parsedStatus.status === 'working' ? 'working' : 'idle';

                  if (mappedAgent && knownAgentIds.has(mappedAgent)) {
                    setAgentStatuses((prev) => ({
                      ...prev,
                      [mappedAgent]: nextStatus,
                    }));
                  }
                }
              } catch (statusError) {
                console.warn('agent_status SSE parse failed:', statusError);
              }
              continue;
            }

            if (eventType === 'error') {
              let streamErrorMessage = payload || 'Erreur de streaming';
              try {
                const parsedError: unknown = JSON.parse(payload);
                if (isRecord(parsedError)) {
                  streamErrorMessage =
                    (isRecord(parsedError.error) && typeof parsedError.error.message === 'string' && parsedError.error.message) ||
                    (typeof parsedError.message === 'string' && parsedError.message) ||
                    streamErrorMessage;
                }
              } catch {
                // noop
              }
              throw new Error(`CHAT_STREAM_ERROR: ${streamErrorMessage}`);
            }

            assistantText += payload;
            if (!hasAssistantMessage) {
              captureLatency();
              pushSessionLog('Generation started...');
              setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
              hasAssistantMessage = true;
              setIsLoading(false);
            } else {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (!last || last.role !== 'assistant') {
                  updated.push({ role: 'assistant', content: assistantText });
                } else {
                  updated[updated.length - 1] = { ...last, content: assistantText };
                }
                return updated;
              });
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
          setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
          hasAssistantMessage = true;
        }
      }

      if (!didLogCompletion) {
        captureLatency();
        pushSessionLog('Generation complete.', 'success');
      }
    } catch (error) {
      captureLatency();
      console.error('Erreur Chat:', error);
      pushSessionLog('Generation failed.', 'warn');

      const rawErrorMessage = error instanceof Error ? error.message : 'Connexion API impossible.';
      const cleanedErrorMessage = rawErrorMessage.replace(/^[A-Z0-9_]+:\s*/i, '').trim();
      const fallback = `Connexion API impossible. Vérifie que le backend tourne sur ${apiBaseUrl}.`;
      const messageText = shrinkText(cleanedErrorMessage || fallback, 260) || fallback;
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: messageText,
          tone: 'error',
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsExecutingWorkspace(false);
    }
  }, [
    apiBaseUrl,
    currentObjective,
    getAuthorizationHeaders,
    messages,
    pushSessionLog,
    sessionId,
    setAgentStatuses,
    setCurrentObjective,
    setIsExecutingWorkspace,
    setIsLoading,
    setLatencyMs,
    setMessage,
    setMessages,
    setObjectiveProgress,
    setObjectiveStep,
    setSecurityScore,
  ]);

  return { sendPrompt };
};
