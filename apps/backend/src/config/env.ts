import 'dotenv/config';
import { z } from 'zod';

/**
 * UPDATED from the catalog-module version — added GEMINI_API_KEY.
 * Replace the contents of src/config/env.ts with this.
 */

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required for the agent module'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('? Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
