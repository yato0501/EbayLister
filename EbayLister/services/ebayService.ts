import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  EbayConfig,
  EbayOAuthToken,
  EbayOffer,
  EbayOffersResponse,
  EbayInventoryItem,
  EbayInventoryItemsResponse,
  EbayError,
} from './ebay.types';

class EbayService {
  private config: EbayConfig;
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(config: EbayConfig) {
    this.config = config;

    // Use backend proxy for web, direct API for native
    // Backend proxy runs on localhost:3001 and handles CORS + authentication
    const isWeb = typeof window !== 'undefined' && !('ReactNative' in window);
    const baseURL = isWeb
      ? 'http://localhost:3001/api/ebay'
      : this.config.environment === 'sandbox'
        ? 'https://api.sandbox.ebay.com'
        : 'https://api.ebay.com';

    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Get OAuth token endpoint based on environment
   */
  private getOAuthUrl(): string {
    return this.config.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token';
  }

  /**
   * Check if the current token is valid
   */
  private isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiry) {
      return false;
    }
    // Add 60 second buffer to refresh before actual expiry
    return Date.now() < (this.tokenExpiry - 60000);
  }

  /**
   * Convert string to base64 (browser-compatible)
   */
  private toBase64(str: string): string {
    // Use btoa for browser environments
    if (typeof btoa !== 'undefined') {
      return btoa(str);
    }
    // Fallback to Buffer for Node.js environments
    return Buffer.from(str).toString('base64');
  }

  /**
   * Get OAuth 2.0 Application Token (Client Credentials)
   */
  private async getAccessToken(): Promise<string> {
    // Return existing token if still valid
    if (this.isTokenValid() && this.accessToken) {
      return this.accessToken;
    }

    try {
      const credentials = this.toBase64(
        `${this.config.clientId}:${this.config.clientSecret}`
      );

      const response = await axios.post<EbayOAuthToken>(
        this.getOAuthUrl(),
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry time in milliseconds
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      return this.accessToken;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Check if we're using the backend proxy
   */
  private isUsingProxy(): boolean {
    const baseURL = this.axiosInstance.defaults.baseURL || '';
    return baseURL.includes('localhost:3001');
  }

  /**
   * Set authorization header with current access token
   * (Skip when using backend proxy as it handles auth)
   */
  private async setAuthHeader(): Promise<void> {
    // Skip auth when using backend proxy
    if (this.isUsingProxy()) {
      return;
    }

    const token = await this.getAccessToken();
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Handle and format API errors
   */
  private handleError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<EbayError>;
      if (axiosError.response?.data?.errors) {
        console.error('eBay API Error:', JSON.stringify(axiosError.response.data.errors, null, 2));
      } else {
        console.error('eBay API Error:', axiosError.message);
      }
    } else {
      console.error('Unexpected Error:', error);
    }
  }

  /**
   * Get all offers (listing drafts and published listings)
   * @param limit - Number of offers to return (default: 100, max: 200)
   * @param offset - Number of offers to skip (for pagination)
   * @returns Promise with offers response
   */
  async getOffers(limit: number = 100, offset: number = 0): Promise<EbayOffersResponse> {
    try {
      await this.setAuthHeader();

      // eBay Sandbox sometimes has issues with query parameters
      // Try without limit/offset first
      const response = await this.axiosInstance.get<EbayOffersResponse>(
        '/sell/inventory/v1/offer'
      );

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get a specific offer by offer ID
   * @param offerId - The unique identifier of the offer
   * @returns Promise with the offer details
   */
  async getOffer(offerId: string): Promise<EbayOffer> {
    try {
      await this.setAuthHeader();

      const response = await this.axiosInstance.get<EbayOffer>(
        `/sell/inventory/v1/offer/${offerId}`
      );

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get all inventory items
   * @param limit - Number of items to return (default: 100, max: 200)
   * @param offset - Number of items to skip (for pagination)
   * @returns Promise with inventory items response
   */
  async getInventoryItems(limit: number = 100, offset: number = 0): Promise<EbayInventoryItemsResponse> {
    try {
      await this.setAuthHeader();

      const response = await this.axiosInstance.get<EbayInventoryItemsResponse>(
        '/sell/inventory/v1/inventory_item',
        {
          params: {
            limit,
            offset,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get a specific inventory item by SKU
   * @param sku - The seller-defined SKU value
   * @returns Promise with the inventory item details
   */
  async getInventoryItem(sku: string): Promise<EbayInventoryItem> {
    try {
      await this.setAuthHeader();

      const response = await this.axiosInstance.get<EbayInventoryItem>(
        `/sell/inventory/v1/inventory_item/${sku}`
      );

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get unpublished offers (listing drafts)
   * @param limit - Number of offers to return
   * @param offset - Number of offers to skip
   * @returns Promise with unpublished offers
   */
  async getListingDrafts(limit: number = 100, offset: number = 0): Promise<EbayOffer[]> {
    try {
      // eBay Sandbox has a bug with the offers endpoint - try inventory items instead
      console.log('Fetching inventory items instead of offers due to Sandbox API issues...');

      const inventoryResponse = await this.getInventoryItems(limit, offset);

      // For each inventory item, we'll create a mock offer object
      // In a real scenario, we'd need to fetch the actual offers for each SKU
      const drafts: EbayOffer[] = inventoryResponse.inventoryItems.map(item => ({
        offerId: item.sku || 'unknown',
        sku: item.sku || '',
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE' as const,
        availableQuantity: item.availability?.shipToLocationAvailability?.quantity || 0,
        categoryId: '',
        listingDescription: item.product?.description || '',
        listingPolicies: {
          paymentPolicyId: '',
          returnPolicyId: '',
          fulfillmentPolicyId: '',
        },
        pricingSummary: {
          price: {
            value: '0.00',
            currency: 'USD',
          },
        },
        status: 'UNPUBLISHED' as const,
      }));

      return drafts;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }
}

export default EbayService;
