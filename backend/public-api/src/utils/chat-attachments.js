const MAX_ATTACHMENT_PREVIEW_CHARS = 4000;

const toReadableSize = (size) => {
  const value = Number(size);
  if (!Number.isFinite(value) || value < 0) return 'taille inconnue';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value / (1024 * 1024))} MB`;
};

const normalizeAttachment = (attachment) => ({
  id: typeof attachment?.id === 'string' ? attachment.id : '',
  name: typeof attachment?.name === 'string' ? attachment.name : 'fichier',
  mimeType: typeof attachment?.mimeType === 'string' ? attachment.mimeType : 'application/octet-stream',
  kind: attachment?.kind === 'image' ? 'image' : 'document',
  size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : 0,
  dataUrl: typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : '',
  textPreview: typeof attachment?.textPreview === 'string' ? attachment.textPreview : '',
});

const serializeAttachmentSummary = (attachment) => {
  const normalized = normalizeAttachment(attachment);
  const bits = [
    normalized.kind === 'image' ? 'image' : 'document',
    normalized.name,
    `(${normalized.mimeType}, ${toReadableSize(normalized.size)})`,
  ];

  if (normalized.textPreview) {
    bits.push(`Extrait: ${normalized.textPreview.slice(0, MAX_ATTACHMENT_PREVIEW_CHARS)}`);
  }

  return bits.filter(Boolean).join(' ');
};

export const buildTextAttachmentBlock = (attachments) => {
  const normalizedAttachments = Array.isArray(attachments) ? attachments.map(normalizeAttachment).filter((item) => item.name) : [];
  if (normalizedAttachments.length === 0) return '';

  return [
    '',
    'Pièces jointes:',
    ...normalizedAttachments.map((attachment) => `- ${serializeAttachmentSummary(attachment)}`),
  ].join('\n');
};

const buildLegacyContentParts = (message) => {
  const attachments = Array.isArray(message?.attachments) ? message.attachments.map(normalizeAttachment) : [];
  const content = typeof message?.content === 'string' ? message.content.trim() : '';

  if (attachments.length === 0) {
    return content;
  }

  const parts = [];

  if (content) {
    parts.push({ type: 'text', text: content });
  }

  for (const attachment of attachments) {
    if (attachment.kind === 'image' && attachment.dataUrl?.startsWith('data:image/')) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: attachment.dataUrl,
        },
      });
      continue;
    }

    const summary = serializeAttachmentSummary(attachment);
    if (summary) {
      parts.push({ type: 'text', text: summary });
    }
  }

  if (parts.length === 0) {
    return content || 'Pièces jointes fournies.';
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }

  return parts;
};

export const stringifyChatMessageForStorage = (message) => {
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  const attachmentBlock = buildTextAttachmentBlock(message?.attachments);
  return [content, attachmentBlock].filter(Boolean).join('\n').trim();
};

export const normalizeChatMessageAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments) ? message.attachments.map(normalizeAttachment).filter((item) => item.id || item.name) : [];

  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    kind: attachment.kind,
    size: attachment.size,
    dataUrl: attachment.dataUrl || undefined,
    textPreview: attachment.textPreview || undefined,
  }));
};

export const prepareChatMessagesForHistory = (messages) =>
  (Array.isArray(messages) ? messages : []).map((message) => ({
    role: message?.role,
    content: stringifyChatMessageForStorage(message),
  }));

export const prepareChatMessagesForLegacyProvider = (messages) =>
  (Array.isArray(messages) ? messages : []).map((message) => ({
    role: message?.role,
    content: buildLegacyContentParts(message),
  }));

export const prepareChatMessagesForOrchestrator = (messages) =>
  (Array.isArray(messages) ? messages : []).map((message) => ({
    role: message?.role,
    content: [typeof message?.content === 'string' ? message.content.trim() : '', buildTextAttachmentBlock(message?.attachments)]
      .filter(Boolean)
      .join('\n')
      .trim(),
  }));
