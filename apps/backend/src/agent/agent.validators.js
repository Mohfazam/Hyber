import { z } from 'zod';
export const createSessionBodySchema = z.object({
    userId: z.string().trim().optional(),
});
export const sendMessageBodySchema = z.object({
    sessionId: z.string().uuid('sessionId must be a valid UUID'),
    message: z.string().trim().min(1, 'message cannot be empty'),
});
