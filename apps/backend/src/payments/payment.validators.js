import { z } from 'zod';
export const paymentWebhookSchema = z.object({
    event: z.enum(['payment.captured', 'payment.failed']),
    payload: z.object({
        payment: z.object({
            entity: z.object({
                id: z.string().min(1),
                order_id: z.string().min(1),
            }),
        }),
    }),
});
export function parseWebhookEvent(input) {
    const parsed = paymentWebhookSchema.parse(input);
    return {
        event: parsed.event,
        payment: {
            id: parsed.payload.payment.entity.id,
            orderId: parsed.payload.payment.entity.order_id,
        },
    };
}
