import { X } from 'lucide-react';
import type { BackendSnapshot, MetricsSnapshot } from '../lib/appTypes';

interface AdminDashboardViewProps {
  backendSnapshot: BackendSnapshot;
  metricsSnapshot: MetricsSnapshot;
  isRefreshingSnapshot: boolean;
  refreshBackendSnapshot: () => Promise<void>;
  onClose: () => void;
  formatSnapshotTime: (timestamp: number | null) => string;
  formatCounter: (value: number | null) => string;
  shrinkText: (value: string, max?: number) => string;
  totalMessages: number;
  userMessagesCount: number;
  assistantMessagesCount: number;
  failedMessagesCount: number;
  latencyMs: number | null;
  sessionLogsCount: number;
  isDarkMode: boolean;
}

export default function AdminDashboardView({
  backendSnapshot,
  metricsSnapshot,
  isRefreshingSnapshot,
  refreshBackendSnapshot,
  onClose,
  formatSnapshotTime,
  formatCounter,
  shrinkText,
  totalMessages,
  userMessagesCount,
  assistantMessagesCount,
  failedMessagesCount,
  latencyMs,
  sessionLogsCount,
  isDarkMode,
}: AdminDashboardViewProps) {
  return (
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
        <button
          type="button"
          onClick={onClose}
          className={`p-2 rounded-xl border ${isDarkMode ? 'border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10' : 'border-purple-100 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50'} transition-colors ml-2`}
        >
          <X className="w-4 h-4" />
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
              <span className="font-semibold">{sessionLogsCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
