import { db, auditLog } from '@repo/db';
import { eq, desc } from 'drizzle-orm';
export async function logAction(input) {
    await db.insert(auditLog).values({
        sessionId: input.sessionId,
        actionType: input.actionType,
        reason: input.reason,
        payload: input.payload,
    });
}
/** Full chronological trail for one session — this is what the future
 * dashboard renders, and what you show judges live as your explainability
 * evidence. */
export async function getAuditTrail(sessionId) {
    return db
        .select()
        .from(auditLog)
        .where(eq(auditLog.sessionId, sessionId))
        .orderBy(auditLog.createdAt);
}
/** Recent activity across all sessions — useful for a merchant-facing
 * "what has the AI been doing" overview. */
export async function getRecentActivity(limit = 50) {
    return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
