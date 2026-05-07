import { useCallback, useEffect, useState } from 'react';
import type { BackendSnapshot, MetricsSnapshot } from '../lib/appTypes';
import { readPromCounterValue } from '../lib/appUtils';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

interface UseBackendSnapshotArgs {
  apiBaseUrl: string;
  getMetricsHeaders: () => Promise<Record<string, string>>;
}

export const useBackendSnapshot = ({ apiBaseUrl, getMetricsHeaders }: UseBackendSnapshotArgs) => {
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
    status: 'unknown',
  });

  const refreshBackendSnapshot = useCallback(async () => {
    setIsRefreshingSnapshot(true);

    try {
      const [healthResponse, readyResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/healthz`),
        fetch(`${apiBaseUrl}/readyz`),
      ]);

      let healthPayload: Record<string, unknown> | null = null;
      let readyPayload: Record<string, unknown> | null = null;

      if (healthResponse.ok) {
        try {
          const candidate: unknown = await healthResponse.json();
          healthPayload = isRecord(candidate) ? candidate : null;
        } catch {
          healthPayload = null;
        }
      }

      try {
        const candidate: unknown = await readyResponse.json();
        readyPayload = isRecord(candidate) ? candidate : null;
      } catch {
        readyPayload = null;
      }

      const healthStatus = typeof healthPayload?.status === 'string' ? healthPayload.status : '';
      const health: BackendSnapshot['health'] = healthResponse.ok && healthStatus === 'ok' ? 'ok' : 'down';

      const readyDatabaseCandidate = readyPayload?.database;
      const healthDatabaseCandidate = healthPayload?.database;
      const readyDatabase = isRecord(readyDatabaseCandidate) ? readyDatabaseCandidate : null;
      const healthDatabase = isRecord(healthDatabaseCandidate) ? healthDatabaseCandidate : null;

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
          (typeof readyDatabase?.status === 'string' && readyDatabase.status) ||
          (typeof healthDatabase?.status === 'string' && healthDatabase.status) ||
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
      const metricsResponse = await fetch(`${apiBaseUrl}/api/internal-metrics`, {
        headers: metricsHeaders,
      });

      if (!metricsResponse.ok) {
        const statusHint =
          metricsResponse.status === 401
            ? 'Acces metrics non autorise.'
            : `Impossible de lire /metrics (${metricsResponse.status}).`;
        setMetricsSnapshot({
          httpRequestsTotal: null,
          orchestratorCallsTotal: null,
          providerErrorsTotal: null,
          authFailuresTotal: null,
          error: statusHint,
          updatedAt: Date.now(),
          status: 'unknown',
        });
      } else {
        const metricsRaw = await metricsResponse.text();
        setMetricsSnapshot({
          httpRequestsTotal: readPromCounterValue(metricsRaw, 'mindmesh_http_requests_total'),
          orchestratorCallsTotal: readPromCounterValue(metricsRaw, 'mindmesh_orchestrator_calls_total'),
          providerErrorsTotal: readPromCounterValue(metricsRaw, 'mindmesh_provider_errors_total'),
          authFailuresTotal: readPromCounterValue(metricsRaw, 'mindmesh_auth_failures_total'),
          error: null,
          updatedAt: Date.now(),
          status: 'ready',
        });
      }
    } catch (error) {
      console.error('Snapshot metrics indisponible:', error);
      setMetricsSnapshot({
        httpRequestsTotal: null,
        orchestratorCallsTotal: null,
        providerErrorsTotal: null,
        authFailuresTotal: null,
        error: 'Lecture metrics impossible (reseau ou credentials).',
        updatedAt: Date.now(),
        status: 'unknown',
      });
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

  return { backendSnapshot, metricsSnapshot, isRefreshingSnapshot, refreshBackendSnapshot };
};
