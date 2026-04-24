import path from 'node:path';
import { rm } from 'node:fs/promises';
import { transcribeFileViaProvider } from './asr-client.js';

const safeRm = async (filePath) => {
  if (!filePath) return;
  try {
    await rm(filePath, { force: true });
  } catch {
    // noop
  }
};

export const transcribeUploadedAudio = async (file) => {
  const sourcePath = file.path;
  const originalName = file.originalname ? path.basename(file.originalname) : 'voice.bin';
  const mimeType = typeof file.mimetype === 'string' && file.mimetype.trim() ? file.mimetype.trim() : 'application/octet-stream';

  try {
    const result = await transcribeFileViaProvider({
      filePath: sourcePath,
      originalName,
      mimeType,
    });
    return result;
  } finally {
    await safeRm(sourcePath);
  }
};
