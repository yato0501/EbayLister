// eBay API Types

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

export interface EbayOAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface EbayInventoryItem {
  sku: string;
  product?: {
    title?: string;
    description?: string;
    aspects?: Record<string, string[]>;
    imageUrls?: string[];
    brand?: string;
    mpn?: string;
    upc?: string[];
    ean?: string[];
    isbn?: string[];
  };
  condition?: string;
  conditionDescription?: string;
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
  packageWeightAndSize?: {
    weight?: {
      value: number;
      unit: string;
    };
    dimensions?: {
      length: number;
      width: number;
      height: number;
      unit: string;
    };
  };
}

export interface EbayOffer {
  offerId: string;
  sku: string;
  marketplaceId: string;
  format: string;
  listingDescription?: string;
  listingPolicies?: {
    fulfillmentPolicyId?: string;
    paymentPolicyId?: string;
    returnPolicyId?: string;
  };
  pricingSummary?: {
    price?: {
      value: string;
      currency: string;
    };
  };
  quantityLimitPerBuyer?: number;
  status?: string;
  listingDuration?: string;
  categoryId?: string;
  merchantLocationKey?: string;
  tax?: {
    applyTax?: boolean;
    vatPercentage?: number;
  };
}

export interface EbayOffersResponse {
  total: number;
  size: number;
  limit: number;
  offset: number;
  offers: EbayOffer[];
}

export interface EbayInventoryItemsResponse {
  total: number;
  size: number;
  limit: number;
  offset: number;
  inventoryItems: EbayInventoryItem[];
}

export interface EbayError {
  errors?: Array<{
    errorId: number;
    domain: string;
    category: string;
    message: string;
    longMessage?: string;
    parameters?: Array<{
      name: string;
      value: string;
    }>;
  }>;
}
