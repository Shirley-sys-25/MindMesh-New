import { Router } from 'express';
import { transcribeRouter } from './transcribe.routes.js';

export const voiceRouter = Router();
voiceRouter.use('/', transcribeRouter);
