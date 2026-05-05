import { z } from 'zod';
import { AppError } from '../utils/errors.js';

const allowedRoles = new Set(['user', 'assistant']);

const attachmentSchema = z.object({
  id: z.string().trim().optional().default(''),
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  kind: z.enum(['image', 'document']),
  size: z.number().int().nonnegative().max(10 * 1024 * 1024),
  dataUrl: z.string().trim().optional().default(''),
  textPreview: z.string().trim().optional().default(''),
});

const messageSchema = z.object({
  role: z.string().min(1),
  content: z.string().optional().default(''),
  attachments: z.array(attachmentSchema).max(8).optional().default([]),
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
      const attachments = Array.isArray(item.attachments)
        ? item.attachments
            .filter((attachment) => attachment && typeof attachment === 'object')
            .map((attachment) => ({
              id: typeof attachment.id === 'string' ? attachment.id.trim() : '',
              name: typeof attachment.name === 'string' ? attachment.name.trim() : '',
              mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType.trim() : 'application/octet-stream',
              kind: attachment.kind === 'image' ? 'image' : 'document',
              size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
              dataUrl: typeof attachment.dataUrl === 'string' ? attachment.dataUrl.trim() : '',
              textPreview: typeof attachment.textPreview === 'string' ? attachment.textPreview.trim() : '',
            }))
            .filter((attachment) => attachment.name.length > 0)
        : [];

      return { role, content, attachments };
    })
    .filter((item) => item.content.length > 0 || item.attachments.length > 0);
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

  const hasOnlyEmptyMessages = result.data.messages.every((message) => {
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    return !content && attachments.length === 0;
  });

  if (hasOnlyEmptyMessages) {
    throw new AppError(400, 'CHAT_EMPTY_MESSAGES', 'Aucun message valide fourni.');
  }

  const messages = normalizeMessages(result.data.messages);
  if (messages.length === 0) {
    throw new AppError(400, 'CHAT_EMPTY_MESSAGES', 'Aucun message valide fourni.');
  }

  return { messages };
};
