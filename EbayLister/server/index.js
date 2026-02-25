const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

// Load environment variables
dotenv.config({ path: '.env.development' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// eBay API configuration
const EBAY_ENV = process.env.EBAY_ENVIRONMENT || 'production';
const EBAY_BASE_URL = EBAY_ENV === 'sandbox'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

const EBAY_CLIENT_ID = EBAY_ENV === 'sandbox'
  ? process.env.EBAY_SANDBOX_CLIENT_ID
  : process.env.EBAY_PRODUCTION_CLIENT_ID;

const EBAY_CLIENT_SECRET = EBAY_ENV === 'sandbox'
  ? process.env.EBAY_SANDBOX_CLIENT_SECRET
  : process.env.EBAY_PRODUCTION_CLIENT_SECRET;

// Token cache
let accessToken = null;
let tokenExpiry = null;

// User token cache (from OAuth Authorization Code flow)
let userAccessToken = null;
let userTokenExpiry = null;
let refreshToken = null;

// OAuth callback URL - IMPORTANT: This must be configured in your eBay app settings
// Use HTTPS tunnel URL for OAuth (required by eBay)
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://concentratedly-nonsententious-donald.ngrok-free.dev/auth/ebay/callback';

/**
 * Get OAuth token from eBay
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < (tokenExpiry - 60000)) {
    return accessToken;
  }

  try {
    const credentials = Buffer.from(
      `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
    ).toString('base64');

    const oauthUrl = EBAY_ENV === 'sandbox'
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token';

    // Request specific scopes for Sell Inventory API
    const scopes = [
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
    ].join(' ');

    const response = await axios.post(
      oauthUrl,
      `grant_type=client_credentials&scope=${encodeURIComponent(scopes)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);

    console.log('✓ OAuth token obtained successfully');
    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get user access token (from Authorization Code flow)
 */
async function getUserAccessToken() {
  // Return cached user token if still valid
  if (userAccessToken && userTokenExpiry && Date.now() < (userTokenExpiry - 60000)) {
    return userAccessToken;
  }

  // If we have a refresh token, use it to get a new access token
  if (refreshToken) {
    try {
      await refreshUserToken();
      return userAccessToken;
    } catch (error) {
      console.error('Failed to refresh user token:', error.message);
      throw new Error('User authorization required. Please visit /auth/ebay to authorize.');
    }
  }

  throw new Error('User authorization required. Please visit /auth/ebay to authorize.');
}

/**
 * Refresh user access token using refresh token
 */
async function refreshUserToken() {
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const credentials = Buffer.from(
      `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
    ).toString('base64');

    const oauthUrl = EBAY_ENV === 'sandbox'
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token';

    const scopes = [
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
    ].join(' ');

    const response = await axios.post(
      oauthUrl,
      `grant_type=refresh_token&refresh_token=${refreshToken}&scope=${encodeURIComponent(scopes)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    userAccessToken = response.data.access_token;
    userTokenExpiry = Date.now() + (response.data.expires_in * 1000);

    console.log('✓ User token refreshed successfully');
  } catch (error) {
    console.error('Error refreshing user token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Start OAuth authorization flow - redirects user to eBay
 */
app.get('/auth/ebay', (req, res) => {
  const authUrl = EBAY_ENV === 'sandbox'
    ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
    : 'https://auth.ebay.com/oauth2/authorize';

  const scopes = [
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: EBAY_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: scopes,
  });

  const redirectUrl = `${authUrl}?${params.toString()}`;
  console.log('🔐 Redirecting to eBay authorization page...');
  console.log('📋 OAuth Request Details:');
  console.log('   Auth URL:', authUrl);
  console.log('   Client ID:', EBAY_CLIENT_ID);
  console.log('   Redirect URI:', REDIRECT_URI);
  console.log('   Full URL:', redirectUrl);
  res.redirect(redirectUrl);
});

/**
 * OAuth callback - receives authorization code from eBay
 */
app.get('/auth/ebay/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('❌ Authorization error:', error);
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
          <p>Error: ${error}</p>
          <a href="http://localhost:8081" style="color: #1976d2;">Return to app</a>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #d32f2f;">❌ No authorization code received</h1>
          <a href="/auth/ebay" style="color: #1976d2;">Try again</a>
        </body>
      </html>
    `);
  }

  try {
    // Exchange authorization code for access token
    const credentials = Buffer.from(
      `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
    ).toString('base64');

    const oauthUrl = EBAY_ENV === 'sandbox'
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token';

    const response = await axios.post(
      oauthUrl,
      `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    // Store tokens
    userAccessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    userTokenExpiry = Date.now() + (response.data.expires_in * 1000);

    console.log('✅ User authorization successful!');
    console.log(`   Access token expires in: ${response.data.expires_in} seconds`);
    console.log(`   Refresh token expires in: ${response.data.refresh_token_expires_in} seconds`);

    // Send tokens to the client app via deep link or redirect with tokens
    const tokenData = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + (response.data.expires_in * 1000),
    };

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #4caf50;">✅ Authorization Successful!</h1>
          <p>Your eBay account has been connected successfully.</p>
          <p>Redirecting back to app...</p>
          <script>
            // Send tokens to the app
            const tokens = ${JSON.stringify(tokenData)};

            // Try to send to React Native app via postMessage
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AUTH_SUCCESS', tokens }));
            }

            // For web, redirect with tokens as URL fragment (more secure than query params)
            setTimeout(() => {
              window.location.href = 'http://localhost:8081/#auth-success?' + encodeURIComponent(JSON.stringify(tokens));
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Token exchange error:', error.response?.data || error.message);
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #d32f2f;">❌ Token Exchange Failed</h1>
          <p>Error: ${error.message}</p>
          <a href="/auth/ebay" style="color: #1976d2;">Try again</a>
        </body>
      </html>
    `);
  }
});

/**
 * Check authorization status
 */
app.get('/auth/status', (req, res) => {
  const isAuthorized = userAccessToken && userTokenExpiry && Date.now() < userTokenExpiry;
  res.json({
    authorized: isAuthorized,
    tokenExpiry: userTokenExpiry ? new Date(userTokenExpiry).toISOString() : null,
    hasRefreshToken: !!refreshToken,
  });
});

/**
 * Set tokens from client (e.g., after app restart)
 */
app.post('/auth/tokens', (req, res) => {
  const { accessToken, refreshToken: clientRefreshToken, expiresAt } = req.body;

  if (!accessToken || !clientRefreshToken || !expiresAt) {
    return res.status(400).json({ error: 'Missing required token data' });
  }

  userAccessToken = accessToken;
  refreshToken = clientRefreshToken;
  userTokenExpiry = expiresAt;

  console.log('✓ Tokens updated from client');
  res.json({ success: true });
});

/**
 * Refresh user token endpoint for client
 */
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken: clientRefreshToken } = req.body;

  if (!clientRefreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    // Set the refresh token
    refreshToken = clientRefreshToken;

    // Refresh the token
    await refreshUserToken();

    res.json({
      accessToken: userAccessToken,
      refreshToken: refreshToken,
      expiresAt: userTokenExpiry,
    });
  } catch (error) {
    console.error('Error refreshing token:', error.message);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

/**
 * Proxy endpoint for eBay API calls
 */
app.use('/api/ebay', async (req, res) => {
  try {
    // Use user token for authenticated requests
    const token = await getUserAccessToken();

    // Extract the eBay API path
    const ebayPath = req.url;

    console.log('🔍 Proxying eBay API request:');
    console.log('   Method:', req.method);
    console.log('   Path:', ebayPath);
    console.log('   Full URL:', `${EBAY_BASE_URL}${ebayPath}`);
    console.log('   Query params:', req.query);

    // Make request to eBay API
    const response = await axios({
      method: req.method,
      url: `${EBAY_BASE_URL}${ebayPath}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
        'Accept': 'application/json',
      },
      params: req.query,
      data: req.body,
    });

    console.log('✅ eBay API response successful');
    console.log('   Status:', response.status);
    console.log('   Data:', JSON.stringify(response.data).substring(0, 200) + '...');

    res.json(response.data);
  } catch (error) {
    console.error('❌ eBay API Error:');
    console.error('   Status:', error.response?.status);
    console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message },
    });
  }
});

/**
 * Test endpoint to create a sample inventory item and listing draft
 * Accessible via GET for easy browser testing
 */
app.get('/test/create-sample-listing', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const testSKU = 'TEST' + Date.now();

    console.log('📝 Creating sample listing with SKU:', testSKU);

    // Step 1: Create inventory item
    const inventoryItem = {
      product: {
        title: 'Test Product - Do Not Buy',
        description: 'This is a test product created for eBay Lister app testing. Please do not purchase.',
        aspects: {
          Brand: ['Test Brand'],
        },
        imageUrls: ['https://via.placeholder.com/500'],
      },
      condition: 'NEW',
      availability: {
        shipToLocationAvailability: {
          quantity: 1,
        },
      },
    };

    console.log('   Step 1: Creating inventory item...');
    await axios.put(
      `${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${testSKU}`,
      inventoryItem,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
      }
    );
    console.log('   ✅ Inventory item created');

    // Step 2: Create an offer (listing draft)
    const offer = {
      sku: testSKU,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      listingDescription: 'This is a test listing. Do not purchase.',
      availableQuantity: 1,
      categoryId: '11450', // Computers/Tablets & Networking - generic category
      listingPolicies: {
        paymentPolicyId: '5914107016',  // Default sandbox payment policy
        returnPolicyId: '5914105016',   // Default sandbox return policy
        fulfillmentPolicyId: '5914106016' // Default sandbox fulfillment policy
      },
      pricingSummary: {
        price: {
          value: '9.99',
          currency: 'USD',
        },
      },
    };

    console.log('   Step 2: Creating offer (listing draft)...');
    const offerResponse = await axios.post(
      `${EBAY_BASE_URL}/sell/inventory/v1/offer`,
      offer,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
      }
    );
    console.log('   ✅ Offer created');

    res.send(`
      <html>
        <head>
          <title>Test Listing Created</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #4caf50; }
            .info { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .code { background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; }
            a { color: #1976d2; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Test Listing Created Successfully!</h1>
            <div class="info">
              <p><strong>SKU:</strong> <span class="code">${testSKU}</span></p>
              <p><strong>Offer ID:</strong> <span class="code">${offerResponse.data.offerId}</span></p>
              <p><strong>Status:</strong> UNPUBLISHED (Draft)</p>
            </div>
            <p>Your sandbox account now has a test listing draft that you can fetch using the app.</p>
            <p><a href="http://localhost:8081">← Back to App</a></p>
            <p><a href="/test/create-sample-listing">Create Another Test Listing</a></p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Failed to create sample listing:');
    console.error('   Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).send(`
      <html>
        <head>
          <title>Error Creating Test Listing</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            h1 { color: #d32f2f; }
            .error { background: #ffebee; padding: 15px; border-radius: 4px; color: #c62828; }
            pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Error Creating Test Listing</h1>
            <div class="error">
              <pre>${JSON.stringify(error.response?.data || { message: error.message }, null, 2)}</pre>
            </div>
            <p><a href="/test/create-sample-listing">Try Again</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * Diagnostic endpoint to test fetching offers with various parameters
 */
app.get('/test/diagnose-offers', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const results = [];

    // Test 1: Try without any parameters
    console.log('🔍 Test 1: Fetching offers without parameters');
    try {
      const test1 = await axios.get(
        `${EBAY_BASE_URL}/sell/inventory/v1/offer`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Language': 'en-US',
          },
        }
      );
      results.push({ test: 'No parameters', status: 'SUCCESS', data: test1.data });
    } catch (err) {
      results.push({ test: 'No parameters', status: 'FAILED', error: err.response?.data });
    }

    // Test 2: Try with just limit
    console.log('🔍 Test 2: Fetching offers with limit=10');
    try {
      const test2 = await axios.get(
        `${EBAY_BASE_URL}/sell/inventory/v1/offer`,
        {
          params: { limit: 10 },
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Language': 'en-US',
          },
        }
      );
      results.push({ test: 'With limit=10', status: 'SUCCESS', data: test2.data });
    } catch (err) {
      results.push({ test: 'With limit=10', status: 'FAILED', error: err.response?.data });
    }

    // Test 3: Try inventory items instead
    console.log('🔍 Test 3: Fetching inventory items');
    try {
      const test3 = await axios.get(
        `${EBAY_BASE_URL}/sell/inventory/v1/inventory_item`,
        {
          params: { limit: 10 },
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Language': 'en-US',
          },
        }
      );
      results.push({ test: 'Inventory items', status: 'SUCCESS', data: test3.data });
    } catch (err) {
      results.push({ test: 'Inventory items', status: 'FAILED', error: err.response?.data });
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: EBAY_ENV,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📦 eBay Environment: ${EBAY_ENV}`);
  console.log(`🔑 Client ID: ${EBAY_CLIENT_ID?.substring(0, 10)}...`);
  console.log(`\nReady to proxy eBay API requests!\n`);
});
