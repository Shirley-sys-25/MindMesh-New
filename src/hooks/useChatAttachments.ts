import { useCallback, useRef, useState } from 'react';

export type ChatAttachmentKind = 'image' | 'document';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  size: number;
  dataUrl?: string;
  textPreview?: string;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const CHAT_ATTACHMENT_ACCEPT =
  'image/*,.pdf,.txt,.md,.csv,.json,.rtf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

const isImageMimeType = (mimeType: string) => mimeType.startsWith('image/');

const isReadableTextMimeType = (mimeType: string, fileName: string) => {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedName = fileName.toLowerCase();

  return (
    normalizedMime.startsWith('text/') ||
    normalizedMime.includes('json') ||
    normalizedMime.includes('xml') ||
    normalizedMime.includes('csv') ||
    normalizedName.endsWith('.md') ||
    normalizedName.endsWith('.markdown') ||
    normalizedName.endsWith('.txt')
  );
};

const shrinkText = (value: string, max = 2400) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
};

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsText(file);
  });

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });

const createAttachmentId = (file: File) =>
  `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${file.name
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .slice(0, 24)}`;

const normalizeMimeType = (file: File) => (file.type && file.type.trim() ? file.type.trim() : 'application/octet-stream');

const buildAttachmentFromFile = async (file: File): Promise<ChatAttachment | null> => {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    console.warn('attachment_too_large_skipped', { name: file.name, size: file.size });
    return null;
  }

  const mimeType = normalizeMimeType(file);
  const kind: ChatAttachmentKind = isImageMimeType(mimeType) ? 'image' : 'document';
  const attachment: ChatAttachment = {
    id: createAttachmentId(file),
    name: file.name,
    mimeType,
    kind,
    size: file.size,
  };

  if (kind === 'image') {
    attachment.dataUrl = await readFileAsDataUrl(file);
    return attachment;
  }

  if (isReadableTextMimeType(mimeType, file.name)) {
    const rawText = await readFileAsText(file);
    attachment.textPreview = shrinkText(rawText, 4000);
  }

  return attachment;
};

export const useChatAttachments = () => {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const openAttachmentPicker = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleAttachmentSelection = useCallback(async (files: FileList | File[] | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    setIsPreparingAttachments(true);
    try {
      const nextAttachments: ChatAttachment[] = [];

      for (const file of selectedFiles) {
        try {
          const attachment = await buildAttachmentFromFile(file);
          if (attachment) {
            nextAttachments.push(attachment);
          }
        } catch (error) {
          console.warn('attachment_read_failed', { name: file.name, error });
        }
      }

      if (nextAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...nextAttachments].slice(-8));
      }
    } finally {
      setIsPreparingAttachments(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
    }
  }, []);

  return {
    attachments,
    attachmentInputRef,
    clearAttachments,
    handleAttachmentSelection,
    isPreparingAttachments,
    openAttachmentPicker,
    removeAttachment,
    setAttachments,
  };
};
