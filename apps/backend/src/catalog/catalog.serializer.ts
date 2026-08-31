import type { products } from '@repo/db';
import type { SchemaOrgProduct } from './catalog.types.js';

type ProductRow = typeof products.$inferSelect;

function toAvailabilityUrl(availability: string): string {
  return `https://schema.org/${availability}`;
}

export function serializeProduct(row: ProductRow): SchemaOrgProduct {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    sku: row.sku,
    name: row.name,
    brand: row.brand ? { '@type': 'Brand', name: row.brand } : undefined,
    category: row.category ?? undefined,
    offers: {
      '@type': 'Offer',
      price: (row.price / 100).toFixed(2),
      priceCurrency: row.currency,
      availability: toAvailabilityUrl(row.availability),
    },
    extensions: {
      voiceDescription: row.voiceDescription,
      maxAutoApproveAmount: row.maxAutoApproveAmount,
      requiresConfirmationAbove: row.requiresConfirmationAbove,
      discountRules:
        (row.extensions?.discountRules as { condition: string; discountPercent: number }[]) ?? [],
      liveAvailabilityEndpoint: (row.extensions?.liveAvailabilityEndpoint as string) ?? null,
      gender: row.gender,
      size: row.size,
    },
  };
}

export function serializeProducts(rows: ProductRow[]): SchemaOrgProduct[] {
  return rows.map(serializeProduct);
}