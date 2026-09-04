import { Router } from 'express';
import { handleWebhook } from './payment.controller.js';

export const paymentRouter = Router();
paymentRouter.post('/webhook', handleWebhook);