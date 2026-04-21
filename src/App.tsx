import { useState, useEffect, useRef } from 'react';
import { 
  Plus, Target, Trophy, Brain, Send, Mic, Share2, Download, Play, Code, Eye,
  Terminal, Activity, Globe, Search, Zap, LayoutDashboard,
  ShieldCheck, Cpu, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SignedIn, SignedOut, SignInButton, useClerk, useUser } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';
import logo from './assets/logo.png';

interface Agent {
  id: string; name: string; role: string; status: 'Live' | 'Standby' | 'Running'; icon: any;
}

interface Message {
  role: 'user' | 'assistant' | 'system'; content: string;
}

export default function App() {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const [showMenu, setShowMenu] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('Aperçu');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ÉTATS ET RÉFÉRENCES POUR LE MICRO
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  
  const agents: Agent[] = [
    { id: '1', name: 'AfriConnect (Fon)', role: 'Traduction & Contexte Local', status: 'Standby', icon: Globe },
    { id: '2', name: 'Analyste Marché', role: 'Analyse des tendances...', status: 'Running', icon: Search },
    { id: '3', name: 'Stratège SEO', role: 'Optimisation visibilité', status: 'Standby', icon: Zap },
  ];

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isLoading) return;

    const userMessage: Message = { role: 'user', content: trimmedMessage };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:4020/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok || !response.body) throw new Error("Erreur de connexion");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantText = "";
      let isFirstChunk = true;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          assistantText += chunk;
          
          if (isFirstChunk) {
            setIsLoading(false);
            setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
            isFirstChunk = false;
          } else {
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = { role: 'assistant', content: assistantText };
              return newMessages;
            });
          }
        }
      }
    } catch (error) {
      console.error("Erreur Chat:", error);
      setIsLoading(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: "Erreur : Connexion au Cerveau perdue." }]);
    }
  };

  // GESTION DU MICRO
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          stream.getTracks().forEach((track) => track.stop());

          const formData = new FormData();
          formData.append('audio', audioBlob, 'voice.webm');

          const oldMessage = message;
          setMessage("Transcription en cours...");

          try {
            console.log('Envoi de l\'audio');
            const res = await fetch('http://localhost:4020/api/transcribe', {
              method: 'POST',
              body: formData,
            });

            if (!res.ok) {
              throw new Error('Erreur HTTP ' + res.status);
            }
            const data = await res.json();
            console.log('Reponse transcription:', data);
            
            const transcriptText = typeof data?.text === 'string' ? data.text.trim() : '';
            if (transcriptText) {
              setMessage(oldMessage + (oldMessage ? ' ' : '') + transcriptText);
            } else {
              alert('Je n\'ai rien entendu de clair');
              setMessage(oldMessage);
            }
          } catch (err) {
            console.error("Audio mis en pause :", err);
            setMessage(oldMessage);
            alert("🎙️ La reconnaissance vocale multilingue (Afri-ASR) est en cours de déploiement. Disponible très bientôt !");
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Accès micro refusé:", err);
        alert("Veuillez autoriser l'accès au microphone dans votre navigateur.");
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
              <img src={logo} alt="MindMesh logo" className="w-14 h-14 object-contain drop-shadow-lg transition-all duration-500 group-hover:scale-110" />
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
            onClick={() => { setMessages([]); setMessage(''); }}
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
            <div className={`flex items-center gap-3 px-4 py-3 ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-purple-900/5 border-purple-500/10'} rounded-2xl border text-xs font-semibold cursor-pointer hover:bg-purple-500/10 transition-colors`}>
              <Activity className="w-4 h-4 text-purple-400" />
              <span className={isDarkMode ? 'text-white' : 'text-purple-950'}>Tableau de bord</span>
            </div>
          </nav>

          <div className="mb-6">
            <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} uppercase text-[9px] font-black tracking-widest px-2 mb-4`}>
              <Target className="w-3 h-3" />
              <span>Mes Objectifs</span>
            </div>
            
            <motion.div 
              whileHover={{ y: -2 }}
              className={`rounded-[24px] p-5 mb-4 border transition-all cursor-pointer relative overflow-hidden group shadow-2xl ${isDarkMode ? 'bg-[#150925] border-white/5' : 'bg-white/80 border-purple-200'}`}
            >
              <div className="flex justify-between items-start mb-3 relative z-10">
                <span className={`font-semibold text-xs ${isDarkMode ? 'text-gray-300' : 'text-purple-900'}`}>Lancement Agence Web</span>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded-full text-[9px] font-black tracking-tighter">40%</span>
              </div>
              <div className={`w-full h-1.5 rounded-full overflow-hidden mb-3 relative z-10 ${isDarkMode ? 'bg-white/5' : 'bg-purple-100'}`}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '40%' }}
                  transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
                  className="gradient-vibrant h-full rounded-full"
                />
              </div>
              <div className={`flex items-center gap-2 text-[10px] relative z-10 ${isDarkMode ? 'text-white/20' : 'text-purple-900/30'}`}>
                <Trophy className="w-3 h-3 text-purple-400/40" />
                <span className="font-medium">2 sur 5 étapes complétées</span>
              </div>
            </motion.div>
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
            )}
          </AnimatePresence>
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
                  onChange={(e) => setMessage(e.target.value)}
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
        {messages.length > 0 && (
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
                  <div className={`flex glass rounded-2xl border ${isDarkMode ? 'border-white/10' : 'border-purple-200 bg-purple-50/50'} shadow-inner p-1`}>
                    {['Code', 'Aperçu'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all duration-300 ${
                          activeTab === tab 
                            ? `gradient-vibrant text-white shadow-lg shadow-purple-500/20` 
                            : `${isDarkMode ? 'text-white/20 hover:text-white/40' : 'text-purple-950/60 hover:text-purple-950'}`
                        }`}
                      >
                        {tab === 'Code' ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {tab}
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
              </div>

              <div className="px-10 py-8">
                <h3 className={`text-[9px] font-black tracking-[0.3em] uppercase ${isDarkMode ? 'text-white/20' : 'text-purple-900/40'} mb-8 flex items-center gap-3 transition-colors`}>
                  <Activity className="w-4 h-4 text-purple-400/60" />
                  ÉQUIPE MOBILISÉE
                </h3>

                <div className="space-y-4">
                  {agents.map((agent) => (
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
                        agent.status === 'Running' 
                          ? 'border-purple-500/30 bg-purple-500/10' 
                          : `${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-200 bg-white'}`
                      }`}>
                        <agent.icon className={`w-5 h-5 transition-colors duration-500 ${agent.status === 'Running' ? 'text-purple-500' : `${isDarkMode ? 'text-white/30' : 'text-purple-900/30'}`}`} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-bold text-sm mb-0.5 tracking-tight group-hover:text-purple-600 transition-colors ${isDarkMode ? 'text-white' : 'text-purple-950'}`}>{agent.name}</div>
                        <div className={`text-[10px] ${isDarkMode ? 'text-white/40' : 'text-purple-900/60'} font-medium tracking-wide`}>{agent.role}</div>
                      </div>
                      <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black tracking-widest uppercase border transition-all ${
                        agent.status === 'Running' 
                          ? `bg-purple-500/10 border-purple-500/30 ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}` 
                          : `${isDarkMode ? 'bg-white/5 border-white/10 text-white/30' : 'bg-purple-100 border-purple-200 text-purple-900/60'}`
                      }`}>
                        {agent.status === 'Running' ? 'Working' : 'Idle'}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="mt-auto px-10 py-8 border-t border-white/5 bg-transparent">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-purple-100 bg-white/60'}`}>
                      <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/40' : 'text-purple-950/60'} text-[8px] font-black uppercase tracking-widest mb-1`}>
                        <Cpu className="w-3 h-3" />
                        Latence
                      </div>
                      <div className={`text-xl font-serif italic ${isDarkMode ? 'text-gray-300' : 'text-purple-950'}`}>4.2ms</div>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-purple-100 bg-white/60'}`}>
                      <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/40' : 'text-purple-950/60'} text-[8px] font-black uppercase tracking-widest mb-1`}>
                        <ShieldCheck className="w-3 h-3" />
                        Score Sécurité
                      </div>
                      <div className={`text-xl font-serif italic ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>99.8%</div>
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

                  <div className="space-y-2 opacity-80">
                      <div className="flex gap-3 text-purple-500 font-medium">
                        <span>[10:53]</span>
                        <span>Awaiting sync...</span>
                      </div>
                      <div className="flex gap-3 text-green-500 font-medium">
                        <span>[10:54]</span>
                        <span>Core engine ready.</span>
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
