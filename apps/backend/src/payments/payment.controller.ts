import type { Request, Response } from 'express';
import { parseWebhookEvent } from './payment.validators.js';
import * as paymentService from './payment.service.js';

export async function handleWebhook(req: Request, res: Response) {
  const signature = req.header('x-razorpay-signature');
  if (!signature || !Buffer.isBuffer(req.body) || !paymentService.verifyWebhookSignature(req.body, signature)) {
    res.status(400).json({ error: 'Invalid webhook signature.' });
    return;
  }

  const event = parseWebhookEvent(JSON.parse(req.body.toString('utf8')));
  const result = await paymentService.applyWebhookEvent(event);
  res.status(200).json({ data: result });
}