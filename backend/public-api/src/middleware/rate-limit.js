import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const keyGenerator = (req) => req.auth?.sub || req.ip || 'anonymous';

const baseLimiter = (max) =>
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => {
      const retryAfterSeconds = Math.ceil(env.rateLimitWindowMs / 1000);
      res.setHeader('X-Request-Id', req.requestId || 'unknown');
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Trop de requetes. Reessayez plus tard.',
          request_id: req.requestId || 'unknown',
        },
      });
    },
  });

export const chatRateLimit = baseLimiter(env.rateLimitChatMax);
export const transcribeRateLimit = baseLimiter(env.rateLimitTranscribeMax);
