import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '../lib/appTypes';

interface UseChatHistoryArgs {
  apiBaseUrl: string;
  sessionId: string;
  getAuthorizationHeaders: () => Promise<Record<string, string>>;
}

export const useChatHistory = ({ apiBaseUrl, sessionId, getAuthorizationHeaders }: UseChatHistoryArgs) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const loadChatHistory = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestVersion = ++versionRef.current;

    try {
      const authHeaders = await getAuthorizationHeaders();
      const response = await fetch(`${apiBaseUrl}/api/chat/history?limit=100`, {
        headers: {
          ...authHeaders,
          'X-Session-Id': sessionId,
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted || requestVersion !== versionRef.current) return;
      if (!response.ok) return;

      const payload = await response.json();
      const loadedMessages = Array.isArray(payload?.messages)
        ? payload.messages
            .filter((item: any) => item && typeof item === 'object')
            .map((item: any) => ({
              role: item.role === 'assistant' || item.role === 'system' ? item.role : 'user',
              content: typeof item.content === 'string' ? item.content : '',
              tone: item.tone === 'error' ? 'error' : undefined,
            }))
            .filter((item: Message) => item.content.trim().length > 0)
        : [];

      if (controller.signal.aborted || requestVersion !== versionRef.current) return;
      setMessages(loadedMessages);
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return;
      console.error('Historique chat indisponible:', error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [apiBaseUrl, getAuthorizationHeaders, sessionId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return { messages, setMessages, loadChatHistory };
};
