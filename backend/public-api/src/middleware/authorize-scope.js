import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export const authorizeScope = (requiredScope) => (req, _res, next) => {
  if (!requiredScope) return next();
  const scopes = new Set((req.auth?.scopes || []).map(String));

  if (!scopes.has(requiredScope)) {
    if (env.authBypass || !env.authStrictScopes) return next();
    return next(new AppError(403, 'AUTH_FORBIDDEN', 'Permissions insuffisantes.'));
  }

  return next();
};
