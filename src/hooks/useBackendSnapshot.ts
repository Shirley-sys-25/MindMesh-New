import { useCallback, useEffect, useState } from 'react';

interface BackendSnapshot {
  health: 'ok' | 'down' | 'unknown';
  ready: 'ready' | 'degraded' | 'down' | 'unknown';
  mode: string;
  databaseStatus: string;
  reason: string;
  updatedAt: number | null;
}

interface MetricsSnapshot {
  httpRequestsTotal: number | null;
  orchestratorCallsTotal: number | null;
  providerErrorsTotal: number | null;
  authFailuresTotal: number | null;
  error: string | null;
  updatedAt: number | null;
}

const readPromCounterValue = (metricsRaw: string, metricName: string): number | null => {
  const pattern = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)$`, 'gim');
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null = pattern.exec(metricsRaw);

  while (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      total += parsed;
      found = true;
    }
    match = pattern.exec(metricsRaw);
  }

  return found ? total : null;
};

export const useBackendSnapshot = ({
  apiBaseUrl,
  getMetricsHeaders,
}: {
  apiBaseUrl: string;
  getMetricsHeaders: () => Promise<Record<string, string>>;
}) => {
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const [backendSnapshot, setBackendSnapshot] = useState<BackendSnapshot>({
    health: 'unknown',
    ready: 'unknown',
    mode: 'unknown',
    databaseStatus: 'unknown',
    reason: 'Aucune synchronisation pour le moment.',
    updatedAt: null,
  });
  const [metricsSnapshot, setMetricsSnapshot] = useState<MetricsSnapshot>({
    httpRequestsTotal: null,
    orchestratorCallsTotal: null,
    providerErrorsTotal: null,
    authFailuresTotal: null,
    error: null,
    updatedAt: null,
  });

  const refreshBackendSnapshot = useCallback(async () => {
    setIsRefreshingSnapshot(true);

    try {
      const [healthResponse, readyResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/healthz`),
        fetch(`${apiBaseUrl}/readyz`),
      ]);

      let healthPayload: any = null;
      let readyPayload: any = null;

      if (healthResponse.ok) {
        try {
          healthPayload = await healthResponse.json();
        } catch {
          healthPayload = null;
        }
      }

      try {
        readyPayload = await readyResponse.json();
      } catch {
        readyPayload = null;
      }

      const health: BackendSnapshot['health'] = healthResponse.ok && healthPayload?.status === 'ok' ? 'ok' : 'down';

      const ready: BackendSnapshot['ready'] = (() => {
        if (!readyResponse.ok) return 'down';
        if (readyPayload?.status === 'ready' && readyPayload?.degraded) return 'degraded';
        if (readyPayload?.status === 'ready') return 'ready';
        return 'degraded';
      })();

      setBackendSnapshot({
        health,
        ready,
        mode: typeof readyPayload?.mode === 'string' ? readyPayload.mode : 'unknown',
        databaseStatus:
          (typeof readyPayload?.database?.status === 'string' && readyPayload.database.status) ||
          (typeof healthPayload?.database?.status === 'string' && healthPayload.database.status) ||
          'unknown',
        reason:
          (typeof readyPayload?.reason === 'string' && readyPayload.reason) ||
          (ready === 'ready' ? 'Tous les checks backend sont au vert.' : 'Backend degrade ou indisponible.'),
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error('Snapshot backend indisponible:', error);
      setBackendSnapshot({
        health: 'down',
        ready: 'down',
        mode: 'unknown',
        databaseStatus: 'unknown',
        reason: 'API locale inaccessible. Verifie le serveur backend.',
        updatedAt: Date.now(),
      });
    }

    try {
      const metricsHeaders = await getMetricsHeaders();
      const metricsResponse = await fetch(`${apiBaseUrl}/metrics`, {
        headers: metricsHeaders,
      });

      if (!metricsResponse.ok) {
        const statusHint =
          metricsResponse.status === 401
            ? 'Acces /metrics protege (configure VITE_METRICS_ADMIN_TOKEN).'
            : `Impossible de lire /metrics (${metricsResponse.status}).`;
        setMetricsSnapshot((prev) => ({
          ...prev,
          error: statusHint,
          updatedAt: Date.now(),
        }));
      } else {
        const metricsRaw = await metricsResponse.text();
        setMetricsSnapshot({
          httpRequestsTotal: readPromCounterValue(metricsRaw, 'mindmesh_http_requests_total'),
          orchestratorCallsTotal: readPromCounterValue(metricsRaw, 'mindmesh_orchestrator_calls_total'),
          providerErrorsTotal: readPromCounterValue(metricsRaw, 'mindmesh_provider_errors_total'),
          authFailuresTotal: readPromCounterValue(metricsRaw, 'mindmesh_auth_failures_total'),
          error: null,
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error('Snapshot metrics indisponible:', error);
      setMetricsSnapshot((prev) => ({
        ...prev,
        error: 'Lecture metrics impossible (reseau ou credentials).',
        updatedAt: Date.now(),
      }));
    } finally {
      setIsRefreshingSnapshot(false);
    }
  }, [apiBaseUrl, getMetricsHeaders]);

  useEffect(() => {
    void refreshBackendSnapshot();
    const interval = window.setInterval(() => {
      void refreshBackendSnapshot();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [refreshBackendSnapshot]);

  return {
    backendSnapshot,
    isRefreshingSnapshot,
    metricsSnapshot,
    refreshBackendSnapshot,
  };
};
