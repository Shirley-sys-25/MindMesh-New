import multer from 'multer';
import { Router } from 'express';
import { env } from '../config/env.js';
import { authJwtMiddleware } from '../middleware/auth-jwt.js';
import { authorizeScope } from '../middleware/authorize-scope.js';
import { transcribeRateLimit } from '../middleware/rate-limit.js';
import { assertTranscribeFile, isAllowedAudioMime } from '../schemas/transcribe.schema.js';
import { recordTranscribeRequest } from '../services/database.service.js';
import { transcribeUploadedAudio } from '../services/transcribe.service.js';
import { AppError } from '../utils/errors.js';

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: env.transcribeMaxBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedAudioMime(file.mimetype)) {
      return cb(new AppError(400, 'TRANSCRIBE_INVALID_MIME', 'Format audio non supporte.'));
    }
    return cb(null, true);
  },
});

const transcribeHandler = async (req, res, next) => {
  let persisted = false;

  const persistTranscribe = ({ textChars = 0, status = 'ok', errorCode = null } = {}) => {
    if (persisted) return;
    persisted = true;

    recordTranscribeRequest({
      requestId: req.requestId,
      userSub: req.auth?.sub,
      mimeType: req.file?.mimetype,
      fileSize: req.file?.size,
      textChars,
      status,
      errorCode,
    });
  };

  try {
    assertTranscribeFile(req.file);
    const { text } = await transcribeUploadedAudio(req.file);
    persistTranscribe({
      textChars: typeof text === 'string' ? text.length : 0,
      status: 'ok',
    });
    res.json({ text });
  } catch (error) {
    persistTranscribe({
      textChars: 0,
      status: 'error',
      errorCode: error?.code || 'TRANSCRIBE_RUNTIME_ERROR',
    });
    next(error);
  }
};

export const transcribeRouter = Router();

transcribeRouter.post(
  '/transcribe',
  authJwtMiddleware,
  authorizeScope('transcribe:write'),
  transcribeRateLimit,
  upload.single('audio'),
  transcribeHandler,
);
