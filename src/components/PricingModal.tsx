import { useEffect } from 'react';
import { Check, Crown, Rocket, ShieldCheck, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  isDarkMode: boolean;
}

const plans = [
  {
    name: 'Plan Découverte',
    price: '0 FCFA',
    accent: 'from-slate-500/30 to-slate-400/10',
    icon: ShieldCheck,
    buttonLabel: 'Commencer gratuitement',
    buttonStyle: 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/75 dark:hover:bg-white/10',
    buttonDisabled: false,
    features: [
      'Assistant conversationnel pour vos questions rapides',
      "Sauvegarde complète de vos objectifs et de l'historique",
      "L'outil idéal pour explorer la puissance de MindMesh",
    ],
    badge: 'ACTIF',
  },
  {
    name: 'Pass Sprint 24h',
    price: '1 000 FCFA',
    accent: 'from-cyan-400/25 to-sky-400/10',
    icon: Rocket,
    buttonLabel: 'Bientôt disponible',
    buttonStyle: 'gradient-vibrant text-white shadow-lg shadow-purple-500/25',
    buttonDisabled: true,
    features: [
      "Accès total à l'Orchestrateur Multi-Agents pendant 24h",
      'Idéal pour vos livrables académiques ou professionnels urgents',
      'Priorité serveur maximale pour une exécution ultra-rapide',
    ],
    badge: 'BIENTÔT DISPONIBLE',
  },
  {
    name: 'Plan Pro',
    price: '20 000 FCFA / mois',
    accent: 'from-purple-500/35 to-pink-400/15',
    icon: Crown,
    buttonLabel: 'Bientôt disponible',
    buttonStyle: 'gradient-vibrant text-white shadow-lg shadow-purple-500/25',
    buttonDisabled: true,
    features: [
      'Accès illimité 24h/24 sans aucune file d\'attente',
      'Transcription vocale avancée et traitement de fichiers volumineux',
      'Fonctionnalités premium en avant-première et support prioritaire',
    ],
    badge: 'BIENTÔT DISPONIBLE',
  },
] as const;

export default function PricingModal({ open, onClose, onNavigate, isDarkMode }: PricingModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
          <motion.button
            type="button"
            aria-label="Fermer la tarification"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`relative z-10 w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-[32px] border shadow-[0_30px_120px_rgba(15,23,42,0.45)] ${isDarkMode ? 'border-white/10 bg-[#0f1020] text-white' : 'border-purple-100 bg-white text-slate-800'}`}
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
              <div className={`absolute -right-20 top-0 h-72 w-72 rounded-full blur-3xl ${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-300/30'}`} />
              <div className={`absolute -left-20 bottom-0 h-72 w-72 rounded-full blur-3xl ${isDarkMode ? 'bg-cyan-500/10' : 'bg-pink-200/35'}`} />
            </div>

            <div className="relative z-10 p-4 sm:p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="max-w-2xl">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'border-white/10 bg-white/5 text-purple-200' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Tarification MindMesh
                  </div>
                  <h2 className={`mt-4 text-3xl font-serif leading-tight tracking-tight sm:text-4xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Des offres simples, pensées pour le marché béninois.
                  </h2>
                  <p className={`mt-3 text-sm leading-7 sm:text-base ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                    Comparez les options disponibles et choisissez le rythme le plus adapté à votre usage actuel.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors ${isDarkMode ? 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white' : 'border-purple-100 bg-white text-slate-500 hover:bg-purple-50 hover:text-slate-700'}`}
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-3 items-stretch">
                {plans.map((plan) => {
                  const Icon = plan.icon;

                  return (
                    <motion.section
                      key={plan.name}
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2 }}
                      className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${plan.accent}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/10 text-purple-200' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-center ${isDarkMode ? 'border-white/10 bg-white/5 text-white/45' : 'border-purple-100 bg-slate-50 text-slate-500'}`}>
                          {plan.badge}
                        </span>
                      </div>

                      <div className="mt-5">
                        <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {plan.name}
                        </h3>
                        <p className={`mt-2 text-3xl font-serif tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {plan.price}
                        </p>
                      </div>

                      <ul className="mt-5 flex-1 space-y-3">
                        {plan.features.map((feature) => (
                          <li key={feature} className={`flex items-start gap-3 text-sm leading-6 ${isDarkMode ? 'text-white/65' : 'text-slate-600'}`}>
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isDarkMode ? 'bg-white/10 text-purple-200' : 'bg-purple-50 text-purple-700'}`}>
                              <Check className="h-3 w-3" />
                            </span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        onClick={plan.name === 'Plan Découverte' ? () => { onClose(); onNavigate('/'); } : undefined}
                        disabled={plan.buttonDisabled}
                        className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${plan.buttonStyle} ${plan.buttonDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        {plan.buttonLabel}
                      </button>

                    </motion.section>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
