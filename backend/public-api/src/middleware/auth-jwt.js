import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { recordAuthFailure } from '../services/metrics.service.js';
import { AppError } from '../utils/errors.js';

let jwks = null;

const getJwks = () => {
  if (!jwks && env.authJwksUri) {
    jwks = createRemoteJWKSet(new URL(env.authJwksUri));
  }
  return jwks;
};

const parseScopes = (payload) => {
  const set = new Set();
  const scope = payload?.scope;
  const scp = payload?.scp;
  const permissions = payload?.permissions;

  if (typeof scope === 'string') {
    scope
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => set.add(item));
  }

  if (Array.isArray(scp)) {
    scp.map(String).forEach((item) => set.add(item));
  }

  if (Array.isArray(permissions)) {
    permissions.map(String).forEach((item) => set.add(item));
  }

  return [...set];
};

const parseRoles = (payload) => {
  const raw = payload?.roles || payload?.role || payload?.['https://mindmesh.app/roles'];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) return raw.split(/\s+/).map((item) => item.trim());
  return [];
};

const parseBearer = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
};

const FALLBACK_READ_ONLY_SCOPES = ['read:only'];

export const authJwtMiddleware = async (req, _res, next) => {
  try {
    if (!env.authRequired || env.authBypass) {
      req.auth = {
        sub: req.headers['x-dev-user'] ? String(req.headers['x-dev-user']) : 'dev-user',
        scopes: env.authDefaultScopes,
        roles: ['dev'],
        claims: {},
      };
      return next();
    }

    const token = parseBearer(req.headers.authorization);
    if (!token) {
      recordAuthFailure('missing_token');
      throw new AppError(401, 'AUTH_MISSING_TOKEN', 'Token manquant.');
    }

    const jwksResolver = getJwks();
    if (!jwksResolver) {
      throw new AppError(500, 'AUTH_CONFIG_ERROR', 'Configuration auth invalide.', { expose: false });
    }

    const { payload } = await jwtVerify(token, jwksResolver, {
      issuer: env.authIssuer,
      audience: env.authAudience.length > 0 ? env.authAudience : undefined,
      clockTolerance: env.authLeewaySeconds,
    });

    if (!payload?.sub || typeof payload.sub !== 'string') {
      recordAuthFailure('invalid_sub');
      throw new AppError(401, 'AUTH_INVALID_TOKEN', 'Token invalide: sub manquant.');
    }

    req.auth = {
      sub: payload.sub,
      scopes: (() => {
        const parsed = parseScopes(payload);
        return parsed.length > 0 ? parsed : FALLBACK_READ_ONLY_SCOPES;
      })(),
      roles: parseRoles(payload),
      claims: payload,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    recordAuthFailure('invalid_token');
    return next(new AppError(401, 'AUTH_INVALID_TOKEN', 'Token invalide ou expire.'));
  }
};
