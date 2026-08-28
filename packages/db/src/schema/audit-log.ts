import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sessions } from './sessions';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  actionType: text('action_type').notNull(),
  reason: text('reason'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});