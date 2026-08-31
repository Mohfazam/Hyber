import { Router } from 'express';
import * as auditController from './audit.controller.js';

export const auditRouter = Router();

auditRouter.get('/recent', auditController.getRecentActivity);
auditRouter.get('/session/:sessionId', auditController.getSessionTrail);
