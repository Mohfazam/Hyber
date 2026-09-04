import { z } from 'zod';
export const searchProductsQuerySchema = z.object({
    query: z.string().trim().min(1).optional(),
    category: z.string().trim().optional(),
    gender: z.string().trim().optional(),
    size: z.string().trim().optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    offset: z.coerce.number().int().nonnegative().default(0),
});
export const skuParamSchema = z.object({
    sku: z.string().trim().min(1, 'sku is required'),
});
