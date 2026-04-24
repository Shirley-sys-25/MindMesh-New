import dotenv from 'dotenv';

dotenv.config();

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const toInt = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPercent = (value, fallback = 100) => {
  const parsed = toInt(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = toInt(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

const toList = (value, fallback = []) => {
  if (!value || typeof value !== 'string') return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const authRequired = toBool(process.env.AUTH_REQUIRED, isProd);
const authBypass = toBool(process.env.AUTH_BYPASS, !isProd);

const mode = (process.env.ORCHESTRATION_MODE || 'legacy').trim().toLowerCase();
const orchestrationMode = ['legacy', 'hybrid', 'crewai'].includes(mode) ? mode : 'legacy';

const internalSecrets = toList(process.env.INTERNAL_AUTH_SHARED_SECRETS || process.env.INTERNAL_AUTH_SHARED_SECRET, []);
const metricsAdminToken = (process.env.METRICS_ADMIN_TOKEN || '').trim();
const metricsHeaderSecret = (process.env.METRICS_HEADER_SECRET || '').trim();
const databaseEnabled = toBool(process.env.DATABASE_ENABLED, true);
const databaseUrl = (process.env.DATABASE_URL || 'postgresql://mindmesh:mindmesh@localhost:5432/mindmesh').trim();
const databaseInitMaxRetries = Math.max(1, toInt(process.env.DATABASE_INIT_MAX_RETRIES, 3));
const databaseInitRetryMs = Math.max(100, toInt(process.env.DATABASE_INIT_RETRY_MS, 1500));
const dbLogRetentionDays = Math.max(1, toInt(process.env.DB_LOG_RETENTION_DAYS, 90));
const dbRetentionCleanupIntervalMin = Math.max(1, toInt(process.env.DB_RETENTION_CLEANUP_INTERVAL_MIN, 360));

if (authRequired && authBypass) {
  throw new Error('Configuration invalide: AUTH_REQUIRED=true et AUTH_BYPASS=true en meme temps.');
}

if (authRequired && !authBypass) {
  if (!process.env.AUTH_JWKS_URI) throw new Error('AUTH_JWKS_URI est requis quand AUTH_REQUIRED=true.');
  if (!process.env.AUTH_ISSUER) throw new Error('AUTH_ISSUER est requis quand AUTH_REQUIRED=true.');
  if (!process.env.AUTH_AUDIENCE) throw new Error('AUTH_AUDIENCE est requis quand AUTH_REQUIRED=true.');
}

if (orchestrationMode !== 'legacy' && internalSecrets.length === 0) {
  throw new Error('INTERNAL_AUTH_SHARED_SECRETS est requis quand ORCHESTRATION_MODE est hybrid/crewai.');
}

if (databaseEnabled && !databaseUrl) {
  throw new Error('DATABASE_URL est requis quand DATABASE_ENABLED=true.');
}

if (isProd && !metricsAdminToken && !metricsHeaderSecret) {
  throw new Error('METRICS_ADMIN_TOKEN ou METRICS_HEADER_SECRET est requis en production.');
}

export const env = {
  nodeEnv,
  isProd,
  port: toInt(process.env.PORT, 4020),
  logLevel: process.env.LOG_LEVEL || 'info',
  trustProxyLevel: toNonNegativeInt(process.env.TRUST_PROXY_LEVEL, 0),

  corsAllowedOrigins: toList(process.env.CORS_ALLOWED_ORIGINS, ['http://localhost:3000']),

  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://build.lewisnote.com/v1',
  openaiModel: (process.env.OPENAI_MODEL || 'gpt-5.4-mini').trim() || 'gpt-5.4-mini',

  asrModel: process.env.ASR_MODEL || 'afri-asr',
  asrApiKey: process.env.ASR_API_KEY || process.env.OPENAI_API_KEY || '',
  asrEndpoint: process.env.ASR_ENDPOINT || 'https://build.lewisnote.com/v1/audio/afri-asr/transcribe',
  asrTimeoutMs: toInt(process.env.ASR_TIMEOUT_MS, 45_000),
  transcribeMaxBytes: toInt(process.env.TRANSCRIBE_MAX_BYTES, 10 * 1024 * 1024),

  databaseEnabled,
  databaseUrl,
  databaseSsl: toBool(process.env.DATABASE_SSL, false),
  databaseInitMaxRetries,
  databaseInitRetryMs,
  dbLogRetentionDays,
  dbRetentionCleanupIntervalMin,

  authRequired,
  authBypass,
  authJwksUri: process.env.AUTH_JWKS_URI || '',
  authIssuer: process.env.AUTH_ISSUER || '',
  authAudience: toList(process.env.AUTH_AUDIENCE, []),
  authDefaultScopes: toList(process.env.AUTH_DEFAULT_SCOPES, ['read:only']),
  authStrictScopes: toBool(process.env.AUTH_STRICT_SCOPES, isProd),
  authLeewaySeconds: toInt(process.env.AUTH_LEEWAY_SECONDS, 60),

  metricsAdminToken,
  metricsHeaderSecret,

  orchestrationMode,
  orchestrationCrewaiPercent: toPercent(process.env.ORCHESTRATION_CREWAI_PERCENT, 100),
  orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:8081',
  orchestratorTimeoutMs: toInt(process.env.ORCHESTRATOR_TIMEOUT_MS, 45000),

  internalAuthIssuer: process.env.INTERNAL_AUTH_ISSUER || 'public-api',
  internalAuthAudience: process.env.INTERNAL_AUTH_AUDIENCE || 'crewai-orchestrator',
  internalAuthKid: process.env.INTERNAL_AUTH_KID || 'v1',
  internalAuthTtlSec: toInt(process.env.INTERNAL_AUTH_TTL_SEC, 90),
  internalAuthSharedSecrets: internalSecrets,

  rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitChatMax: toInt(process.env.RATE_LIMIT_CHAT_MAX, 30),
  rateLimitTranscribeMax: toInt(process.env.RATE_LIMIT_TRANSCRIBE_MAX, 12),
};
