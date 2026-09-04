import { Router } from 'express';
import { getOrderStatus, getPaymentConfig, handleWebhook } from './payment.controller.js';

export const paymentRouter = Router();
paymentRouter.post('/webhook', handleWebhook);
paymentRouter.get('/config', getPaymentConfig);
paymentRouter.get('/orders/:orderId', getOrderStatus);