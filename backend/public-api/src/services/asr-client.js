import { readFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { recordProviderError } from './metrics.service.js';

const shrinkText = (value, max = 300) => {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  return compact.length > max ? compact.slice(0, max) + '...' : compact;
};

const extractProviderMessage = (parsed, rawText) => {
  if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) return parsed.error.message.trim();
  if (typeof parsed?.message === 'string' && parsed.message.trim()) return parsed.message.trim();
  if (typeof parsed?.detail?.message === 'string' && parsed.detail.message.trim()) return parsed.detail.message.trim();
  if (typeof parsed?.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim();
  return shrinkText(rawText, 180);
};

export const transcribeFileViaProvider = async ({ filePath, originalName = 'voice.webm', mimeType = 'audio/webm' }) => {
  const apiKey = env.asrApiKey || env.openaiApiKey;
  if (!apiKey) {
    throw new AppError(500, 'ASR_MISSING_API_KEY', 'ASR_API_KEY (ou OPENAI_API_KEY) manquante.', { expose: true });
  }

  const buffer = await readFile(filePath);
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType || 'audio/webm' });
  formData.append('file', blob, originalName);
  formData.append('model', env.asrModel);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.asrTimeoutMs);

  try {
    const response = await fetch(env.asrEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      recordProviderError('asr', String(response.status));
      const providerMessage = extractProviderMessage(parsed, rawText);
      const code = response.status === 401 || response.status === 403 ? 'ASR_AUTH_FAILED' : 'ASR_PROVIDER_ERROR';
      const message = providerMessage
        ? `Erreur provider transcription (${response.status}): ${providerMessage}`
        : `Erreur provider transcription (${response.status}).`;

      throw new AppError(502, code, message, {
        details: shrinkText(rawText),
      });
    }

    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    return { text };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.name === 'AbortError') {
      recordProviderError('asr', 'timeout');
      throw new AppError(504, 'ASR_TIMEOUT', 'Timeout sur le service de transcription.');
    }

    recordProviderError('asr', 'network');
    throw new AppError(502, 'ASR_UNREACHABLE', 'Service de transcription injoignable.');
  } finally {
    clearTimeout(timeout);
  }
};
