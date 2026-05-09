import { ArrowRight, Brain, FileText, MessageSquareText, Search, Sparkles, WandSparkles, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { Message } from '../lib/appTypes';

interface QuickAction {
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}

interface DashboardViewProps {
  messages: Message[];
  isDarkMode: boolean;
  isAdmin: boolean;
  onQuickAction: (prompt: string) => void;
  onBackToChat: () => void;
  onOpenDebug?: () => void;
}

const quickActions: QuickAction[] = [
  {
    title: 'Analyser un projet',
    description: 'Obtenez une lecture claire des enjeux, risques et opportunités.',
    prompt: 'Analyse ce projet et identifie les risques, opportunites et prochaines etapes.',
    icon: Search,
  },
  {
    title: 'Brainstorming',
    description: 'Générez des idées concrètes et des pistes d exploration.',
    prompt: 'Fais un brainstorming de solutions creativites pour mon besoin.',
    icon: Sparkles,
  },
  {
    title: 'Rédiger un document',
    description: 'Transformez une idée en note, brief ou document structuré.',
    prompt: 'Rédige un document clair et structure a partir de mon idee.',
    icon: FileText,
  },
  {
    title: 'Structurer le plan',
    description: "Passez d'une intention à une feuille de route actionnable.",
    prompt: 'Aide-moi a transformer cette demande en plan d action concret.',
    icon: WandSparkles,
  },
];

export default function DashboardView({
  messages,
  isDarkMode,
  isAdmin,
  onQuickAction,
  onBackToChat,
  onOpenDebug,
}: DashboardViewProps) {
  const recentMessages = messages
    .filter((message) => message.role !== 'system')
    .slice(-4)
    .reverse();

  return (
    <div className="w-full max-w-6xl flex-1 h-full overflow-y-auto pt-8 md:pt-12 pb-8 relative z-10 mx-auto">
      <div className={`relative overflow-hidden rounded-[36px] border p-6 md:p-8 lg:p-10 shadow-[0_30px_120px_rgba(15,23,42,0.28)] ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-100' : 'bg-white/90 border-purple-100 text-slate-700'}`}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={`absolute -right-24 top-0 h-72 w-72 rounded-full blur-3xl ${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-300/30'}`} />
          <div className={`absolute -left-24 bottom-0 h-80 w-80 rounded-full blur-3xl ${isDarkMode ? 'bg-indigo-500/15' : 'bg-pink-200/40'}`} />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-10">
            <div className="max-w-3xl">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'border-white/10 bg-white/5 text-purple-200' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                <Brain className="h-3.5 w-3.5" />
                MindMesh
              </div>
              <h1 className={`mt-5 text-4xl font-serif leading-[1.05] tracking-tight md:text-5xl lg:text-6xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Bonjour, comment puis-je vous aider aujourd'hui ?
              </h1>
              <p className={`mt-4 max-w-2xl text-sm leading-7 md:text-base ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                Lancez un projet, clarifiez une idée ou reprenez une conversation existante dans un espace plus doux, plus rapide et plus lisible.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:pt-2">
              <button
                type="button"
                onClick={onBackToChat}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors ${isDarkMode ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10' : 'border-purple-100 bg-white text-slate-600 hover:bg-purple-50'}`}
              >
                <MessageSquareText className="h-4 w-4" />
                Retour au chat
              </button>
              {isAdmin && onOpenDebug && (
                <button
                  type="button"
                  onClick={onOpenDebug}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors ${isDarkMode ? 'border-purple-400/30 bg-purple-500/10 text-purple-100 hover:bg-purple-500/20' : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                >
                  Vue debug
                </button>
              )}
            </div>
          </div>

          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className={`text-lg font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Démarrage rapide
                </h2>
                <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/45' : 'text-slate-500'}`}>
                  Choisissez un point de départ et ouvrez la conversation avec une intention claire.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action, index) => (
                <motion.button
                  key={action.title}
                  type="button"
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => onQuickAction(action.prompt)}
                  className={`group relative overflow-hidden rounded-3xl border p-5 text-left transition-all ${isDarkMode ? 'border-white/10 bg-white/5 hover:border-purple-400/30 hover:bg-white/10' : 'border-purple-100 bg-white hover:border-purple-200 hover:bg-purple-50'}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all ${isDarkMode ? 'border-white/10 bg-white/10 text-purple-200 group-hover:border-purple-400/30 group-hover:bg-purple-500/15' : 'border-purple-100 bg-purple-50 text-purple-700 group-hover:border-purple-200 group-hover:bg-purple-100'}`}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-5">
                    <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {action.title}
                    </h3>
                    <p className={`mt-2 text-sm leading-6 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                      {action.description}
                    </p>
                  </div>
                  <div className={`mt-5 inline-flex items-center gap-2 text-xs font-semibold ${isDarkMode ? 'text-purple-200' : 'text-purple-700'}`}>
                    Démarrer
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${isDarkMode ? 'from-purple-400/0 via-purple-300/50 to-cyan-300/0' : 'from-purple-300/0 via-purple-300/80 to-pink-300/0'} opacity-0 transition-opacity group-hover:opacity-100`} />
                </motion.button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className={`text-lg font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Conversations récentes
                </h2>
                <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/45' : 'text-slate-500'}`}>
                  Vos derniers échanges apparaissent ici lorsque l'historique est disponible.
                </p>
              </div>
            </div>

            {recentMessages.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {recentMessages.map((message, index) => {
                  const Icon = message.role === 'assistant' ? Brain : MessageSquareText;
                  const label = message.role === 'assistant' ? 'Réponse assistant' : 'Message utilisateur';
                  const excerpt = message.content.replace(/\s+/g, ' ').trim();

                  return (
                    <motion.div
                      key={`${message.role}-${index}-${excerpt.slice(0, 24)}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.05 }}
                      className={`rounded-3xl border p-4 md:p-5 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/10 text-purple-200' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                              {label}
                            </h3>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${isDarkMode ? 'bg-white/5 text-white/40' : 'bg-slate-100 text-slate-500'}`}>
                              Récent
                            </span>
                          </div>
                           <p className={`mt-2 max-h-[4.5rem] overflow-hidden text-sm leading-6 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                             {excerpt}
                           </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className={`rounded-3xl border p-6 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}>
                <div className={`flex items-start gap-4 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/10 text-purple-200' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                    <Brain className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Aucune conversation récente
                    </h3>
                    <p className={`mt-2 text-sm leading-6 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                      Lancez une demande avec une carte de démarrage rapide pour faire apparaître votre historique ici.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
