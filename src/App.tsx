import { useState } from 'react';
import { 
  Plus, 
  Target, 
  Trophy, 
  Brain, 
  Send, 
  Mic, 
  Share2, 
  Download, 
  Play, 
  Code, 
  Eye,
  ChevronDown,
  Terminal,
  Activity,
  Globe,
  Search,
  Zap,
  LayoutDashboard,
  ShieldCheck,
  Cpu,
  Sun,
  Moon
} from 'lucide-react';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Types
interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'Live' | 'Standby' | 'Running';
  icon: any;
}

export default function App() {
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('Aperçu');
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  
  const agents: Agent[] = [
    { id: '1', name: 'AfriConnect (Fon)', role: 'Traduction & Contexte Local', status: 'Standby', icon: Globe },
    { id: '2', name: 'Analyste Marché', role: 'Analyse des tendances...', status: 'Running', icon: Search },
    { id: '3', name: 'Stratège SEO', role: 'Optimisation visibilité', status: 'Standby', icon: Zap },
  ];

  return (
    <div className="flex h-screen w-full bg-[var(--background)] text-[var(--text)] font-sans overflow-hidden relative transition-colors duration-500">
      {/* ATMOSPHERIC BACKGROUND - Adjusted for theme */}
      <div className={`absolute top-[-200px] right-[-100px] w-[900px] h-[900px] ${isDarkMode ? 'bg-purple-600/10' : 'bg-purple-400/15'} rounded-full blur-[180px] pointer-events-none transition-colors duration-1000`} />
      <div className={`absolute bottom-[-250px] left-[-100px] w-[800px] h-[800px] ${isDarkMode ? 'bg-pink-600/5' : 'bg-pink-400/10'} rounded-full blur-[160px] pointer-events-none transition-colors duration-1000`} />
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[1100px] ${isDarkMode ? 'bg-purple-600/5' : 'bg-purple-400/10'} rounded-full blur-[220px] pointer-events-none transition-colors duration-1000`} />
      <div className="absolute inset-0 bg-dot-grid pointer-events-none opacity-[0.08]" />

      {/* SIDEBAR */}
      <aside className="m-4 w-72 glass-dark rounded-[40px] border border-white/10 flex flex-col p-6 z-20 shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="w-10 h-10 gradient-vibrant rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-all duration-500">
                <Brain className="w-6 h-6 text-white" />
              </div>
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

          <button className="flex items-center justify-center gap-2 w-full py-3.5 px-4 gradient-vibrant text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-all mb-8 group active:scale-95 shadow-lg shadow-purple-500/20">
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

        <div className="mt-auto">
          <div className={`flex items-center gap-3 p-4 glass rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${isDarkMode ? 'bg-[#111]/50 border-white/5' : 'bg-white border-purple-100'}`}>
            <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center border border-white/10 overflow-hidden relative z-10">
              <img src="https://picsum.photos/seed/userelegant/100/100" alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1 relative z-10">
              <div className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-purple-950'}`}>Shirley</div>
              <div className={`text-[9px] ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} uppercase font-black tracking-widest`}>Plan Gratuit</div>
            </div>
            <ChevronDown className={`w-3 h-3 transition-colors relative z-10 ${isDarkMode ? 'text-white/10' : 'text-purple-950/40'}`} />
          </div>
        </div>
      </div>
    </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col relative z-20 bg-transparent">
        {/* FLOATING ACTION */}
        <div className="absolute top-8 right-10 z-30">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-5 py-2.5 glass rounded-full border border-white/10 text-[9px] font-black tracking-[0.2em] uppercase ${isDarkMode ? 'text-purple-300' : 'text-purple-700'} hover:text-white dark:hover:text-white transition-all cursor-pointer hover:bg-purple-500/10 active:bg-purple-500/20 shadow-2xl`}
          >
            MULTI-AGENT ORCHESTRATOR
          </motion.div>
        </div>

        {/* WORKSPACE */}
        <div className="flex-1 p-10 flex flex-col items-center justify-center relative overflow-hidden">
          <AnimatePresence mode="wait">
             <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
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
                    <Brain className={`w-24 h-24 ${isDarkMode ? 'text-white/10' : 'text-purple-900/20'} relative z-10 group-hover:text-purple-500/20 transition-colors duration-700`} />
                  </motion.div>
                </div>
                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className={`text-4xl font-serif leading-snug mb-4 tracking-tighter ${isDarkMode ? 'text-white/30' : 'text-purple-950/60'}`}
                >
                  Comment puis-je vous aider aujourd'hui ?
                </motion.h2>
                <p className={`${isDarkMode ? 'text-gray-500' : 'text-purple-900/60'} text-sm max-w-sm mx-auto leading-relaxed`}>
                   Déployez vos agents spécialisés pour structurer, créer et automatiser vos projets.
                </p>
              </motion.div>
          </AnimatePresence>
        </div>

        {/* FOOTER INPUT */}
        <div className="p-10 pt-0">
          <div className="flex flex-col items-center gap-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 }}
              className="w-full max-w-4xl relative group"
            >
              <div className={`absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-[32px] blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-700`} />
              <div className={`relative glass-heavy h-20 rounded-[32px] border ${isDarkMode ? 'border-white/5' : 'border-purple-200'} flex items-center p-2 group-focus-within:border-purple-400 transition-all duration-300 shadow-2xl`}>
                <button className={`h-full px-6 flex items-center justify-center ${isDarkMode ? 'text-white/20 hover:text-white' : 'text-purple-900/20 hover:text-purple-600'} transition-colors`}>
                  <Mic className="w-5 h-5" />
                </button>
                <input 
                  type="text" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Instruire MindMesh..."
                  className={`flex-1 bg-transparent border-none outline-none text-lg ${isDarkMode ? 'placeholder:text-white/10 text-white' : 'placeholder:text-purple-900/50 text-purple-950'} px-2 font-medium`}
                />
                <button className="w-14 h-14 gradient-vibrant rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/40 hover:scale-105 active:scale-95 transition-all duration-300">
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* RIGHT PANEL */}
      <aside className="m-4 w-[34rem] glass-dark rounded-[40px] border border-white/10 flex flex-col pt-6 overflow-y-auto custom-scrollbar z-20 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-white/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full">
          {/* PANEL HEADER */}
          <div className="px-10 pb-6 border-b border-white/5">
            <div className="flex items-center justify-between mb-8">
              <div className={`flex glass rounded-2xl border border-white/10 shadow-inner p-1 ${isDarkMode ? '' : 'bg-purple-50/50'}`}>
                {['Code', 'Aperçu'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all duration-300 ${
                      activeTab === tab 
                        ? `${isDarkMode ? 'bg-white text-black shadow-lg shadow-purple-500/20' : 'bg-purple-600 text-white shadow-lg'}` 
                        : `${isDarkMode ? 'text-white/20 hover:text-white/40' : 'text-purple-950/60 hover:text-purple-950'}`
                    }`}
                  >
                    {tab === 'Code' ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {tab}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2">
                <button className={`p-2.5 ${isDarkMode ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-purple-100 text-purple-900/30 hover:text-purple-600'} rounded-xl transition-all`}><Download className="w-4 h-4" /></button>
                <button className={`p-2.5 ${isDarkMode ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-purple-100 text-purple-900/30 hover:text-purple-600'} rounded-xl transition-all`}><Share2 className="w-4 h-4" /></button>
                <button className={`flex items-center gap-2 px-5 py-2.5 ${isDarkMode ? 'bg-white text-black' : 'gradient-vibrant text-white'} rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-xl hover:scale-105 transition-all`}>
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

        {/* TEAM SECTION */}
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
                whileHover={{ x: 4, backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(168, 85, 247, 0.05)' }}
                className={`glass-heavy border border-white/5 p-5 rounded-[28px] flex items-center gap-5 group transition-all cursor-pointer relative shadow-xl ${isDarkMode ? 'shadow-black/40' : 'shadow-purple-500/10'}`}
              >
                <div className={`w-12 h-12 rounded-2xl glass flex items-center justify-center transition-all duration-500 ${agent.status === 'Running' ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/5'}`}>
                  <agent.icon className={`w-5 h-5 transition-colors duration-500 ${agent.status === 'Running' ? 'text-purple-400' : `${isDarkMode ? 'text-white/10' : 'text-purple-900/10'}`}`} />
                </div>
                <div className="flex-1">
                  <div className={`font-bold text-sm mb-0.5 tracking-tight group-hover:text-purple-500 transition-colors ${isDarkMode ? 'text-white' : 'text-purple-950'}`}>{agent.name}</div>
                  <div className={`text-[10px] ${isDarkMode ? 'text-white/20' : 'text-purple-900/30'} font-medium tracking-wide`}>{agent.role}</div>
                </div>
                <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black tracking-widest uppercase border transition-all ${
                  agent.status === 'Running' 
                    ? `bg-purple-500/10 border-purple-500/20 ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}` 
                    : `${isDarkMode ? 'bg-white/5 border-white/5 text-white/10' : 'bg-purple-900/10 border-purple-900/20 text-purple-950/50'}`
                }`}>
                  {agent.status === 'Running' ? 'Working' : 'Idle'}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* STATS OVERLAY SECTION */}
        <div className="mt-auto px-10 py-8 border-t border-white/5 bg-transparent">
          <div className="grid grid-cols-2 gap-4 mb-8">
             <div className="p-4 glass rounded-2xl border border-white/5">
                <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} text-[8px] font-black uppercase tracking-widest mb-1`}>
                   <Cpu className="w-3 h-3" />
                   Latence
                </div>
                <div className={`text-xl font-serif italic ${isDarkMode ? 'text-gray-300' : 'text-purple-950'}`}>4.2ms</div>
             </div>
             <div className="p-4 glass rounded-2xl border border-white/5">
                <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} text-[8px] font-black uppercase tracking-widest mb-1`}>
                   <ShieldCheck className="w-3 h-3" />
                   Score Sécurité
                </div>
                <div className={`text-xl font-serif italic ${isDarkMode ? 'text-purple-400' : 'text-purple-700'}`}>99.8%</div>
             </div>
          </div>

          <div className={`glass-heavy rounded-2xl p-6 border border-white/10 font-mono text-[10px] overflow-hidden relative group ${isDarkMode ? 'bg-black/20 shadow-inner' : 'bg-white/40 shadow-sm border-purple-100'}`}>
             <div className={`flex items-center justify-between mb-4 pb-2 border-b ${isDarkMode ? 'border-white/5' : 'border-purple-100'}`}>
               <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'}`}>
                 <Terminal className="w-3 h-3" />
                 <span className="uppercase tracking-[0.2em] font-black text-[8px]">Session Logs</span>
               </div>
               <span className={`${isDarkMode ? 'text-white/10' : 'text-purple-950/40'} text-[8px] font-bold`}>PID: 4020-SYS</span>
             </div>

             <div className="space-y-2 opacity-50">
                <div className="flex gap-3 text-purple-400/60 font-medium">
                   <span>[10:53]</span>
                   <span>Awaiting sync...</span>
                </div>
                <div className="flex gap-3 text-green-500/60 font-medium">
                   <span>[10:54]</span>
                   <span>Core engine ready.</span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </aside>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(168, 85, 247, 0.1)'};
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(168, 85, 247, 0.2)'};
        }
        ::selection {
          background: ${isDarkMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.2)'};
          color: ${isDarkMode ? 'white' : '#1a0b2e'};
        }
      `}</style>
    </div>
  );
}
