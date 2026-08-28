import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  currency: text('currency').notNull().default('INR'),
  availability: text('availability').notNull().default('InStock'),
  category: text('category'),
  gender: text('gender'),
  size: text('size'),
  brand: text('brand'),
  voiceDescription: text('voice_description'),
  maxAutoApproveAmount: integer('max_auto_approve_amount'),
  requiresConfirmationAbove: integer('requires_confirmation_above'),
  extensions: jsonb('extensions').$type<{
    discountRules?: { condition: string; discountPercent: number }[];
    liveAvailabilityEndpoint?: string;
    [key: string]: unknown;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});