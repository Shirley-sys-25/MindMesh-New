import multer from 'multer';
import { logger } from '../config/logger.js';
import { AppError, errorPayload } from '../utils/errors.js';

const toAppError = (error) => {
  if (error instanceof AppError) return error;

  if (error?.message === 'CORS origin not allowed') {
    return new AppError(403, 'CORS_ORIGIN_FORBIDDEN', 'Origine non autorisee.');
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'TRANSCRIBE_FILE_TOO_LARGE', 'Fichier audio trop volumineux.');
    }
    return new AppError(400, 'TRANSCRIBE_INVALID_UPLOAD', 'Upload audio invalide.');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Erreur interne.', { expose: false });
};

export const notFoundHandler = (req, res) => {
  const appError = new AppError(404, 'NOT_FOUND', 'Route introuvable.');
  res.status(404).json(errorPayload(appError, req.requestId));
};

export const errorHandler = (error, req, res, _next) => {
  const appError = toAppError(error);
  logger.error(
    {
      err: error,
      request_id: req.requestId,
      code: appError.code,
      status: appError.status,
      route: req.originalUrl,
      method: req.method,
      user_sub: req.auth?.sub,
    },
    'request_failed',
  );

  if (res.headersSent) return;
  res.status(appError.status).json(errorPayload(appError, req.requestId));
};
