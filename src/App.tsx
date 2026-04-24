import { useState, useEffect, useRef } from 'react';
import { 
  Plus, Target, Trophy, Brain, Send, Mic, Share2, Download, Play, Code, Eye,
  Terminal, Activity, Globe, Search, Zap, LayoutDashboard,
  ShieldCheck, Cpu, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SignedIn, SignedOut, SignInButton, useAuth, useClerk, useUser } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';

interface Agent {
  id: string; name: string; role: string; icon: any;
}

interface Message {
  role: 'user' | 'assistant' | 'system'; content: string;
}

interface SessionLog {
  id: string;
  timestamp: string;
  message: string;
  tone: 'info' | 'success' | 'warn';
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

export default function App() {
  const { signOut, openUserProfile } = useClerk();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [showMenu, setShowMenu] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [currentView, setCurrentView] = useState<'chat' | 'dashboard'>('chat');
  const [objectiveProgress, setObjectiveProgress] = useState(0);
  const [objectiveStep, setObjectiveStep] = useState(0);
  const [currentObjective, setCurrentObjective] = useState<string | null>(null);
  const [securityScore, setSecurityScore] = useState(99.8);

  // ÉTATS ET RÉFÉRENCES POUR LE MICRO
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>('audio/webm');
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (!logsContainerRef.current) return;
    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
  }, [sessionLogs]);

  const latestAssistantMessage =
    [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const completedSteps = objectiveStep;
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4020').replace(/\/+$/, '');

  const getAuthorizationHeaders = async (): Promise<Record<string, string>> => {
    try {
      const token = await getToken();
      return token ? { Authorization: 'Bearer ' + token } : {};
    } catch {
      return {};
    }
  };

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
    { id: 'AfriConnect', name: 'AfriConnect (Fon)', role: 'Traduction & Contexte Local', icon: Globe },
    { id: 'Analyste', name: 'Analyste Marche', role: 'Analyse des tendances...', icon: Search },
    { id: 'SEO', name: 'Stratege SEO', role: 'Optimisation visibilite', icon: Zap },
  ];

  const detectAgentFromPrompt = (prompt: string): string | null => {
    const normalizedPrompt = prompt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (['marche', 'vendre', 'comprendre'].some((keyword) => normalizedPrompt.includes(keyword))) {
      return 'Analyste';
    }

    if (['seo', 'visibilite'].some((keyword) => normalizedPrompt.includes(keyword))) {
      return 'SEO';
    }

    if (['traduction', 'local'].some((keyword) => normalizedPrompt.includes(keyword))) {
      return 'AfriConnect';
    }

    return null;
  };

  const formatLogTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  const pushSessionLog = (logMessage: string, tone: SessionLog['tone'] = 'info') => {
    const now = Date.now();

    setSessionLogs((prev) => {
      const nextLog: SessionLog = {
        id: String(now) + '-' + String(prev.length),
        timestamp: formatLogTime(now),
        message: logMessage,
        tone,
      };

      return [...prev, nextLog].slice(-80);
    });
  };

  const getLogToneClass = (tone: SessionLog['tone']) => {
    if (tone === 'success') return 'text-green-500';
    if (tone === 'warn') return 'text-amber-500';
    return 'text-purple-500';
  };

  const resetSession = () => {
    setMessages([]);
    setMessage('');
    setSessionLogs([]);
    setLatencyMs(null);
    setActiveAgent(null);
    setObjectiveProgress(0);
    setObjectiveStep(0);
    setCurrentObjective(null);
    setSecurityScore(99.8);
  };

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isLoading) return;

    const compactPrompt = trimmedMessage.replace(/\s+/g, ' ').trim();
    const normalizedPrompt = compactPrompt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!currentObjective) {
      const hasObjectiveIntent = ['objectif', 'analyser', 'je veux', 'lancer'].some((keyword) =>
        normalizedPrompt.includes(keyword)
      );

      if (hasObjectiveIntent) {
        const objectiveLabel = compactPrompt.length > 25 ? compactPrompt.slice(0, 25) + '...' : compactPrompt;
        setCurrentObjective(objectiveLabel);
      }
    }

    const requestStartedAt = Date.now();
    let latencyCaptured = false;
    let didLogCompletion = false;

    const captureLatency = () => {
      if (latencyCaptured) return;
      latencyCaptured = true;
      setLatencyMs(Date.now() - requestStartedAt);
    };

    const userMessage: Message = { role: 'user', content: trimmedMessage };
    const routedAgent = detectAgentFromPrompt(trimmedMessage);
    setSecurityScore(evaluatePromptSecurity(trimmedMessage));
    const routedAgentName = agents.find((agent) => agent.id === routedAgent)?.name;
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setActiveAgent(routedAgent);
    setMessage('');
    setIsLoading(true);
    setObjectiveStep((prev) => Math.min(prev + 1, 5));
    setObjectiveProgress((prev) => Math.min(prev + 20, 100));

    pushSessionLog('Awaiting sync...');
    if (routedAgentName) {
      pushSessionLog('Routing to ' + routedAgentName + '...');
    } else {
      pushSessionLog('Routing to orchestrator...');
    }

    try {
      const authHeaders = await getAuthorizationHeaders();
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok || !response.body) throw new Error('Erreur de connexion');

      pushSessionLog('Core engine ready.');

      const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let hasAssistantMessage = false;
      let sseBuffer = '';
      let streamEnded = false;

      while (!streamEnded) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        sseBuffer += decoder.decode(value, { stream: true });

        let eventBoundary = sseBuffer.indexOf('\n\n');
        while (eventBoundary !== -1) {
          const rawEvent = sseBuffer.slice(0, eventBoundary);
          sseBuffer = sseBuffer.slice(eventBoundary + 2);

          const lines = rawEvent.split(/\r?\n/);
          let eventType = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
              continue;
            }
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).replace(/^\s/, ''));
            }
          }

          if (dataLines.length > 0) {
            const payload = dataLines.join('\n');

            if (eventType === 'done' || payload === '[DONE]') {
              captureLatency();
              didLogCompletion = true;
              pushSessionLog('Generation complete.', 'success');
              streamEnded = true;
              break;
            }

            if (eventType === 'error') {
              throw new Error(payload || 'Erreur de streaming');
            }

            assistantText += payload;
            if (!hasAssistantMessage) {
              captureLatency();
              pushSessionLog('Generation started...');
              setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
              hasAssistantMessage = true;
              setIsLoading(false);
            } else {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (!last || last.role !== 'assistant') {
                  updated.push({ role: 'assistant', content: assistantText });
                } else {
                  updated[updated.length - 1] = { ...last, content: assistantText };
                }
                return updated;
              });
            }
          }

          eventBoundary = sseBuffer.indexOf('\n\n');
        }
      }

      const tail = decoder.decode();
      if (tail) {
        assistantText += tail;
        if (!hasAssistantMessage && assistantText.trim()) {
          captureLatency();
          setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
          hasAssistantMessage = true;
        }
      }

      if (!didLogCompletion) {
        captureLatency();
        pushSessionLog('Generation complete.', 'success');
      }
    } catch (error) {
      captureLatency();
      console.error('Erreur Chat:', error);
      pushSessionLog('Generation failed.', 'warn');
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Erreur : Connexion au Cerveau perdue.' }]);
    } finally {
      setIsLoading(false);
      setActiveAgent(null);
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
                  <button className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all border border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.25)] bg-purple-500/10 dark:bg-purple-500/20 font-bold text-purple-700 dark:text-purple-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    Passer Pro
                  </button>
                  <button onClick={() => { openUserProfile(); setShowMenu(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    Paramètres
                  </button>
                  <button className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
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
            <div className={`text-center max-w-2xl relative z-10 rounded-3xl border p-10 ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-purple-100 text-slate-700'}`}>
              Tableau de bord en construction...
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
                {messages.map((m, index) => (
                  <div key={index} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    {m.role === 'assistant' && (
                      <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shrink-0">
                        <Brain size={18} />
                      </div>
                    )}
                    
                    <div className={`p-5 rounded-[24px] max-w-[80%] text-sm leading-relaxed markdown-body ${
                      m.role === 'user' 
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-none shadow-lg shadow-purple-500/20' 
                        : `${isDarkMode ? 'bg-white/5 border border-white/10 text-gray-200' : 'bg-white border border-purple-100 text-slate-700 shadow-sm'} rounded-bl-none`
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    
                    {m.role === 'user' && (
                      <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center border border-white/10 overflow-hidden shrink-0 shadow-lg">
                        <img src={user?.imageUrl || "https://picsum.photos/seed/userelegant/100/100"} alt="Avatar user" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                ))}
                
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
            <SignedOut>
              <div className='w-full text-center p-4 glass rounded-2xl text-[var(--text-dim)] text-sm'>Veuillez vous connecter pour instruire MindMesh.</div>
            </SignedOut>
            <SignedIn>
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 }}
              className="w-full relative group"
            >
              <div className={`absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-[32px] blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-700`} />
              <div className={`relative glass-heavy h-20 rounded-[32px] border ${isDarkMode ? 'border-white/5 bg-black/20' : 'border-purple-200 bg-white/80'} flex items-center p-2 group-focus-within:border-purple-400 transition-all duration-300 shadow-2xl`}>
                
                <button 
                  type="button"
                  onClick={toggleRecording}
                  className={`h-full px-6 flex items-center justify-center transition-colors relative ${
                    isRecording 
                      ? 'text-red-500' 
                      : `${isDarkMode ? 'text-white/40 hover:text-white' : 'text-purple-900/40 hover:text-purple-600'}`
                  }`}
                >
                  {isRecording && (
                    <div className="absolute w-6 h-6 bg-red-500/30 rounded-full animate-ping" />
                  )}
                  <Mic className="w-5 h-5 relative z-10" />
                </button>

                <input 
                  type="text" 
                  value={message}
                  onChange={(e) => {
                    const nextInput = e.target.value;
                    setMessage(nextInput);
                    setSecurityScore(evaluatePromptSecurity(nextInput));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  placeholder={isRecording ? "Écoute en cours (Cliquez pour arrêter)..." : "Instruire MindMesh..."}
                  disabled={isRecording}
                  className={`flex-1 bg-transparent border-none outline-none text-lg ${isDarkMode ? 'placeholder:text-white/40 text-white' : 'placeholder:text-slate-500 text-slate-800'} px-2 font-medium w-full`}
                />
                
                <button 
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading || !message.trim() || isRecording}
                  className={`w-14 h-14 gradient-vibrant rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/40 transition-all duration-300 shrink-0 ${
                    isLoading || !message.trim() || isRecording ? 'opacity-50 scale-100 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
                  }`}
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </motion.div>
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
                    <button className={`p-2.5 ${isDarkMode ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-purple-100 text-purple-900/50 hover:text-purple-600'} rounded-xl transition-all`}><Download className="w-4 h-4" /></button>
                    <button className={`p-2.5 ${isDarkMode ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-purple-100 text-purple-900/50 hover:text-purple-600'} rounded-xl transition-all`}><Share2 className="w-4 h-4" /></button>
                    <button className={`flex items-center gap-2 px-5 py-2.5 gradient-vibrant text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-xl hover:scale-105 transition-all shadow-purple-500/20`}>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Exécuter</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black tracking-[0.3em] uppercase ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'}`}>ESPACE DE TRAVAIL</span>
                  <div className="flex items-center gap-2 px-3 py-1 glass rounded-full border border-white/10">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    <span className={`text-[9px] font-black tracking-widest ${isDarkMode ? 'text-green-500' : 'text-green-600'} uppercase`}>Live</span>
                  </div>
              </div>

              <div className="px-10 pt-8">
                <div className={`rounded-[28px] border backdrop-blur-xl p-6 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-200 bg-white/70'}`}>
                  {activeTab === 'preview' ? (
                    <div className={`markdown-body text-sm leading-relaxed ${isDarkMode ? 'text-gray-200' : 'text-slate-700'}`}>
                      <ReactMarkdown>
                        {latestAssistantMessage || 'Aucune réponse disponible pour le moment.'}
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
                    const isAgentActive = activeAgent === agent.id;
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
                      <div className="text-[10px] text-purple-500/70">No logs yet.</div>
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



