import { useEffect, useState } from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { Brain } from 'lucide-react';
import { motion } from 'motion/react';

type AuthMode = 'sign-in' | 'sign-up';

interface AuthViewProps {
  mode: AuthMode;
  isDarkMode: boolean;
  onNavigate?: (nextPath: string) => void;
}

const createClerkAppearance = (isDarkMode: boolean) => ({
  variables: {
    colorBackground: isDarkMode ? '#0f0516' : '#ffffff',
    colorPrimary: '#a855f7',
    colorText: isDarkMode ? '#ffffff' : '#0f172a',
    colorInputBackground: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.04)',
    colorInputText: isDarkMode ? '#ffffff' : '#0f172a',
    colorDanger: '#ef4444',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    card: 'bg-transparent shadow-none border-0',
    headerTitle: isDarkMode ? 'text-white' : 'text-slate-900',
    headerSubtitle: isDarkMode ? 'text-white/60' : 'text-slate-600',
    formButtonPrimary: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20 hover:opacity-95',
    formFieldInput: isDarkMode ? 'bg-white/5 border border-white/10 text-white placeholder:text-white/30' : 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400',
    formFieldLabel: isDarkMode ? 'text-white/70' : 'text-slate-700',
    footerActionLink: 'text-purple-300 hover:text-purple-200',
    socialButtonsBlockButton: isDarkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    socialButtonsBlockButtonText: isDarkMode ? 'text-white' : 'text-slate-900',
    dividerLine: isDarkMode ? 'bg-white/10' : 'bg-slate-200',
    dividerText: isDarkMode ? 'text-white/35' : 'text-slate-500',
    identityPreviewText: isDarkMode ? 'text-white' : 'text-slate-900',
    identityPreviewEditButton: 'text-purple-300',
  },
});

export default function AuthView({ mode, isDarkMode }: AuthViewProps) {
  const isSignIn = mode === 'sign-in';
  const clerkAppearance = createClerkAppearance(isDarkMode);
  const titleClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const bodyClass = isDarkMode ? 'text-white/60' : 'text-slate-600';
  const surfaceClass = isDarkMode ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white/85';
  const welcomeTitle = 'Bienvenue sur MindMesh';
  const [typedTitle, setTypedTitle] = useState(isSignIn ? '' : welcomeTitle);

  useEffect(() => {
    if (!isSignIn) {
      setTypedTitle(welcomeTitle);
      return;
    }

    setTypedTitle('');
    let nextIndex = 0;
    let timeoutId: number | undefined;

    const tick = () => {
      nextIndex += 1;
      setTypedTitle(welcomeTitle.slice(0, nextIndex));
      if (nextIndex < welcomeTitle.length) {
        timeoutId = window.setTimeout(tick, 75);
      }
    };

    timeoutId = window.setTimeout(tick, 80);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isSignIn]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--text)]">
      <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-60" />
      <div className="pointer-events-none absolute -right-40 top-[-140px] h-[520px] w-[520px] rounded-full bg-purple-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute -left-44 bottom-[-180px] h-[560px] w-[560px] rounded-full bg-pink-500/10 blur-[160px]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/20" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-8 xl:grid-cols-[0.95fr_1.05fr]">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={`relative overflow-hidden rounded-[36px] border p-6 shadow-[0_30px_120px_rgba(15,23,42,0.24)] backdrop-blur-2xl md:p-8 lg:p-10 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white/80'}`}
          >
            <div className={`pointer-events-none absolute inset-0 ${isDarkMode ? 'bg-gradient-to-br from-white/5 via-transparent to-purple-500/5' : 'bg-gradient-to-br from-white/60 via-transparent to-purple-200/35'}`} />

            <div className="relative z-10 flex flex-col gap-10">
              <div className="max-w-2xl space-y-7">
                <div className="flex items-center gap-4">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-[22px] border ${isDarkMode ? 'border-white/10 bg-white/5 text-purple-100' : 'border-slate-200 bg-white/70 text-purple-700'}`}>
                    <Brain className="h-8 w-8" />
                  </div>
                  <div>
                    <div className={`text-[10px] font-black uppercase tracking-[0.32em] ${isDarkMode ? 'text-purple-100/80' : 'text-purple-700/80'}`}>
                      MindMesh
                    </div>
                    <div className={`mt-1 font-serif text-3xl tracking-tight ${titleClass}`}>
                      Orchestrateur IA
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h1 className={`font-serif text-5xl leading-[0.98] tracking-tight md:text-6xl lg:text-7xl ${titleClass}`}>
                    <span>{typedTitle}</span>
                    {isSignIn && (
                      <motion.span
                        aria-hidden="true"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                        className={`ml-1 inline-block ${isDarkMode ? 'text-purple-100' : 'text-purple-700'}`}
                      >
                        |
                      </motion.span>
                    )}
                  </h1>
                  <p className={`max-w-2xl text-sm leading-7 md:text-base ${bodyClass}`}>
                    Votre espace de travail intelligent propulsé par l'IA. Connectez-vous pour accéder à l'Orchestrateur Multi-Agents et booster votre productivité au quotidien.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="flex justify-center"
          >
            <div className={`w-full max-w-[480px] rounded-[36px] border p-4 shadow-[0_30px_120px_rgba(15,23,42,0.28)] backdrop-blur-2xl md:p-6 ${surfaceClass}`}>
              <div className={`rounded-[28px] border p-2 shadow-inner ${isDarkMode ? 'border-white/10 bg-[#0f0516]/85' : 'border-slate-200 bg-white/95'}`}>
                {isSignIn ? (
                  <SignIn
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/sign-up"
                    afterSignInUrl="/"
                    appearance={clerkAppearance}
                  />
                ) : (
                  <SignUp
                    routing="path"
                    path="/sign-up"
                    signInUrl="/sign-in"
                    afterSignUpUrl="/"
                    appearance={clerkAppearance}
                  />
                )}
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
