import { db, products } from '@repo/db';
import { and, eq, gte, lte, or, ilike } from 'drizzle-orm';
import { NotFoundError } from '../common/errors.js';
export async function searchProducts(filters) {
    const conditions = [];
    if (filters.query) {
        conditions.push(or(ilike(products.name, `%${filters.query}%`), ilike(products.brand, `%${filters.query}%`)));
    }
    if (filters.category) {
        conditions.push(eq(products.category, filters.category));
    }
    if (filters.gender) {
        conditions.push(eq(products.gender, filters.gender));
    }
    if (filters.size) {
        conditions.push(eq(products.size, filters.size));
    }
    if (filters.minPrice !== undefined) {
        conditions.push(gte(products.price, filters.minPrice));
    }
    if (filters.maxPrice !== undefined) {
        conditions.push(lte(products.price, filters.maxPrice));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
        .select()
        .from(products)
        .where(whereClause)
        .limit(filters.limit)
        .offset(filters.offset);
    return rows;
}
export async function getProductBySku(sku) {
    const [row] = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
    if (!row) {
        throw new NotFoundError(`No product found with sku "${sku}"`);
    }
    return row;
}
export async function getLiveAvailability(sku) {
    const product = await getProductBySku(sku);
    return {
        sku: product.sku,
        availability: product.availability,
        checkedAt: new Date().toISOString(),
    };
}
