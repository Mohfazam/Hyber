function toAvailabilityUrl(availability) {
    return `https://schema.org/${availability}`;
}
export function serializeProduct(row) {
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
            discountRules: row.extensions?.discountRules ?? [],
            liveAvailabilityEndpoint: row.extensions?.liveAvailabilityEndpoint ?? null,
            gender: row.gender,
            size: row.size,
        },
    };
}
export function serializeProducts(rows) {
    return rows.map(serializeProduct);
}
