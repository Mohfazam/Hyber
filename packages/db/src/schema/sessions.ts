import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),
  language: text('language'),
  conversationHistory: jsonb('conversation_history').$type<
    { role: 'user' | 'assistant'; content: string; timestamp: string }[]
  >(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});