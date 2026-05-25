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

export interface EnhancementResult {
  title: string;
  brand: string;
  manufacturerPartNumber: string;
  interchangeablePartNumbers: string[];
  supersedePartNumbers: string[];
  condition: string;
  placement: string;
  years: string[];
  makeModels: string[];
  keywords: string[];
}

export interface EbayOffer {
  offerId: string;
  sku: string;
  marketplaceId: string;
  format: string;
  title?: string;
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
  // Item-level fields populated from inventory_item
  condition?: string;
  conditionDescription?: string;
  imageUrls?: string[];
  aspects?: Record<string, string[]>;
  quantity?: number;
  // Resolved return policy details
  returnPolicy?: {
    name?: string;
    returnsAccepted?: boolean;
    returnPeriod?: { value: number; unit: string };
    returnShippingCostPayer?: string;
  };
  // Local scheduled date (datetime-local string, e.g. "2026-05-25T06:00")
  scheduledDate?: string | null;
  // Package dimensions & weight (from inventory item's packageWeightAndSize)
  packageWeight?: number;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  // Flat rate shipping cost (USD string, stored locally)
  shippingCost?: string;
  // eBay rate table ID (stored locally; overrides per-service shippingCost when set)
  rateTableId?: string;
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
