import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { sessions } from './sessions';
import { products } from './products';

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  productId: uuid('product_id').references(() => products.id),
  quantity: integer('quantity').notNull().default(1),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull().default('created'),
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});