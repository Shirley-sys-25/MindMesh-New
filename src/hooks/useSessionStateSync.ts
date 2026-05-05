import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';

type SessionView = 'chat' | 'dashboard';
type SessionTab = 'preview' | 'code';

interface UseSessionStateSyncParams {
  apiBaseUrl: string;
  sessionId: string;
  currentView: SessionView;
  activeTab: SessionTab;
  currentObjective: string | null;
  sessionSummary: string | null;
  objectiveStep: number;
  objectiveProgress: number;
  getAuthorizationHeaders: () => Promise<Record<string, string>>;
  setCurrentObjective: Dispatch<SetStateAction<string | null>>;
  setSessionSummary: Dispatch<SetStateAction<string | null>>;
  setCurrentView: Dispatch<SetStateAction<SessionView>>;
  setActiveTab: Dispatch<SetStateAction<SessionTab>>;
  setObjectiveStep: Dispatch<SetStateAction<number>>;
  setObjectiveProgress: Dispatch<SetStateAction<number>>;
}

interface PersistSessionStateArgs {
  sessionId?: string;
  currentObjective?: string | null;
  sessionSummary?: string | null;
  objectiveStep?: number;
  objectiveProgress?: number;
  currentView?: SessionView | null;
  activeTab?: SessionTab | null;
}

const isSessionView = (value: unknown): value is SessionView => value === 'chat' || value === 'dashboard';

const isSessionTab = (value: unknown): value is SessionTab => value === 'preview' || value === 'code';

export const useSessionStateSync = ({
  apiBaseUrl,
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
}: UseSessionStateSyncParams) => {
  const sessionStateHydratedRef = useRef(false);

  const loadSessionState = useCallback(async () => {
    try {
      const authHeaders = await getAuthorizationHeaders();
      const response = await fetch(`${apiBaseUrl}/api/session-state?session_id=${encodeURIComponent(sessionId)}`, {
        headers: {
          ...authHeaders,
          'X-Session-Id': sessionId,
        },
      });

      if (!response.ok) return;

      const payload: any = await response.json();
      if (typeof payload?.current_objective === 'string' && payload.current_objective.trim()) {
        setCurrentObjective(payload.current_objective.trim());
      }
      if (typeof payload?.session_summary === 'string' && payload.session_summary.trim()) {
        setSessionSummary(payload.session_summary.trim());
      }
      if (isSessionView(payload?.current_view)) {
        setCurrentView(payload.current_view);
      }
      if (isSessionTab(payload?.active_tab)) {
        setActiveTab(payload.active_tab);
      }
      if (Number.isFinite(Number(payload?.objective_step))) {
        setObjectiveStep(Math.max(0, Math.min(5, Number(payload.objective_step))));
      }
      if (Number.isFinite(Number(payload?.objective_progress))) {
        setObjectiveProgress(Math.max(0, Math.min(100, Number(payload.objective_progress))));
      }
    } catch (error) {
      console.error('Etat session indisponible:', error);
    } finally {
      sessionStateHydratedRef.current = true;
    }
  }, [apiBaseUrl, getAuthorizationHeaders, sessionId, setActiveTab, setCurrentObjective, setCurrentView, setObjectiveProgress, setObjectiveStep, setSessionSummary]);

  const persistSessionState = useCallback(
    async ({
      sessionId: sessionKey = sessionId,
      currentObjective: nextCurrentObjective = currentObjective,
      sessionSummary: nextSessionSummary = sessionSummary,
      objectiveStep: nextObjectiveStep = objectiveStep,
      objectiveProgress: nextObjectiveProgress = objectiveProgress,
      currentView: nextCurrentView = currentView,
      activeTab: nextActiveTab = activeTab,
    }: PersistSessionStateArgs = {}) => {
      try {
        if (!sessionKey) return;

        const authHeaders = await getAuthorizationHeaders();
        await fetch(`${apiBaseUrl}/api/session-state`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': sessionKey,
            ...authHeaders,
          },
          body: JSON.stringify({
            session_id: sessionKey,
            current_objective: nextCurrentObjective ?? null,
            session_summary: nextSessionSummary ?? null,
            current_view: nextCurrentView ?? null,
            active_tab: nextActiveTab ?? null,
            objective_step: Number.isFinite(nextObjectiveStep) ? nextObjectiveStep : 0,
            objective_progress: Number.isFinite(nextObjectiveProgress) ? nextObjectiveProgress : 0,
          }),
        });
      } catch (error) {
        console.error('Persistance session indisponible:', error);
      }
    },
    [activeTab, apiBaseUrl, currentObjective, currentView, getAuthorizationHeaders, objectiveProgress, objectiveStep, sessionId, sessionSummary],
  );

  return {
    loadSessionState,
    persistSessionState,
    sessionStateHydratedRef,
  };
};
