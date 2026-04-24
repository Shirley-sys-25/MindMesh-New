import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: 'mindmesh_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDurationMs = new Histogram({
  name: 'mindmesh_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [25, 50, 100, 200, 400, 800, 1200, 2000, 4000, 8000],
  registers: [metricsRegistry],
});

export const authFailuresTotal = new Counter({
  name: 'mindmesh_auth_failures_total',
  help: 'Authentication failures',
  labelNames: ['reason'],
  registers: [metricsRegistry],
});

export const orchestratorCallsTotal = new Counter({
  name: 'mindmesh_orchestrator_calls_total',
  help: 'Orchestrator invocation results',
  labelNames: ['mode', 'status'],
  registers: [metricsRegistry],
});

export const providerErrorsTotal = new Counter({
  name: 'mindmesh_provider_errors_total',
  help: 'Upstream provider errors',
  labelNames: ['provider', 'reason'],
  registers: [metricsRegistry],
});

export const metricsMiddleware = (req, res, next) => {
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const route = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.baseUrl || req.path || 'unknown';
    const statusCode = String(res.statusCode);
    const method = req.method;
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

    httpRequestsTotal.labels(method, route, statusCode).inc();
    httpRequestDurationMs.labels(method, route, statusCode).observe(elapsedMs);
  });

  next();
};

export const recordAuthFailure = (reason) => {
  authFailuresTotal.labels(reason || 'unknown').inc();
};

export const recordOrchestratorCall = (mode, status) => {
  orchestratorCallsTotal.labels(mode || 'unknown', status || 'unknown').inc();
};

export const recordProviderError = (provider, reason) => {
  providerErrorsTotal.labels(provider || 'unknown', reason || 'unknown').inc();
};
