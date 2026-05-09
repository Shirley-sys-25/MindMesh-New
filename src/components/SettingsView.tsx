import { SignedIn, useClerk, useUser } from '@clerk/clerk-react';
import { ArrowLeft, BadgeCheck, CreditCard, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

interface SettingsViewProps {
  isDarkMode: boolean;
  onNavigate: (path: string) => void;
}

const formatPlanLabel = (value: unknown) => {
  if (typeof value !== 'string') return 'Gratuit';

  const normalized = value.trim();
  if (!normalized) return 'Gratuit';

  const lowered = normalized.toLowerCase();
  const labels: Record<string, string> = {
    admin: 'Admin',
    pro: 'Pro',
    premium: 'Premium',
    enterprise: 'Enterprise',
    team: 'Team',
    free: 'Gratuit',
    starter: 'Starter',
  };

  return labels[lowered] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatMetadataSource = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return 'Metadata Clerk';
  return value.toLowerCase() === 'admin' ? 'Role Clerk' : 'Metadata Clerk';
};

export default function SettingsView({ isDarkMode, onNavigate }: SettingsViewProps) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Utilisateur MindMesh';
  const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || 'Email indisponible';
  const planValue = user?.publicMetadata?.plan_type ?? user?.publicMetadata?.role;
  const currentPlan = formatPlanLabel(planValue);
  const planSource = formatMetadataSource(planValue);
  const initials = (displayName || 'M')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'M';

  return (
    <div className={`relative min-h-dvh overflow-hidden ${isDarkMode ? 'bg-[var(--background)] text-[var(--text)]' : 'bg-[var(--background)] text-[var(--text)]'}`}>
      <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-60" />
      <div className={`pointer-events-none absolute -right-40 top-[-120px] h-[520px] w-[520px] rounded-full blur-[150px] ${isDarkMode ? 'bg-purple-600/18' : 'bg-purple-400/18'}`} />
      <div className={`pointer-events-none absolute -left-44 bottom-[-180px] h-[560px] w-[560px] rounded-full blur-[160px] ${isDarkMode ? 'bg-pink-500/10' : 'bg-pink-400/10'}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/20" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className={`relative overflow-hidden rounded-[36px] border p-6 md:p-8 lg:p-10 shadow-[0_30px_120px_rgba(15,23,42,0.24)] ${isDarkMode ? 'border-white/10 bg-white/5 text-white' : 'border-purple-100 bg-white/85 text-slate-800'} backdrop-blur-2xl`}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-purple-500/5" />

            <div className="relative z-10 flex flex-col gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'border-white/10 bg-white/5 text-purple-100' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Parametres
                  </div>
                  <h1 className={`mt-5 text-4xl font-serif leading-[1.05] tracking-tight md:text-5xl lg:text-6xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Votre profil et votre abonnement
                  </h1>
                  <p className={`mt-4 max-w-2xl text-sm leading-7 md:text-base ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                    Cette page remplace le modal Clerk et conserve une lecture claire des informations utilisateur et du plan actif.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('/')}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors ${isDarkMode ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10' : 'border-purple-100 bg-white text-slate-600 hover:bg-purple-50'}`}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Retour a l'app
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSigningOut(true);
                      window.setTimeout(() => {
                        void signOut();
                        setIsSigningOut(false);
                        onNavigate('/sign-in');
                      }, 2500);
                    }}
                    disabled={isSigningOut}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors disabled:opacity-70 ${isDarkMode ? 'border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/20' : 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100'}`}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isSigningOut ? 'Déconnexion en cours...' : 'Deconnexion'}
                  </button>
                </div>
              </div>

              <SignedIn>
                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.05 }}
                    className={`overflow-hidden rounded-[32px] border p-6 md:p-7 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                          Profil
                        </p>
                        <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          Informations utilisateur
                        </h2>
                      </div>
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-black tracking-[0.2em] ${isDarkMode ? 'border-white/10 bg-white/10 text-purple-100' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                        MM
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
                      <div className={`relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[28px] border ${isDarkMode ? 'border-white/10 bg-white/10' : 'border-purple-100 bg-purple-50'}`}>
                        {user?.imageUrl ? (
                          <img src={user.imageUrl} alt="Avatar utilisateur" className="h-full w-full object-cover" />
                        ) : (
                          <span className={`text-xl font-black ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>{initials}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                            Nom complet
                          </p>
                          <p className={`mt-1 text-xl font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {displayName}
                          </p>
                        </div>

                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                            Email
                          </p>
                          <div className={`mt-1 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${isDarkMode ? 'border-white/10 bg-white/5 text-white/75' : 'border-purple-100 bg-purple-50 text-slate-700'}`}>
                            <Mail className="h-4 w-4 text-purple-400" />
                            <span className="truncate">{email}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${isDarkMode ? 'border-white/10 bg-white/5 text-white/70' : 'border-purple-100 bg-purple-50 text-slate-600'}`}>
                            <BadgeCheck className="h-3.5 w-3.5 text-purple-400" />
                            {planSource}
                          </span>
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${isDarkMode ? 'border-purple-400/30 bg-purple-500/10 text-purple-100' : 'border-purple-200 bg-purple-50 text-purple-700'}`}>
                            <UserRound className="h-3.5 w-3.5" />
                            {user?.publicMetadata?.role ? String(user.publicMetadata.role) : 'User'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isLoaded && (
                      <p className={`mt-6 text-sm ${isDarkMode ? 'text-white/45' : 'text-slate-500'}`}>
                        Chargement du profil...
                      </p>
                    )}
                  </motion.section>

                  <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.1 }}
                    className={`overflow-hidden rounded-[32px] border p-6 md:p-7 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                          Mon Abonnement
                        </p>
                        <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          Plan actuel
                        </h2>
                      </div>

                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/10 text-purple-100' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
                        <CreditCard className="h-5 w-5" />
                      </div>
                    </div>

                    <div className={`mt-6 rounded-[28px] border p-6 ${isDarkMode ? 'border-white/10 bg-black/15' : 'border-purple-100 bg-purple-50/60'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                            Statut detecte
                          </p>
                          <p className={`mt-2 text-3xl font-semibold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {currentPlan}
                          </p>
                          <p className={`mt-3 text-sm leading-6 ${isDarkMode ? 'text-white/55' : 'text-slate-600'}`}>
                            Le plan est lu depuis `publicMetadata.plan_type` puis `publicMetadata.role` pour rester compatible avec la migration future vers la base de donnees.
                          </p>
                        </div>

                        <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${isDarkMode ? 'border-purple-400/30 bg-purple-500/10 text-purple-100' : 'border-purple-200 bg-white text-purple-700'}`}>
                          {currentPlan}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}>
                          <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Source
                          </div>
                          <p className={`mt-2 text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {planSource}
                          </p>
                        </div>
                        <div className={`rounded-3xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-purple-100 bg-white'}`}>
                          <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/35' : 'text-purple-900/50'}`}>
                            <Sparkles className="h-3.5 w-3.5" />
                            A venir
                          </div>
                          <p className={`mt-2 text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            Synchronisation DB `plan_type`
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.section>
                </div>
              </SignedIn>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
