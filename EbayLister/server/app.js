const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Load .env.development for local dev; ignored in Lambda (env vars set by Terraform)
try { require('dotenv').config({ path: '.env.development' }); } catch (e) {}

const app = express();
app.use(cors());
app.use(express.json());

const EBAY_ENV = process.env.EBAY_ENVIRONMENT || 'sandbox';
const EBAY_BASE_URL = EBAY_ENV === 'sandbox'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

const EBAY_CLIENT_ID = EBAY_ENV === 'sandbox'
  ? process.env.EBAY_SANDBOX_CLIENT_ID
  : process.env.EBAY_PRODUCTION_CLIENT_ID;

const EBAY_CLIENT_SECRET = EBAY_ENV === 'sandbox'
  ? process.env.EBAY_SANDBOX_CLIENT_SECRET
  : process.env.EBAY_PRODUCTION_CLIENT_SECRET;

const REDIRECT_URI = process.env.REDIRECT_URI
  || 'https://api.ebay.who-is-tou.com/auth/ebay/callback';

// Where the Expo web app lives — used to redirect after OAuth
const APP_URL = process.env.APP_URL || 'http://localhost:8081';

// ── Token storage ─────────────────────────────────────────────────────────────
// Uses DynamoDB in Lambda (DYNAMODB_TABLE_NAME is set), in-memory locally.

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE_NAME;

let memoryStore = { user: null, app: null };
let dynamoCache = null;

async function loadTokens() {
  if (!DYNAMODB_TABLE) return memoryStore;
  if (dynamoCache) return dynamoCache;

  const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
  const client = new DynamoDBClient({});
  const result = await client.send(new GetItemCommand({
    TableName: DYNAMODB_TABLE,
    Key: { userId: { S: 'default' } },
  }));

  dynamoCache = result.Item ? {
    user: result.Item.userToken ? JSON.parse(result.Item.userToken.S) : null,
    app:  result.Item.appToken  ? JSON.parse(result.Item.appToken.S)  : null,
  } : { user: null, app: null };

  return dynamoCache;
}

async function saveTokens(tokens) {
  if (!DYNAMODB_TABLE) { memoryStore = tokens; return; }

  dynamoCache = tokens;

  const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
  const client = new DynamoDBClient({});
  await client.send(new PutItemCommand({
    TableName: DYNAMODB_TABLE,
    Item: {
      userId:    { S: 'default' },
      userToken: { S: JSON.stringify(tokens.user) },
      appToken:  { S: JSON.stringify(tokens.app) },
      updatedAt: { S: new Date().toISOString() },
    },
  }));
}

// ── eBay OAuth helpers ────────────────────────────────────────────────────────

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
].join(' ');

const OAUTH_URL = EBAY_ENV === 'sandbox'
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token';

function ebayAuthHeader() {
  return 'Basic ' + Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
}

async function getAccessToken() {
  const stored = await loadTokens();
  const cached = stored.app;
  if (cached && Date.now() < (cached.expiresAt - 60000)) return cached.accessToken;

  const response = await axios.post(
    OAUTH_URL,
    `grant_type=client_credentials&scope=${encodeURIComponent(SCOPES)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': ebayAuthHeader() } }
  );

  const appToken = {
    accessToken: response.data.access_token,
    expiresAt:   Date.now() + (response.data.expires_in * 1000),
  };
  await saveTokens({ ...stored, app: appToken });
  console.log('✓ App OAuth token obtained');
  return appToken.accessToken;
}

async function getUserAccessToken() {
  const stored = await loadTokens();
  const cached = stored.user;
  if (cached && cached.accessToken && Date.now() < (cached.expiresAt - 60000)) {
    return cached.accessToken;
  }
  if (cached && cached.refreshToken) {
    return refreshUserToken(stored);
  }
  throw new Error('User authorization required. Please visit /auth/ebay to authorize.');
}

async function refreshUserToken(stored) {
  const refreshToken = stored.user?.refreshToken;
  if (!refreshToken) throw new Error('No refresh token available');

  const response = await axios.post(
    OAUTH_URL,
    `grant_type=refresh_token&refresh_token=${refreshToken}&scope=${encodeURIComponent(SCOPES)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': ebayAuthHeader() } }
  );

  const userToken = {
    accessToken:  response.data.access_token,
    refreshToken: refreshToken,
    expiresAt:    Date.now() + (response.data.expires_in * 1000),
  };
  await saveTokens({ ...stored, user: userToken });
  console.log('✓ User token refreshed');
  return userToken.accessToken;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: EBAY_ENV, timestamp: new Date().toISOString() });
});

app.get('/auth/ebay', (req, res) => {
  const authUrl = EBAY_ENV === 'sandbox'
    ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
    : 'https://auth.ebay.com/oauth2/authorize';

  const params = new URLSearchParams({
    client_id: EBAY_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
  });

  console.log('🔐 Redirecting to eBay authorization...');
  res.redirect(`${authUrl}?${params.toString()}`);
});

app.get('/auth/ebay/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.send(`<html><body style="font-family:Arial;padding:40px;text-align:center">
      <h1 style="color:#d32f2f">❌ Authorization Failed</h1>
      <p>${error || 'No authorization code received'}</p>
      <a href="/auth/ebay">Try again</a></body></html>`);
  }

  try {
    const response = await axios.post(
      OAUTH_URL,
      `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': ebayAuthHeader() } }
    );

    const userToken = {
      accessToken:  response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt:    Date.now() + (response.data.expires_in * 1000),
    };

    const stored = await loadTokens();
    await saveTokens({ ...stored, user: userToken });
    console.log('✅ User authorization successful');

    const tokenData = {
      accessToken:  userToken.accessToken,
      refreshToken: userToken.refreshToken,
      expiresAt:    userToken.expiresAt,
    };

    res.send(`<html><body style="font-family:Arial;padding:40px;text-align:center">
      <h1 style="color:#4caf50">✅ Authorization Successful!</h1>
      <p>Your eBay account has been connected. Redirecting back to app...</p>
      <script>
        const tokens = ${JSON.stringify(tokenData)};
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AUTH_SUCCESS', tokens }));
        }
        setTimeout(() => {
          window.location.href = '${APP_URL}/#auth-success?' + encodeURIComponent(JSON.stringify(tokens));
        }, 1000);
      </script></body></html>`);
  } catch (err) {
    console.error('❌ Token exchange error:', err.response?.data || err.message);
    res.send(`<html><body style="font-family:Arial;padding:40px;text-align:center">
      <h1 style="color:#d32f2f">❌ Token Exchange Failed</h1>
      <p>${err.message}</p>
      <a href="/auth/ebay">Try again</a></body></html>`);
  }
});

app.get('/auth/status', async (req, res) => {
  const stored = await loadTokens();
  const user = stored.user;
  res.json({
    authorized:      !!(user && user.accessToken && Date.now() < user.expiresAt),
    tokenExpiry:     user ? new Date(user.expiresAt).toISOString() : null,
    hasRefreshToken: !!(user && user.refreshToken),
  });
});

app.post('/auth/tokens', async (req, res) => {
  const { accessToken, refreshToken, expiresAt } = req.body;
  if (!accessToken || !refreshToken || !expiresAt) {
    return res.status(400).json({ error: 'Missing required token data' });
  }
  const stored = await loadTokens();
  await saveTokens({ ...stored, user: { accessToken, refreshToken, expiresAt } });
  console.log('✓ Tokens updated from client');
  res.json({ success: true });
});

app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const stored = await loadTokens();
    const storeWithRefresh = { ...stored, user: { ...(stored.user || {}), refreshToken } };
    const accessToken = await refreshUserToken(storeWithRefresh);
    const updated = await loadTokens();
    res.json({
      accessToken,
      refreshToken: updated.user.refreshToken,
      expiresAt:    updated.user.expiresAt,
    });
  } catch (err) {
    console.error('Error refreshing token:', err.message);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

app.use('/api/ebay', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const response = await axios({
      method:  req.method,
      url:     `${EBAY_BASE_URL}${req.url}`,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' },
      params:  req.query,
      data:    req.body,
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.get('/test/create-sample-listing', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const testSKU = 'TEST' + Date.now();

    await axios.put(
      `${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${testSKU}`,
      {
        product: { title: 'Test Product - Do Not Buy', description: 'Test product for eBay Lister.', aspects: { Brand: ['Test Brand'] }, imageUrls: ['https://via.placeholder.com/500'] },
        condition: 'NEW',
        availability: { shipToLocationAvailability: { quantity: 1 } },
      },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' } }
    );

    const offerResponse = await axios.post(
      `${EBAY_BASE_URL}/sell/inventory/v1/offer`,
      {
        sku: testSKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE',
        listingDescription: 'Test listing. Do not purchase.', availableQuantity: 1, categoryId: '11450',
        listingPolicies: { paymentPolicyId: '5914107016', returnPolicyId: '5914105016', fulfillmentPolicyId: '5914106016' },
        pricingSummary: { price: { value: '9.99', currency: 'USD' } },
      },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' } }
    );

    res.json({ success: true, sku: testSKU, offerId: offerResponse.data.offerId });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.get('/test/diagnose-offers', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
    const results = await Promise.allSettled([
      axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, { headers }),
      axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, { headers, params: { limit: 10 } }),
      axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item`, { headers, params: { limit: 10 } }),
    ]);
    res.json({
      success: true,
      results: results.map((r, i) => ({
        test: ['No params', 'limit=10', 'inventory_items'][i],
        status: r.status === 'fulfilled' ? 'SUCCESS' : 'FAILED',
        data: r.status === 'fulfilled' ? r.value.data : r.reason?.response?.data,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
