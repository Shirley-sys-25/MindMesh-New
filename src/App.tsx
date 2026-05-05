import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, Target, Trophy, Brain, Send, Mic, Share2, Download, Play, Code, Eye,
  Terminal, Activity, Globe, Search, Zap, LayoutDashboard,
  ShieldCheck, Cpu, Sun, Moon, AlertTriangle, Paperclip, X, FileText, Image
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SignedIn, SignedOut, SignInButton, useAuth, useClerk, useUser } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStream } from './hooks/useChatStream';
import { ChatComposer } from './components/ChatComposer';
import { useSessionStateSync } from './hooks/useSessionStateSync';
import { useBackendSnapshot } from './hooks/useBackendSnapshot';
import { CHAT_ATTACHMENT_ACCEPT, useChatAttachments, type ChatAttachment } from './hooks/useChatAttachments';

interface Agent {
  id: string; name: string; role: string; icon: any;
}

interface SessionLog {
  id: string;
  timestamp: string;
  message: string;
  tone: 'info' | 'success' | 'warn';
}

interface WorkspaceNotice {
  tone: 'info' | 'success' | 'warn';
  text: string;
}

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

const readErrorPayload = async (response: Response): Promise<{ code: string; message: string }> => {
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
      ? 'La requete audio n\'a pas atteint l\'API /api/transcribe (verifie VITE_API_BASE_URL et le serveur API).'
      : bodySnippet || `Erreur HTTP ${response.status}`);

  return { code, message };
};

const SESSION_STORAGE_KEY = 'mindmesh.session_id';

const createSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
};

const readOrCreateSessionId = (): string => {
  if (typeof window === 'undefined') return createSessionId();

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const generated = createSessionId();
  window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
};

const BASIC_GREETING_WORDS = new Set(['bonjour', 'salut', 'hello', 'coucou', 'hi', 'hey']);

const normalizeForObjectiveCapture = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const captureObjectiveFromMessage = (value: string): string | null => {
  const compact = normalizeForObjectiveCapture(value);
  if (!compact) return null;

  const words = compact.split(' ').filter(Boolean);
  if (words.length < 4 || compact.length < 20) return null;

  const greetingOnly = words.every((word) => BASIC_GREETING_WORDS.has(word));
  if (greetingOnly) return null;

  return value.replace(/\s+/g, ' ').trim();
};

export default function App() {
  const { signOut, openUserProfile } = useClerk();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [showMenu, setShowMenu] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [currentView, setCurrentView] = useState<'chat' | 'dashboard'>('chat');
  const [objectiveProgress, setObjectiveProgress] = useState(0);
  const [objectiveStep, setObjectiveStep] = useState(0);
  const [currentObjective, setCurrentObjective] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [securityScore, setSecurityScore] = useState(99.8);
  const [isExecutingWorkspace, setIsExecutingWorkspace] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'idle' | 'working'>>({
    africonnect: 'idle',
    analyste_marche: 'idle',
    stratege_seo: 'idle',
  });
  const [sessionId, setSessionId] = useState(() => readOrCreateSessionId());

  // ÉTATS ET RÉFÉRENCES POUR LE MICRO
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>('audio/webm');
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const workspaceNoticeTimeoutRef = useRef<number | null>(null);

  const {
    attachments,
    attachmentInputRef,
    clearAttachments,
    handleAttachmentSelection,
    isPreparingAttachments,
    removeAttachment,
  } = useChatAttachments();

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4020').replace(/\/+$/, '');
  const UPGRADE_URL = (import.meta.env.VITE_UPGRADE_URL || import.meta.env.VITE_BILLING_URL || '').trim();
  const BILLING_URL = (import.meta.env.VITE_BILLING_URL || '').trim();
  const METRICS_SECRET = (import.meta.env.VITE_METRICS_SECRET || '').trim();
  const METRICS_ADMIN_TOKEN = (import.meta.env.VITE_METRICS_ADMIN_TOKEN || '').trim();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (!logsContainerRef.current) return;
    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
  }, [sessionLogs]);

  const getAuthorizationHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = await getToken();
      return token ? { Authorization: 'Bearer ' + token } : {};
    } catch {
      return {};
    }
  }, [getToken]);

  const getMetricsHeaders = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (METRICS_ADMIN_TOKEN) {
      headers.Authorization = 'Bearer ' + METRICS_ADMIN_TOKEN;
    }
    return headers;
  }, [METRICS_ADMIN_TOKEN]);

  const { loadSessionState, persistSessionState, sessionStateHydratedRef } = useSessionStateSync({
    apiBaseUrl: API_BASE_URL,
    sessionId,
    currentView,
    activeTab,
    currentObjective,
    sessionSummary,
    objectiveStep,
    objectiveProgress,
    getAuthorizationHeaders,
    setCurrentObjective,
    setSessionSummary,
    setCurrentView,
    setActiveTab,
    setObjectiveStep,
    setObjectiveProgress,
  });

  const { backendSnapshot, isRefreshingSnapshot, metricsSnapshot, refreshBackendSnapshot } = useBackendSnapshot({
    apiBaseUrl: API_BASE_URL,
    getMetricsHeaders,
  });

  const resetAgentStatuses = () => {
    setAgentStatuses({
      africonnect: 'idle',
      analyste_marche: 'idle',
      stratege_seo: 'idle',
    });
  };

  const pushSessionLog = useCallback((logMessage: string, tone: SessionLog['tone'] = 'info') => {
    const now = Date.now();

    setSessionLogs((prev) => {
      const nextLog: SessionLog = {
        id: String(now) + '-' + String(prev.length),
        timestamp: new Date(now).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        message: logMessage,
        tone,
      };

      return [...prev, nextLog].slice(-80);
    });
  }, []);

  const {
    messages,
    isLoading,
    latencyMs,
    sendMessage,
    clearMessages,
  } = useChatStream({
    apiBaseUrl: API_BASE_URL,
    sessionId,
    getAuthorizationHeaders,
    onLog: pushSessionLog,
    onAgentStatus: (agent, status) => {
      if (!agent) return;
      setAgentStatuses((prev) => ({
        ...prev,
        [agent]: status,
      }));
    },
  });

  const latestAssistantMessage =
    [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const totalMessages = messages.length;
  const userMessagesCount = messages.filter((m) => m.role === 'user').length;
  const assistantMessagesCount = messages.filter((m) => m.role === 'assistant').length;
  const failedMessagesCount = messages.filter((m) => m.role === 'system' && m.tone === 'error').length;
  const completedSteps = objectiveStep;

  useEffect(() => {
    if (!sessionStateHydratedRef.current) return;

    void persistSessionState({
      currentObjective,
      sessionSummary,
      objectiveStep,
      objectiveProgress,
    });
  }, [activeTab, currentObjective, currentView, objectiveProgress, objectiveStep, persistSessionState, sessionSummary]);

  const evaluatePromptSecurity = (prompt: string): number => {
    if (!prompt.trim()) return 99.8;

    const normalizedPrompt = prompt
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let score = 99.8;
    const penalties = [
      { pattern: /ignore (les )?instructions?/g, value: 35 },
      { pattern: /ignore (all|any|previous) instructions?/g, value: 35 },
      { pattern: /system prompt|developer prompt/g, value: 25 },
      { pattern: /jailbreak|bypass|contourne|desactive la securite/g, value: 25 },
      { pattern: /rm -rf|powershell|cmd\.exe|curl\s+http|wget\s+http/g, value: 15 },
      { pattern: /<script|<\/script>|javascript:/g, value: 20 },
    ];

    for (const rule of penalties) {
      if (rule.pattern.test(normalizedPrompt)) {
        score -= rule.value;
      }
    }

    const suspiciousChars = (normalizedPrompt.match(/[{}<>`$]/g) || []).length;
    if (suspiciousChars > 3) {
      score -= Math.min(20, suspiciousChars * 1.5);
    }

    return Math.max(0, Math.min(100, Number(score.toFixed(1))));
  };

  const securityScoreTextClass =
    securityScore >= 85
      ? (isDarkMode ? 'text-purple-400' : 'text-purple-600')
      : securityScore >= 60
        ? (isDarkMode ? 'text-amber-300' : 'text-amber-600')
        : (isDarkMode ? 'text-red-300' : 'text-red-600');
  
  const agents: Agent[] = [
    { id: 'africonnect', name: 'AfriConnect', role: 'Traduction & Contexte Local', icon: Globe },
    { id: 'analyste_marche', name: 'Analyste Marché', role: 'Analyse des tendances...', icon: Search },
    { id: 'stratege_seo', name: 'Stratège SEO', role: 'Optimisation visibilité', icon: Zap },
  ];

  const getLogToneClass = (tone: SessionLog['tone']) => {
    if (tone === 'success') return 'text-green-500';
    if (tone === 'warn') return 'text-amber-500';
    return 'text-purple-500';
  };

  const showWorkspaceNotice = useCallback((tone: WorkspaceNotice['tone'], text: string) => {
    setWorkspaceNotice({ tone, text });

    if (workspaceNoticeTimeoutRef.current !== null) {
      window.clearTimeout(workspaceNoticeTimeoutRef.current);
    }

    workspaceNoticeTimeoutRef.current = window.setTimeout(() => {
      setWorkspaceNotice(null);
      workspaceNoticeTimeoutRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (workspaceNoticeTimeoutRef.current !== null) {
        window.clearTimeout(workspaceNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void loadSessionState();
  }, [loadSessionState]);

  const formatSnapshotTime = (timestamp: number | null) => {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const workspaceRuntimeState =
    backendSnapshot.ready === 'ready'
      ? 'live'
      : backendSnapshot.ready === 'degraded'
        ? 'degraded'
        : backendSnapshot.health === 'down'
          ? 'offline'
          : 'sync';

  const workspaceRuntimeLabel =
    workspaceRuntimeState === 'live'
      ? 'Live'
      : workspaceRuntimeState === 'degraded'
        ? 'Degraded'
        : workspaceRuntimeState === 'offline'
          ? 'Offline'
          : 'Sync';

  const workspaceRuntimeDotClass =
    workspaceRuntimeState === 'live'
      ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]'
      : workspaceRuntimeState === 'degraded'
        ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]'
        : workspaceRuntimeState === 'offline'
          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
          : 'bg-slate-400 animate-pulse';

  const workspaceRuntimeTextClass =
    workspaceRuntimeState === 'live'
      ? isDarkMode
        ? 'text-green-500'
        : 'text-green-600'
      : workspaceRuntimeState === 'degraded'
        ? isDarkMode
          ? 'text-amber-400'
          : 'text-amber-600'
        : workspaceRuntimeState === 'offline'
          ? isDarkMode
            ? 'text-red-400'
            : 'text-red-600'
          : isDarkMode
            ? 'text-slate-300'
            : 'text-slate-600';

  const workspaceNoticeToneClass =
    workspaceNotice?.tone === 'success'
      ? isDarkMode
        ? 'bg-green-500/10 border-green-500/30 text-green-200'
        : 'bg-green-50 border-green-200 text-green-700'
      : workspaceNotice?.tone === 'warn'
        ? isDarkMode
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          : 'bg-amber-50 border-amber-200 text-amber-700'
        : isDarkMode
          ? 'bg-purple-500/10 border-purple-500/30 text-purple-200'
          : 'bg-purple-50 border-purple-200 text-purple-700';

  const markdownBubbleClass = isDarkMode
    ? 'prose prose-invert max-w-none prose-headings:text-inherit prose-p:my-3 prose-p:leading-relaxed prose-strong:text-inherit prose-em:text-inherit prose-a:text-fuchsia-300 prose-a:no-underline hover:prose-a:underline prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-purple-400 prose-blockquote:border-purple-400/30 prose-blockquote:text-inherit prose-code:text-fuchsia-200 prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10'
    : 'prose prose-slate max-w-none prose-headings:text-inherit prose-p:my-3 prose-p:leading-relaxed prose-strong:text-inherit prose-em:text-inherit prose-a:text-purple-700 prose-a:no-underline hover:prose-a:underline prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-purple-500 prose-blockquote:border-purple-400/30 prose-blockquote:text-inherit prose-code:text-purple-700 prose-code:bg-purple-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-pre:bg-slate-50 prose-pre:border prose-pre:border-purple-100';

  const latestAssistantMarkdown = (latestAssistantMessage || 'Aucune réponse disponible pour le moment.').replace(/\\n/g, '\n');

  const openExternalLink = (url: string, label: string) => {
    if (!url) {
      showWorkspaceNotice('warn', `${label} indisponible: URL non configuree.`);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setShowMenu(false);
    pushSessionLog(`${label} ouvert dans un nouvel onglet.`, 'success');
    showWorkspaceNotice('success', `${label} ouvert.`);
  };

  const handleOpenUpgrade = () => {
    if (UPGRADE_URL) {
      openExternalLink(UPGRADE_URL, 'Upgrade');
      return;
    }

    openUserProfile();
    setShowMenu(false);
    pushSessionLog('Profil utilisateur ouvert (fallback upgrade).', 'info');
    showWorkspaceNotice('info', 'Espace upgrade ouvert via le profil utilisateur.');
  };

  const handleOpenBilling = () => {
    if (BILLING_URL) {
      openExternalLink(BILLING_URL, 'Facturation');
      return;
    }

    openUserProfile();
    setShowMenu(false);
    pushSessionLog('Profil utilisateur ouvert (fallback facturation).', 'info');
    showWorkspaceNotice('info', 'Espace facturation ouvert via le profil utilisateur.');
  };

  const formatCounter = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return '--';
    return Math.round(value).toLocaleString('fr-FR');
  };

  const handleDownloadWorkspace = () => {
    const exportText = latestAssistantMessage.trim();
    if (!exportText) {
      showWorkspaceNotice('warn', 'Aucun contenu a exporter pour le moment.');
      return;
    }

    const extension = activeTab === 'code' ? 'txt' : 'md';
    const mimeType = activeTab === 'code' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
    const fileName = `mindmesh-workspace-${Date.now()}.${extension}`;
    const blob = new Blob([exportText], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    pushSessionLog(`Export workspace (${fileName}) termine.`, 'success');
    showWorkspaceNotice('success', 'Export telecharge avec succes.');
  };

  const handleShareWorkspace = async () => {
    const exportText = latestAssistantMessage.trim();
    if (!exportText) {
      showWorkspaceNotice('warn', 'Aucun contenu a partager pour le moment.');
      return;
    }

    const sharePayload = {
      title: 'MindMesh Workspace',
      text: shrinkText(exportText, 1900),
    };

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share(sharePayload);
        pushSessionLog('Partage workspace effectue.', 'success');
        showWorkspaceNotice('success', 'Contenu partage avec succes.');
        return;
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportText);
        pushSessionLog('Copie workspace dans le presse-papiers.', 'success');
        showWorkspaceNotice('success', 'Contenu copie dans le presse-papiers.');
        return;
      }

      throw new Error('CLIPBOARD_UNAVAILABLE');
    } catch (error) {
      console.error('Partage workspace impossible:', error);
      pushSessionLog('Partage workspace impossible.', 'warn');
      showWorkspaceNotice('warn', 'Partage indisponible sur ce navigateur.');
    }
  };

  const resetSession = () => {
    clearMessages();
    setMessage('');
    setSessionLogs([]);
    resetAgentStatuses();
    setCurrentView('chat');
    setActiveTab('preview');
    setObjectiveProgress(0);
    setObjectiveStep(0);
    setCurrentObjective(null);
    setSessionSummary(null);
    setSecurityScore(99.8);

    const nextSessionId = createSessionId();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
      } catch {
        // noop
      }
    }
    setSessionId(nextSessionId);
    void persistSessionState({
      sessionId: nextSessionId,
      currentObjective: null,
      sessionSummary: null,
      objectiveStep: 0,
      objectiveProgress: 0,
      currentView: 'chat',
      activeTab: 'preview',
    });
  };

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    const selectedAttachments = attachments.map((attachment) => ({ ...attachment }));
    const hasAttachments = selectedAttachments.length > 0;
    if ((!trimmedMessage && !hasAttachments) || isLoading || isPreparingAttachments) return;

    const compactPrompt = trimmedMessage.replace(/\s+/g, ' ').trim();

    let nextCurrentObjective = currentObjective;

    if (!currentObjective && compactPrompt) {
      const capturedObjective = captureObjectiveFromMessage(compactPrompt);
      if (capturedObjective) {
        nextCurrentObjective = capturedObjective;
        setCurrentObjective(nextCurrentObjective);
      }
    }

    const nextObjectiveStep = Math.min(objectiveStep + 1, 5);
    const nextObjectiveProgress = Math.min(objectiveProgress + 20, 100);

    clearAttachments();
    resetAgentStatuses();
    setMessage('');
    setObjectiveStep(nextObjectiveStep);
    setObjectiveProgress(nextObjectiveProgress);

    void persistSessionState({
      currentObjective: nextCurrentObjective,
      sessionSummary,
      objectiveStep: nextObjectiveStep,
      objectiveProgress: nextObjectiveProgress,
    });

    await sendMessage(trimmedMessage, { attachments: selectedAttachments });
  };

  const handleExecuteWorkspace = async () => {
    if (isLoading || isExecutingWorkspace) return;

    const workspaceSeed = latestAssistantMessage.trim();
    if (!workspaceSeed) {
      showWorkspaceNotice('warn', 'Aucune sortie IA disponible a executer.');
      return;
    }

    const executionPrompt =
      'Transforme la sortie suivante en plan d\'execution operationnel avec checklist actionnable, risques et priorites:\n\n' +
      workspaceSeed;

    setCurrentView('chat');
    setIsExecutingWorkspace(true);
    pushSessionLog('Execution workspace declenchee...', 'info');
    showWorkspaceNotice('info', 'Execution en cours via l\'orchestrateur.');
    try {
      await sendMessage(executionPrompt);
    } finally {
      setIsExecutingWorkspace(false);
    }
  };

  // GESTION DU MICRO
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('MEDIA_DEVICES_UNAVAILABLE');
        }

        if (typeof MediaRecorder === 'undefined') {
          throw new Error('MEDIA_RECORDER_UNSUPPORTED');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const selectedMimeType = pickRecorderMimeType();
        const mediaRecorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
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
          stream.getTracks().forEach((track) => track.stop());

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
            const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
              method: 'POST',
              headers: authHeaders,
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
      }
    }
  };

  return (
    <div className="flex h-screen w-full bg-[var(--background)] text-[var(--text)] font-sans overflow-hidden relative transition-colors duration-500">
      <div className={`absolute top-[-200px] right-[-100px] w-[900px] h-[900px] ${isDarkMode ? 'bg-purple-600/10' : 'bg-purple-400/15'} rounded-full blur-[180px] pointer-events-none transition-colors duration-1000`} />
      <div className={`absolute bottom-[-250px] left-[-100px] w-[800px] h-[800px] ${isDarkMode ? 'bg-pink-600/5' : 'bg-pink-400/10'} rounded-full blur-[160px] pointer-events-none transition-colors duration-1000`} />
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[1100px] ${isDarkMode ? 'bg-purple-600/5' : 'bg-purple-400/10'} rounded-full blur-[220px] pointer-events-none transition-colors duration-1000`} />
      <div className="absolute inset-0 bg-dot-grid pointer-events-none opacity-[0.08]" />

      <aside className="m-4 w-72 glass-dark rounded-[40px] border border-white/10 flex flex-col p-6 z-20 shadow-2xl overflow-hidden relative shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3 group cursor-pointer">
              <Brain className="w-9 h-9 text-purple-600 dark:text-fuchsia-400 drop-shadow-md" />
              <span className={`text-xl font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-purple-950'}`}>MindMesh</span>
            </div>

            <motion.button 
              whileHover={{ scale: 1.1, rotate: 10 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-10 h-10 glass rounded-xl flex items-center justify-center text-purple-400 hover:text-white transition-colors"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </motion.button>
          </div>

          <button
            onClick={() => {
              setCurrentView('chat');
              resetSession();
            }}
            className="flex items-center justify-center gap-2 w-full py-3.5 px-4 gradient-vibrant text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-all mb-8 group active:scale-95 shadow-lg shadow-purple-500/20"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            <span>Nouveau Chat</span>
          </button>

          <nav className="mb-8 space-y-4">
            <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} uppercase text-[9px] font-black tracking-widest px-2 mb-2`}>
              <LayoutDashboard className="w-3 h-3" />
              <span>Navigation</span>
            </div>
            <button
              type="button"
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-xs font-semibold cursor-pointer transition-colors ${
                currentView === 'dashboard'
                  ? `${isDarkMode ? 'bg-purple-500/15 border-purple-400/40 text-white' : 'bg-purple-100 border-purple-300 text-purple-950'}`
                  : `${isDarkMode ? 'bg-white/5 border-white/5 text-white/80 hover:bg-purple-500/10' : 'bg-purple-900/5 border-purple-500/10 text-purple-950 hover:bg-purple-500/10'}`
              }`}
            >
              <Activity className={`w-4 h-4 ${currentView === 'dashboard' ? 'text-purple-400' : 'text-purple-400/70'}`} />
              <span className={currentView === 'dashboard' ? (isDarkMode ? 'text-white' : 'text-purple-950') : (isDarkMode ? 'text-white/80' : 'text-purple-950/85')}>
                Tableau de bord
              </span>
            </button>
          </nav>

                    <div className="mb-6">
            <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} uppercase text-[9px] font-black tracking-widest px-2 mb-4`}>
              <Target className="w-3 h-3" />
              <span>Mes Objectifs</span>
            </div>

            {currentObjective ? (
              <motion.div
                whileHover={{ y: -2 }}
                className={`rounded-[24px] p-5 mb-4 border transition-all cursor-pointer relative overflow-hidden group shadow-2xl ${isDarkMode ? 'bg-[#150925] border-white/5' : 'bg-white/80 border-purple-200'}`}
              >
                <div className="flex justify-between items-start mb-3 relative z-10">
                  <span className={`font-semibold text-xs ${isDarkMode ? 'text-gray-300' : 'text-purple-900'}`}>{currentObjective}</span>
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded-full text-[9px] font-black tracking-tighter">{objectiveProgress}%</span>
                </div>
                <div className={`w-full h-1.5 rounded-full overflow-hidden mb-3 relative z-10 ${isDarkMode ? 'bg-white/5' : 'bg-purple-100'}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: String(objectiveProgress) + '%' }}
                    transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
                    className="gradient-vibrant h-full rounded-full"
                  />
                </div>
                <div className={`flex items-center gap-2 text-[10px] relative z-10 ${isDarkMode ? 'text-white/20' : 'text-purple-900/30'}`}>
                  <Trophy className="w-3 h-3 text-purple-400/40" />
                  <span className="font-medium">{completedSteps} sur 5 etapes completees</span>
                </div>
                {sessionSummary && (
                  <div className={`mt-3 pt-3 border-t relative z-10 text-[11px] leading-relaxed ${isDarkMode ? 'border-white/10 text-white/60' : 'border-purple-100 text-purple-950/70'}`}>
                    {sessionSummary}
                  </div>
                )}
              </motion.div>
            ) : (
              <p className="text-xs text-gray-400 italic mt-2">Aucun objectif en cours</p>
            )}
          </div>
          <div className="mt-auto relative">
            <SignedOut>
              <SignInButton mode='modal'>
                <button className='w-full glass p-3 rounded-xl text-sm font-bold text-white gradient-vibrant shadow-lg shadow-purple-500/20 hover:scale-105 transition-all'>
                  Se connecter
                </button>
              </SignInButton>
            </SignedOut>
            
            <SignedIn>
              <div 
                onClick={() => setShowMenu(!showMenu)} 
                className={`w-full flex items-center gap-3 p-4 glass rounded-2xl border cursor-pointer transition-colors ${isDarkMode ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-gray-200 bg-white/50 hover:bg-gray-50'}`}
              >
                <img src={user?.imageUrl} alt='Avatar' className='w-10 h-10 rounded-full border border-purple-500/50' />
                <div className="flex-1 relative text-left">
                  <div className='text-sm font-bold text-[var(--text)]'>{user?.firstName || 'Utilisateur'}</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest">Plan Gratuit</div>
                </div>
              </div>

              {showMenu && (
                <div className="absolute bottom-20 left-4 right-4 glass bg-white/95 dark:bg-black/80 backdrop-blur-xl p-2 rounded-xl border border-gray-200 dark:border-white/10 flex flex-col gap-1 z-50 shadow-2xl">
                  <button
                    type="button"
                    onClick={handleOpenUpgrade}
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all border border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.25)] bg-purple-500/10 dark:bg-purple-500/20 font-bold text-purple-700 dark:text-purple-300"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    Passer Pro
                  </button>
                  <button onClick={() => { openUserProfile(); setShowMenu(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    Paramètres
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenBilling}
                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                    Facturation
                  </button>
                  <div className="h-px bg-gray-200 dark:bg-white/10 my-1"></div>
                  <button onClick={() => signOut()} className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg transition-colors font-medium">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Déconnexion
                  </button>
                </div>
              )}
            </SignedIn>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative z-20 bg-transparent min-w-0">
        <div className="absolute top-8 right-10 z-30">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-5 py-2.5 glass rounded-full border border-white/10 text-[9px] font-black tracking-[0.2em] uppercase ${isDarkMode ? 'text-purple-300' : 'text-purple-700'} hover:text-white dark:hover:text-white transition-all cursor-pointer hover:bg-purple-500/10 active:bg-purple-500/20 shadow-2xl`}
          >
            MULTI-AGENT ORCHESTRATOR
          </motion.div>
        </div>

        <div className="flex-1 p-10 flex flex-col items-center justify-center relative overflow-hidden">
          {currentView === 'dashboard' ? (
            <div className={`w-full max-w-6xl relative z-10 rounded-3xl border p-8 md:p-10 ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-purple-100 text-slate-700'}`}>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className={`text-2xl md:text-3xl font-serif tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                    Tableau de bord opérationnel
                  </h2>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
                    Etat backend, compteurs plateforme et indicateurs de session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshBackendSnapshot()}
                  disabled={isRefreshingSnapshot}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold tracking-wide transition-colors ${
                    isRefreshingSnapshot
                      ? `${isDarkMode ? 'bg-white/5 border-white/10 text-white/40' : 'bg-slate-100 border-slate-200 text-slate-400'} cursor-not-allowed`
                      : `${isDarkMode ? 'bg-purple-500/10 border-purple-400/30 text-purple-200 hover:bg-purple-500/20' : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'}`
                  }`}
                >
                  {isRefreshingSnapshot ? 'Synchronisation...' : 'Rafraîchir'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-purple-100'}`}>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-black ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Health</div>
                  <div className={`mt-2 text-xl font-semibold ${backendSnapshot.health === 'ok' ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-red-400' : 'text-red-600')}`}>
                    {backendSnapshot.health.toUpperCase()}
                  </div>
                  <div className={`text-xs mt-1 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>maj: {formatSnapshotTime(backendSnapshot.updatedAt)}</div>
                </div>

                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-purple-100'}`}>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-black ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Readiness</div>
                  <div className={`mt-2 text-xl font-semibold ${backendSnapshot.ready === 'ready' ? (isDarkMode ? 'text-green-400' : 'text-green-600') : backendSnapshot.ready === 'degraded' ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : (isDarkMode ? 'text-red-400' : 'text-red-600')}`}>
                    {backendSnapshot.ready.toUpperCase()}
                  </div>
                  <div className={`text-xs mt-1 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>mode: {backendSnapshot.mode}</div>
                </div>

                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-purple-100'}`}>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-black ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Database</div>
                  <div className={`mt-2 text-xl font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                    {backendSnapshot.databaseStatus.toUpperCase()}
                  </div>
                  <div className={`text-xs mt-1 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>raison: {shrinkText(backendSnapshot.reason, 55) || '--'}</div>
                </div>

                <div className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-purple-100'}`}>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-black ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Session</div>
                  <div className={`mt-2 text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{totalMessages}</div>
                  <div className={`text-xs mt-1 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>messages totaux</div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className={`rounded-2xl border p-5 ${isDarkMode ? 'bg-black/20 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-black mb-4 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Compteurs backend</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className={`rounded-xl p-3 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>HTTP req</div>
                      <div className="mt-1 font-semibold">{formatCounter(metricsSnapshot.httpRequestsTotal)}</div>
                    </div>
                    <div className={`rounded-xl p-3 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Orchestrator</div>
                      <div className="mt-1 font-semibold">{formatCounter(metricsSnapshot.orchestratorCallsTotal)}</div>
                    </div>
                    <div className={`rounded-xl p-3 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Provider errs</div>
                      <div className="mt-1 font-semibold">{formatCounter(metricsSnapshot.providerErrorsTotal)}</div>
                    </div>
                    <div className={`rounded-xl p-3 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Auth fails</div>
                      <div className="mt-1 font-semibold">{formatCounter(metricsSnapshot.authFailuresTotal)}</div>
                    </div>
                  </div>
                  <div className={`text-xs mt-4 ${metricsSnapshot.error ? (isDarkMode ? 'text-amber-300' : 'text-amber-700') : (isDarkMode ? 'text-white/40' : 'text-slate-500')}`}>
                    {metricsSnapshot.error || `Dernière collecte: ${formatSnapshotTime(metricsSnapshot.updatedAt)}`}
                  </div>
                </div>

                <div className={`rounded-2xl border p-5 ${isDarkMode ? 'bg-black/20 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-black mb-4 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>KPI conversation</div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className={isDarkMode ? 'text-white/60' : 'text-slate-600'}>Messages utilisateur</span>
                      <span className="font-semibold">{userMessagesCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isDarkMode ? 'text-white/60' : 'text-slate-600'}>Réponses assistant</span>
                      <span className="font-semibold">{assistantMessagesCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isDarkMode ? 'text-white/60' : 'text-slate-600'}>Erreurs UI/API</span>
                      <span className={`font-semibold ${failedMessagesCount > 0 ? (isDarkMode ? 'text-red-400' : 'text-red-600') : ''}`}>{failedMessagesCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isDarkMode ? 'text-white/60' : 'text-slate-600'}>Latence observée</span>
                      <span className="font-semibold">{latencyMs !== null ? `${latencyMs.toFixed(1)}ms` : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isDarkMode ? 'text-white/60' : 'text-slate-600'}>Logs session</span>
                      <span className="font-semibold">{sessionLogs.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div 
                key="accueil"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center max-w-2xl relative z-10"
              >
                <div className="mb-12 relative inline-block group">
                  <div className="absolute -inset-16 bg-indigo-600/10 blur-[80px] rounded-full animate-pulse" />
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1.2, ease: 'backOut' }}
                    className="relative w-28 h-28 flex items-center justify-center"
                  >
                    <Brain className={`w-24 h-24 ${isDarkMode ? 'text-white/5' : 'text-purple-900/10'} absolute blur-2xl`} />
                    <Brain className={`w-24 h-24 ${isDarkMode ? 'text-white/10' : 'text-purple-500/40'} relative z-10 group-hover:text-purple-500/60 transition-colors duration-700`} />
                  </motion.div>
                </div>
                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className={`text-4xl font-serif leading-snug mb-4 tracking-tighter ${isDarkMode ? 'text-white' : 'text-slate-800'}`}
                >
                  Comment puis-je vous aider aujourd'hui ?
                </motion.h2>
                <p className='text-[var(--text-muted)] text-sm max-w-sm mx-auto leading-relaxed'>
                   Déployez vos agents spécialisés pour structurer, créer et automatiser vos projets.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full flex flex-col gap-6 overflow-y-auto custom-scrollbar p-6 relative z-10 mx-auto"
              >
                {messages.map((m, index) => {
                  const isUserMessage = m.role === 'user';
                  const isAssistantMessage = m.role === 'assistant';
                  const isErrorMessage = m.role === 'system' && m.tone === 'error';

                  return (
                  <div key={index} className={`flex gap-4 ${isUserMessage ? 'justify-end' : ''}`}>
                    {isAssistantMessage && (
                      <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shrink-0">
                        <Brain size={18} />
                      </div>
                    )}

                    {isErrorMessage && (
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 border border-red-500/30 shrink-0">
                        <AlertTriangle size={18} />
                      </div>
                    )}
                    
                    <div className={`text-sm leading-relaxed markdown-body ${markdownBubbleClass} ${
                      isUserMessage
                        ? 'w-fit max-w-[80%] px-4 py-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-none shadow-lg shadow-purple-500/20 whitespace-pre-wrap break-words'
                        : isErrorMessage
                          ? `w-fit max-w-[80%] px-4 py-2 rounded-2xl rounded-bl-none ${isDarkMode ? 'bg-red-500/10 border border-red-500/40 text-red-100' : 'bg-red-50 border border-red-200 text-red-700'}`
                          : `w-fit max-w-[80%] px-4 py-2 rounded-2xl rounded-bl-none ${isDarkMode ? 'bg-white/5 border border-white/10 text-gray-200' : 'bg-white border border-purple-100 text-slate-700 shadow-sm'}`
                    }`}>
                      {isUserMessage ? (
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{(m.content || '').replace(/\\n/g, '\n')}</ReactMarkdown>
                      )}
                    </div>

                    {m.attachments && m.attachments.length > 0 && (
                      <div className={`mt-2 flex max-w-[80%] flex-wrap gap-2 ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
                        {m.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-xs ${isDarkMode ? 'border-white/10 bg-black/20 text-gray-200' : 'border-purple-100 bg-white text-slate-700'}`}
                          >
                            {attachment.kind === 'image' && attachment.dataUrl ? (
                              <img
                                src={attachment.dataUrl}
                                alt={attachment.name}
                                className="h-10 w-10 rounded-xl object-cover border border-white/10"
                              />
                            ) : (
                              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDarkMode ? 'bg-white/10 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>
                                {attachment.kind === 'image' ? <Image className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{attachment.name}</div>
                              <div className={isDarkMode ? 'text-white/40' : 'text-slate-500'}>
                                {attachment.kind === 'image' ? 'Image' : 'Document'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {isUserMessage && (
                      <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center border border-white/10 overflow-hidden shrink-0 shadow-lg">
                        <img src={user?.imageUrl || "https://picsum.photos/seed/userelegant/100/100"} alt="Avatar user" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  );
                })}
                
                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shrink-0 animate-pulse">
                      <Brain size={18} />
                    </div>
                    <div className={`p-5 rounded-[24px] rounded-bl-none italic text-sm border ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-white border-purple-100 text-slate-500'}`}>
                      L'Orchestrateur réfléchit...
                    </div>
                  </div>
                )}
              </motion.div>
            )}          </AnimatePresence>
          )}
        </div>

        <div className="p-10 pt-0 w-full flex justify-center">
          <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
            {workspaceNotice && (
              <div className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium ${workspaceNoticeToneClass}`}>
                {workspaceNotice.text}
              </div>
            )}
            <SignedOut>
              <div className='w-full text-center p-4 glass rounded-2xl text-[var(--text-dim)] text-sm'>Veuillez vous connecter pour instruire MindMesh.</div>
            </SignedOut>
            <SignedIn>
              <ChatComposer
                message={message}
                attachments={attachments}
                attachmentInputRef={attachmentInputRef}
                isDarkMode={isDarkMode}
                isRecording={isRecording}
                isPreparingAttachments={isPreparingAttachments}
                isLoading={isLoading}
                onMessageChange={(value) => {
                  const nextInput = value;
                  setMessage(nextInput);
                  setSecurityScore(evaluatePromptSecurity(nextInput));
                }}
                onSendMessage={handleSend}
                onToggleRecording={toggleRecording}
                onAttachmentSelection={handleAttachmentSelection}
              />

              {isPreparingAttachments && (
                <div className={`mt-2 text-xs font-medium ${isDarkMode ? 'text-purple-200' : 'text-purple-700'}`}>
                  Préparation des pièces jointes...
                </div>
              )}
            </SignedIn>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {currentView === 'chat' && messages.length > 0 && (
          <motion.aside 
            initial={{ opacity: 0, width: 0, marginRight: 0 }}
            animate={{ opacity: 1, width: "34rem", marginRight: "1rem" }}
            exit={{ opacity: 0, width: 0, marginRight: 0 }}
            className="my-4 glass-dark rounded-[40px] border border-white/10 flex flex-col pt-6 overflow-y-auto custom-scrollbar z-20 shadow-2xl relative overflow-hidden shrink-0"
          >
            <div className="absolute inset-0 bg-gradient-to-bl from-white/5 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col h-full w-[34rem]">
              <div className="px-10 pb-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-8">
                  <div className={`flex items-center gap-1 rounded-2xl border p-1 backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-200 bg-white/60'}`}>
                    {[
                      { id: 'preview' as const, label: 'Aperçu', icon: Eye },
                      { id: 'code' as const, label: 'Code', icon: Code },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-colors ${
                          activeTab === tab.id
                            ? `${isDarkMode ? 'bg-white/20 border border-white/20 text-white' : 'bg-purple-600/15 border border-purple-300/70 text-purple-950'}`
                            : `${isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-purple-900/70 hover:text-purple-950 hover:bg-purple-100/70'}`
                        }`}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadWorkspace}
                      className={`p-2.5 ${isDarkMode ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-purple-100 text-purple-900/50 hover:text-purple-600'} rounded-xl transition-all`}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareWorkspace()}
                      className={`p-2.5 ${isDarkMode ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-purple-100 text-purple-900/50 hover:text-purple-600'} rounded-xl transition-all`}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExecuteWorkspace()}
                      disabled={isLoading || isExecutingWorkspace || !latestAssistantMessage.trim()}
                      className={`flex items-center gap-2 px-5 py-2.5 gradient-vibrant text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-xl transition-all shadow-purple-500/20 ${
                        isLoading || isExecutingWorkspace || !latestAssistantMessage.trim()
                          ? 'opacity-60 cursor-not-allowed'
                          : 'hover:scale-105'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isExecutingWorkspace ? 'Exécution...' : 'Exécuter'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black tracking-[0.3em] uppercase ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'}`}>ESPACE DE TRAVAIL</span>
                  <div className="flex items-center gap-2 px-3 py-1 glass rounded-full border border-white/10">
                    <div className={`w-1.5 h-1.5 rounded-full ${workspaceRuntimeDotClass}`} />
                    <span className={`text-[9px] font-black tracking-widest uppercase ${workspaceRuntimeTextClass}`}>{workspaceRuntimeLabel}</span>
                  </div>
              </div>

              <div className="px-10 pt-8">
                <div className={`rounded-[28px] border backdrop-blur-xl p-6 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-200 bg-white/70'}`}>
                  {activeTab === 'preview' ? (
                    <div className={`markdown-body ${markdownBubbleClass} text-sm leading-relaxed ${isDarkMode ? 'text-gray-200' : 'text-slate-700'}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {latestAssistantMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <pre className={`text-xs leading-relaxed font-mono whitespace-pre-wrap break-words rounded-2xl p-4 border ${isDarkMode ? 'bg-black/30 border-white/10 text-gray-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                      <code>{latestAssistantMessage || '// Aucune réponse disponible pour le moment.'}</code>
                    </pre>
                  )}
                </div>
              </div>

              <div className="px-10 py-8">
                <h3 className={`text-[9px] font-black tracking-[0.3em] uppercase ${isDarkMode ? 'text-white/20' : 'text-purple-900/40'} mb-8 flex items-center gap-3 transition-colors`}>
                  <Activity className="w-4 h-4 text-purple-400/60" />
                  ÉQUIPE MOBILISÉE
                </h3>

                <div className="space-y-4">
                  {agents.map((agent) => {
                    const isAgentActive = agentStatuses[agent.id] === 'working';
                    return (
                    <motion.div 
                      key={agent.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileHover={{ x: 4 }}
                      className={`border p-5 rounded-[28px] flex items-center gap-5 group transition-all cursor-pointer relative shadow-xl ${
                        isDarkMode 
                          ? 'bg-white/5 border-white/10 hover:bg-white/10 shadow-black/40' 
                          : 'bg-white/60 border-purple-200 hover:bg-purple-50 shadow-purple-500/10'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                        isAgentActive
                          ? 'border-purple-500/30 bg-purple-500/10' 
                          : `${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-200 bg-white'}`
                      }`}>
                        <agent.icon className={`w-5 h-5 transition-colors duration-500 ${isAgentActive ? 'text-purple-500' : `${isDarkMode ? 'text-white/30' : 'text-purple-900/30'}`}`} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-bold text-sm mb-0.5 tracking-tight group-hover:text-purple-600 transition-colors ${isDarkMode ? 'text-white' : 'text-purple-950'}`}>{agent.name}</div>
                        <div className={`text-[10px] ${isDarkMode ? 'text-white/40' : 'text-purple-900/60'} font-medium tracking-wide`}>{agent.role}</div>
                      </div>
                      <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black tracking-widest uppercase border transition-all ${
                        isAgentActive
                          ? `bg-purple-500/10 border-purple-500/30 animate-pulse ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}` 
                          : `${isDarkMode ? 'bg-white/5 border-white/10 text-white/30' : 'bg-purple-100 border-purple-200 text-purple-900/60'}`
                      }`}>
                        {isAgentActive ? 'WORKING' : 'IDLE'}
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-auto px-10 py-8 border-t border-white/5 bg-transparent">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-purple-100 bg-white/60'}`}>
                      <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/40' : 'text-purple-950/60'} text-[8px] font-black uppercase tracking-widest mb-1`}>
                        <Cpu className="w-3 h-3" />
                        Latence
                      </div>
                      <div className={`text-xl font-serif italic ${isDarkMode ? 'text-gray-300' : 'text-purple-950'}`}>{latencyMs !== null ? String(latencyMs.toFixed(1)) + 'ms' : '--'}</div>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-purple-100 bg-white/60'}`}>
                      <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/40' : 'text-purple-950/60'} text-[8px] font-black uppercase tracking-widest mb-1`}>
                        <ShieldCheck className="w-3 h-3" />
                        Score Sécurité
                      </div>
                      <div className={`text-xl font-serif italic ${securityScoreTextClass}`}>{securityScore.toFixed(1)}%</div>
                  </div>
                </div>

                <div className={`rounded-2xl p-6 border font-mono text-[10px] overflow-hidden relative group ${isDarkMode ? 'bg-black/20 shadow-inner border-white/10' : 'bg-white/60 shadow-sm border-purple-100'}`}>
                  <div className={`flex items-center justify-between mb-4 pb-2 border-b ${isDarkMode ? 'border-white/5' : 'border-purple-100'}`}>
                    <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/40' : 'text-purple-950/60'}`}>
                      <Terminal className="w-3 h-3" />
                      <span className="uppercase tracking-[0.2em] font-black text-[8px]">Session Logs</span>
                    </div>
                    <span className={`${isDarkMode ? 'text-white/30' : 'text-purple-950/50'} text-[8px] font-bold`}>PID: 4020-SYS</span>
                  </div>

                  <div
                    ref={logsContainerRef}
                    className="space-y-2 opacity-80 max-h-28 overflow-y-auto custom-scrollbar pr-1"
                  >
                    {sessionLogs.length === 0 ? (
                      <div className="text-[10px] text-purple-500/70">Aucun log pour le moment.</div>
                    ) : (
                      sessionLogs.map((log) => (
                        <div key={log.id} className={'flex gap-3 font-medium ' + getLogToneClass(log.tone)}>
                          <span>[{log.timestamp}]</span>
                          <span>{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(168, 85, 247, 0.2)'}; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(168, 85, 247, 0.3)'}; }
        ::selection { background: ${isDarkMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.2)'}; color: ${isDarkMode ? 'white' : '#1a0b2e'}; }
        
        .markdown-body p { margin-bottom: 0.75em; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body strong { font-weight: 700; color: inherit; }
        .markdown-body ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 0.75em; }
        .markdown-body ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 0.75em; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { font-weight: 700; margin-top: 1em; margin-bottom: 0.5em; }
      `}</style>
    </div>
  );
}



