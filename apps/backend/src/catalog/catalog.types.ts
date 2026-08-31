export interface ProductFilters {
  query?: string;
  category?: string;
  gender?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  limit: number;
  offset: number;
}

export interface SchemaOrgProduct {
  '@context': 'https://schema.org';
  '@type': 'Product';
  sku: string;
  name: string;
  brand?: {
    '@type': 'Brand';
    name: string;
  };
  category?: string;
  offers: {
    '@type': 'Offer';
    price: string;
    priceCurrency: string;
    availability: string;
  };
  additionalProperty?: {
    '@type': 'PropertyValue';
    name: string;
    value: string;
  }[];
  extensions: {
    voiceDescription: string | null;
    maxAutoApproveAmount: number | null;
    requiresConfirmationAbove: number | null;
    discountRules: { condition: string; discountPercent: number }[];
    liveAvailabilityEndpoint: string | null;
    gender: string | null;
    size: string | null;
  };
}