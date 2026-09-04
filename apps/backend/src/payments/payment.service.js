import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { db, orders } from '@repo/db';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import * as auditService from '../audit/audit.service.js';
export async function getOrderStatus(orderId) {
    const [order] = await db
        .select({
        orderId: orders.razorpayOrderId,
        paymentId: orders.razorpayPaymentId,
        status: orders.status,
        amount: orders.amount,
        currency: orders.currency,
    })
        .from(orders)
        .where(eq(orders.razorpayOrderId, orderId))
        .limit(1);
    if (!order)
        throw new Error(`No local order found for Razorpay order "${orderId}".`);
    return order;
}
function getClient() {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }
    return new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
}
export async function createOrder(input) {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
        throw new Error('Order quantity must be a positive integer.');
    }
    const razorpayOrder = await getClient().orders.create({
        amount: input.amount,
        currency: input.currency,
        receipt: input.sessionId,
    });
    const [order] = await db
        .insert(orders)
        .values({
        sessionId: input.sessionId,
        productId: input.productId,
        quantity: input.quantity,
        amount: input.amount,
        currency: input.currency,
        status: 'created',
        razorpayOrderId: razorpayOrder.id,
    })
        .returning({ id: orders.id, razorpayOrderId: orders.razorpayOrderId });
    return {
        id: order.razorpayOrderId,
        amount: input.amount,
        currency: input.currency,
    };
}
export function verifyWebhookSignature(rawBody, signature) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
        throw new Error('Razorpay webhook secret is not configured.');
    }
    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
export async function applyWebhookEvent(event) {
    const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, event.payment.orderId)).limit(1);
    if (!order) {
        throw new Error(`No local order found for Razorpay order "${event.payment.orderId}".`);
    }
    const status = event.event === 'payment.captured' ? 'paid' : 'failed';
    if (order.status !== status || order.razorpayPaymentId !== event.payment.id) {
        await db
            .update(orders)
            .set({ status, razorpayPaymentId: event.payment.id, updatedAt: new Date() })
            .where(eq(orders.id, order.id));
    }
    await auditService.logAction({
        sessionId: order.sessionId,
        actionType: 'payment_result',
        reason: `Razorpay payment ${status}.`,
        payload: { event: event.event, orderId: event.payment.orderId, paymentId: event.payment.id },
    });
    return { status, orderId: event.payment.orderId, paymentId: event.payment.id };
}
