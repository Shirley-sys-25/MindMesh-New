import { z } from 'zod';
import { AppError } from '../utils/errors.js';

const allowedRoles = new Set(['user', 'assistant']);

const messageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1),
});

export const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const role = typeof item.role === 'string' && allowedRoles.has(item.role) ? item.role : 'user';
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      return { role, content };
    })
    .filter((item) => item.content.length > 0);
};

export const parseChatRequest = (payload) => {
  const result = chatRequestSchema.safeParse(payload);
  if (!result.success) {
    throw new AppError(400, 'CHAT_INVALID_PAYLOAD', 'Format invalide.');
  }

  const hasSystemRole = result.data.messages.some((message) =>
    typeof message?.role === 'string' && message.role.trim().toLowerCase() === 'system',
  );

  if (hasSystemRole) {
    throw new AppError(400, 'CHAT_SYSTEM_ROLE_FORBIDDEN', 'Le role system est interdit dans les messages client.');
  }

  const messages = normalizeMessages(result.data.messages);
  if (messages.length === 0) {
    throw new AppError(400, 'CHAT_EMPTY_MESSAGES', 'Aucun message valide fourni.');
  }

  return { messages };
};
