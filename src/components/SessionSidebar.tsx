import { Activity, Globe, Search, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface Agent {
  id: string;
  name: string;
  role: string;
  icon: LucideIcon;
}

interface SessionSidebarProps {
  objective: string | null;
  agentStatuses: Record<string, 'idle' | 'working'>;
  isDarkMode: boolean;
  objectiveProgress: number;
  completedSteps: number;
  sessionSummary: string | null;
}

const agents: Agent[] = [
  { id: 'africonnect', name: 'AfriConnect', role: 'Traduction & Contexte Local', icon: Globe },
  { id: 'analyste_marche', name: 'Analyste Marché', role: 'Analyse des tendances...', icon: Search },
  { id: 'stratege_seo', name: 'Stratège SEO', role: 'Optimisation visibilité', icon: Zap },
];

export function SessionSidebar({
  objective,
  agentStatuses,
  isDarkMode,
  objectiveProgress,
  completedSteps,
  sessionSummary,
}: SessionSidebarProps) {
  return (
    <>
      <div className="mb-6">
        <div className={`flex items-center gap-2 ${isDarkMode ? 'text-white/20' : 'text-purple-950/60'} uppercase text-[9px] font-black tracking-widest px-2 mb-4`}>
          <Target className="w-3 h-3" />
          <span>Mes Objectifs</span>
        </div>

        {objective ? (
          <motion.div
            whileHover={{ y: -2 }}
            className={`rounded-[24px] p-5 mb-4 border transition-all cursor-pointer relative overflow-hidden group shadow-2xl ${isDarkMode ? 'bg-[#150925] border-white/5' : 'bg-white/80 border-purple-200'}`}
          >
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className={`font-semibold text-xs ${isDarkMode ? 'text-gray-300' : 'text-purple-900'}`}>{objective}</span>
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
    </>
  );
}
