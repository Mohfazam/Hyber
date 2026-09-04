import { parseWebhookEvent } from './payment.validators.js';
import * as paymentService from './payment.service.js';
export function getPaymentConfig(_req, res) {
    res.status(200).json({ data: { keyId: process.env.RAZORPAY_KEY_ID ?? null } });
}
export async function getOrderStatus(req, res) {
    const result = await paymentService.getOrderStatus(req.params.orderId);
    res.status(200).json({ data: result });
}
export async function handleWebhook(req, res) {
    const signature = req.header('x-razorpay-signature');
    if (!signature || !Buffer.isBuffer(req.body) || !paymentService.verifyWebhookSignature(req.body, signature)) {
        res.status(400).json({ error: 'Invalid webhook signature.' });
        return;
    }
    const event = parseWebhookEvent(JSON.parse(req.body.toString('utf8')));
    const result = await paymentService.applyWebhookEvent(event);
    res.status(200).json({ data: result });
}
