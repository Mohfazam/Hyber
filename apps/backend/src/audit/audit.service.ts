import { db, auditLog } from '@repo/db';
import { eq, desc } from 'drizzle-orm';

/**
 * Why this file exists:
 * ONE function writes to audit_log, called by gating, and later by payments.
 * This guarantees every module logs in the same shape — you never want two
 * different "audit entry" formats floating around when a judge asks to see
 * the trail.
 */

export type AuditActionType =
  | 'intent_parsed'
  | 'catalog_match'
  | 'reservation'
  | 'purchase_proposed'
  | 'gate_checked'
  | 'otp_verified'
  | 'payment_result';

interface LogActionInput {
  sessionId: string;
  actionType: AuditActionType;
  reason?: string;
  payload?: unknown;
}

export async function logAction(input: LogActionInput): Promise<void> {
  await db.insert(auditLog).values({
    sessionId: input.sessionId,
    actionType: input.actionType,
    reason: input.reason,
    payload: input.payload as any,
  });
}

/** Full chronological trail for one session — this is what the future
 * dashboard renders, and what you show judges live as your explainability
 * evidence. */
export async function getAuditTrail(sessionId: string) {
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
