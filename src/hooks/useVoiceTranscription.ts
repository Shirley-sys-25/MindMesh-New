import { useCallback, useEffect, useRef, useState } from 'react';

const preferredRecorderMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/wav',
];

const pickRecorderMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return preferredRecorderMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
};

const getAudioExtensionFromMime = (mimeType: string): string => {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  return 'webm';
};

const shrinkText = (value: string, max = 180): string => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? compact.slice(0, max) + '...' : compact;
};

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

interface UseVoiceTranscriptionArgs {
  message: string;
  setMessage: (value: string) => void;
  pushSessionLog: (logMessage: string, tone?: 'info' | 'success' | 'warn') => void;
  getAuthorizationHeaders: () => Promise<Record<string, string>>;
  apiBaseUrl: string;
}

export const useVoiceTranscription = ({
  message,
  setMessage,
  pushSessionLog,
  getAuthorizationHeaders,
  apiBaseUrl,
}: UseVoiceTranscriptionArgs) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>('audio/webm');
  const recordingLockRef = useRef(false);
  const recordingTokenRef = useRef(0);

  const stopRecorder = useCallback(() => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      // noop
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      recordingLockRef.current = false;
      recordingTokenRef.current += 1;
      stopRecorder();
    };
  }, [stopRecorder]);

  const toggleRecording = useCallback(async () => {
    if (recordingLockRef.current) return;
    recordingLockRef.current = true;
    const recordingToken = ++recordingTokenRef.current;

    if (isRecording) {
      stopRecorder();
      setIsRecording(false);
      recordingLockRef.current = false;
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MEDIA_DEVICES_UNAVAILABLE');
      }

      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MEDIA_RECORDER_UNSUPPORTED');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingToken !== recordingTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const selectedMimeType = pickRecorderMimeType();
      const mediaRecorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaStreamRef.current = stream;
      recorderMimeTypeRef.current = mediaRecorder.mimeType || selectedMimeType || 'audio/webm';
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const firstChunkType = audioChunksRef.current.find((chunk) => chunk.type)?.type || '';
        const mimeType = firstChunkType || recorderMimeTypeRef.current || 'audio/webm';
        const fileExtension = getAudioExtensionFromMime(mimeType);
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (audioBlob.size === 0) {
          pushSessionLog('Aucun son detecte durant l’enregistrement.', 'warn');
          return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice.' + fileExtension);

        const oldMessage = message;
        setMessage('Transcription en cours...');
        pushSessionLog('Envoi audio vers Afri-ASR...');

        try {
          const authHeaders = await getAuthorizationHeaders();
          const res = await fetch(`${apiBaseUrl}/api/voice/transcribe`, {
            method: 'POST',
            headers: {
              ...authHeaders,
            },
            body: formData,
          });

          if (!res.ok) {
            const { code, message: apiMessage } = await readErrorPayload(res);
            throw new Error(`${code}: ${apiMessage}`);
          }

          const data = await res.json();
          const transcriptText = typeof data?.text === 'string' ? data.text.trim() : '';

          if (transcriptText) {
            setMessage(oldMessage + (oldMessage ? ' ' : '') + transcriptText);
            pushSessionLog('Transcription terminee.', 'success');
          } else {
            setMessage(oldMessage);
            pushSessionLog('Aucun texte exploitable detecte.', 'warn');
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
          console.error('Transcription audio echouee:', err);
          setMessage(oldMessage);
          pushSessionLog('Transcription impossible: ' + errorMessage, 'warn');
          alert('Transcription impossible: ' + errorMessage);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      pushSessionLog('Enregistrement micro demarre...');
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      console.error('Acces micro refuse ou indisponible:', err);

      if (reason === 'MEDIA_RECORDER_UNSUPPORTED' || reason === 'MEDIA_DEVICES_UNAVAILABLE') {
        pushSessionLog('Navigateur non compatible enregistrement audio.', 'warn');
        alert('Votre navigateur ne supporte pas l\'enregistrement audio. Utilisez Chrome ou Edge recents.');
        return;
      }

      pushSessionLog('Acces micro refuse. Autorisez le micro puis recommencez.', 'warn');
      alert('Veuillez autoriser l\'acces au microphone dans votre navigateur.');
    } finally {
      recordingLockRef.current = false;
      if (!isRecording) {
        recordingTokenRef.current += 1;
      }
    }
  }, [apiBaseUrl, getAuthorizationHeaders, isRecording, message, pushSessionLog, setMessage, stopRecorder]);

  return { isRecording, toggleRecording };
};
