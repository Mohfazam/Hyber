import { searchProductsQuerySchema, skuParamSchema } from './catalog.validators.js';
import * as catalogService from './catalog.service.js';
import { serializeProduct, serializeProducts } from './catalog.serializer.js';
export async function searchProducts(req, res) {
    const filters = searchProductsQuerySchema.parse(req.query);
    const rows = await catalogService.searchProducts(filters);
    const data = serializeProducts(rows);
    res.status(200).json({
        count: data.length,
        limit: filters.limit,
        offset: filters.offset,
        data,
    });
}
export async function getProductBySku(req, res) {
    const { sku } = skuParamSchema.parse(req.params);
    const row = await catalogService.getProductBySku(sku);
    const data = serializeProduct(row);
    res.status(200).json({ data });
}
export async function getProductAvailability(req, res) {
    const { sku } = skuParamSchema.parse(req.params);
    const data = await catalogService.getLiveAvailability(sku);
    res.status(200).json({ data });
}
export async function getCatalogSchema(_req, res) {
    res.status(200).json({
        description: 'Product catalog conforming to schema.org Product, extended with agent-safety fields under `extensions`.',
        standard: 'https://schema.org/Product',
        fields: {
            sku: 'Unique product identifier (string)',
            name: 'Product display name (string)',
            brand: 'schema.org Brand object',
            category: 'Merchant-defined category (string)',
            offers: {
                price: 'Decimal string, in major currency unit (e.g. rupees, not paise)',
                priceCurrency: 'ISO 4217 currency code (e.g. INR)',
                availability: 'Full schema.org availability URL (e.g. https://schema.org/InStock)',
            },
            extensions: {
                voiceDescription: 'Natural-language description intended for TTS output, not display.',
                maxAutoApproveAmount: 'Amount (paise) below which a purchase may be treated as low-risk by the gating engine. Still always requires explicit user confirmation.',
                requiresConfirmationAbove: 'Amount (paise) above which the gating engine must escalate before allowing purchase.',
                discountRules: 'Merchant-defined, machine-readable discount conditions (read-only for agents — not negotiable).',
                liveAvailabilityEndpoint: 'Path to the real-time stock-check endpoint for this SKU.',
                gender: 'Applicable gender, if relevant to this product category.',
                size: 'Applicable size, if relevant to this product category.',
            },
        },
    });
}
