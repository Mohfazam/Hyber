import { Router } from 'express';
import * as agentController from './agent.controller.js';

export const agentRouter = Router();

agentRouter.post('/session', agentController.createSession);
agentRouter.post('/message', agentController.sendMessage);
