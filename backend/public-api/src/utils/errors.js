export class AppError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export const errorPayload = (error, requestId) => ({
  error: {
    code: error.code || 'INTERNAL_ERROR',
    message: error.expose ? error.message : 'Erreur interne.',
    request_id: requestId,
  },
});
