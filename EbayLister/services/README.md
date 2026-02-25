# eBay Service

This service provides integration with the eBay Inventory API to manage listing drafts and inventory items.

## Setup

### 1. Get eBay API Credentials

1. Go to [eBay Developers Program](https://developer.ebay.com/)
2. Sign in with your eBay account
3. Navigate to "My Account" > "Application Keys"
4. Create a new application or use an existing one
5. Get your:
   - **App ID (Client ID)** - Production or Sandbox
   - **Cert ID (Client Secret)** - Production or Sandbox

### 2. Configure Credentials

Add your credentials to the `.env.development` file in the root of the project:

```env
# eBay Sandbox Credentials
EBAY_SANDBOX_CLIENT_ID=your_actual_sandbox_client_id_here
EBAY_SANDBOX_CLIENT_SECRET=your_actual_sandbox_client_secret_here

# eBay Production Credentials (when ready)
EBAY_PRODUCTION_CLIENT_ID=TBD
EBAY_PRODUCTION_CLIENT_SECRET=TBD

# Environment: sandbox or production
EBAY_ENVIRONMENT=sandbox
```

**Important:**
- The `.env.development` file is gitignored and will NOT be committed to version control
- The `.env` file is a template with "TBD" values - this one CAN be committed
- Never commit your actual credentials to version control!

### 3. Usage Example

```typescript
import EbayService from './services/ebayService';
import { ebayConfig, validateConfig } from './services/ebayConfig';

// Validate configuration
if (!validateConfig(ebayConfig)) {
  console.error('Please configure your eBay API credentials');
  return;
}

// Create service instance
const ebayService = new EbayService(ebayConfig);

// Get listing drafts
async function fetchDrafts() {
  try {
    const drafts = await ebayService.getListingDrafts();
    console.log(`Found ${drafts.length} listing drafts:`, drafts);
  } catch (error) {
    console.error('Error fetching drafts:', error);
  }
}

// Get all offers (both published and unpublished)
async function fetchAllOffers() {
  try {
    const response = await ebayService.getOffers(100, 0);
    console.log(`Total offers: ${response.total}`);
    console.log('Offers:', response.offers);
  } catch (error) {
    console.error('Error fetching offers:', error);
  }
}

// Get inventory items
async function fetchInventory() {
  try {
    const response = await ebayService.getInventoryItems(100, 0);
    console.log(`Total inventory items: ${response.total}`);
    console.log('Items:', response.inventoryItems);
  } catch (error) {
    console.error('Error fetching inventory:', error);
  }
}
```

## Available Methods

### Authentication
- Automatically handles OAuth 2.0 token generation and refresh
- Tokens are cached and automatically renewed before expiry

### Offers (Listings)
- `getOffers(limit?, offset?)` - Get all offers (drafts and published)
- `getOffer(offerId)` - Get a specific offer by ID
- `getListingDrafts(limit?, offset?)` - Get only unpublished offers (drafts)

### Inventory
- `getInventoryItems(limit?, offset?)` - Get all inventory items
- `getInventoryItem(sku)` - Get a specific inventory item by SKU

## API Documentation

- [eBay Inventory API Reference](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
- [eBay OAuth Guide](https://developer.ebay.com/api-docs/static/oauth-tokens.html)

## Sandbox vs Production

**Sandbox Environment:**
- Use for testing and development
- Separate credentials from production
- Test data only
- Base URL: `https://api.sandbox.ebay.com`

**Production Environment:**
- Live eBay marketplace
- Real listings and transactions
- Base URL: `https://api.ebay.com`

Change the environment in `.env.development`:
```env
EBAY_ENVIRONMENT=production  # or 'sandbox'
```

When switching to production, make sure to also set your production credentials in the same file.
