import { AppError } from '../utils/errors.js';

const getAdminRole = (req) => {
  const claims = req.auth?.claims;

  if (!claims || typeof claims !== 'object') return null;

  const role = claims?.metadata?.role || claims?.publicMetadata?.role || claims?.['https://mindmesh.app/role'];
  return typeof role === 'string' ? role : null;
};

export const requireAdmin = (req, _res, next) => {
  const role = getAdminRole(req);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Rôle détecté: ${role || 'inconnu'}`);
  }

  if (role === 'admin') return next();
  return next(new AppError(403, 'AUTH_FORBIDDEN', 'Acces administrateur requis.'));
};
