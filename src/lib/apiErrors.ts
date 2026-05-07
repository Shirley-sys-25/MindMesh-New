import { shrinkText } from './appUtils';

export const readErrorPayload = async (response: Response): Promise<{ code: string; message: string }> => {
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
  const legacyErrorMessage = typeof payload?.error === 'string' ? payload.error.trim() : '';

  const code =
    (typeof payload?.error?.code === 'string' && payload.error.code) ||
    (typeof payload?.code === 'string' && payload.code) ||
    (typeof nestedDetail?.code === 'string' && nestedDetail.code) ||
    (legacyErrorMessage ? 'TRANSCRIBE_BACKEND_ERROR' : '') ||
    (contentType.includes('text/html') ? 'TRANSCRIBE_API_MISROUTE' : 'TRANSCRIBE_HTTP_ERROR');

  const message =
    (typeof payload?.error?.message === 'string' && payload.error.message) ||
    (typeof payload?.message === 'string' && payload.message) ||
    (typeof nestedDetail?.message === 'string' && nestedDetail.message) ||
    legacyErrorMessage ||
    (contentType.includes('text/html')
      ? 'La requete audio n\'a pas atteint l\'API /api/voice/transcribe (verifie VITE_API_BASE_URL et le serveur API).'
      : bodySnippet || `Erreur HTTP ${response.status}`);

  return { code, message };
};
