import { pgTable, uuid, boolean, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sessions } from './sessions';

export const gatingDecisions = pgTable('gating_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  proposedAction: jsonb('proposed_action').notNull(),
  passed: boolean('passed').notNull(),
  failureReason: text('failure_reason'),
  checksPerformed: jsonb('checks_performed').$type<
    { check: string; result: boolean; detail?: string }[]
  >(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});