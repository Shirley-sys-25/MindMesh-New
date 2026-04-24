import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

const allowedAudioMimeTypes = new Set([
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/mp4',
]);

const normalizeMime = (mimeType) => {
  if (!mimeType || typeof mimeType !== 'string') return '';
  return mimeType.toLowerCase().split(';')[0].trim();
};

export const isAllowedAudioMime = (mimeType) => {
  const normalized = normalizeMime(mimeType);
  if (!normalized) return false;
  return allowedAudioMimeTypes.has(normalized);
};

export const assertTranscribeFile = (file) => {
  if (!file) throw new AppError(400, 'TRANSCRIBE_MISSING_FILE', 'Aucun fichier audio recu.');
  if (typeof file.size === 'number' && file.size > env.transcribeMaxBytes) {
    throw new AppError(413, 'TRANSCRIBE_FILE_TOO_LARGE', 'Fichier audio trop volumineux.');
  }
  if (!isAllowedAudioMime(file.mimetype)) {
    throw new AppError(400, 'TRANSCRIBE_INVALID_MIME', 'Format audio non supporte.');
  }
};
