const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Load .env.development for local dev; ignored in Lambda (env vars set by Terraform)
try { require('dotenv').config({ path: '.env.development' }); } catch (e) {}

const app = express();
app.use(cors());
app.use(express.json());
// serverless-http on API Gateway v2 can pass the body as a raw Buffer before
// express.json() gets a chance to parse it — convert it here if so.
app.use((req, res, next) => {
  if (req.body && Buffer.isBuffer(req.body)) {
    try { req.body = JSON.parse(req.body.toString('utf8')); } catch (e) { req.body = {}; }
  }
  next();
});

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

let memoryStore = { user: null, app: null, skus: [] };
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
    skus: result.Item.skus      ? JSON.parse(result.Item.skus.S)      : [],
  } : { user: null, app: null, skus: [] };

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
      skus:      { S: JSON.stringify(tokens.skus || []) },
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

async function addSKU(sku) {
  const stored = await loadTokens();
  const skus = stored.skus || [];
  if (!skus.includes(sku)) {
    await saveTokens({ ...stored, skus: [...skus, sku] });
  }
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

app.get('/api/listings', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

    // Try to get SKUs from eBay's list endpoint; fall back to stored SKUs on sandbox 25001 bug
    let skus = [];
    try {
      const inventoryRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item`, { headers });
      skus = (inventoryRes.data.inventoryItems || []).map(item => item.sku);
    } catch (err) {
      console.log('Inventory list endpoint failed (error', err.response?.data?.errors?.[0]?.errorId, '), falling back to stored SKUs');
      const stored = await loadTokens();
      skus = stored.skus || [];
    }

    if (skus.length === 0) return res.json({ listings: [] });

    const listings = await Promise.all(skus.map(async (sku) => {
      const [itemRes, offersRes] = await Promise.allSettled([
        axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${sku}`, { headers }),
        axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, { headers, params: { sku } }),
      ]);
      return {
        sku,
        item:   itemRes.status   === 'fulfilled' ? itemRes.value.data                    : null,
        offers: offersRes.status === 'fulfilled' ? (offersRes.value.data.offers || [])   : [],
      };
    }));

    res.json({ listings });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.put('/api/listings/:sku', async (req, res) => {
  const { sku } = req.params;
  const { title, condition, conditionDescription, description, quantity, aspects } = req.body;

  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

    // Fetch current item so we preserve fields we're not updating
    const itemRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${sku}`, { headers });
    const current = itemRes.data;

    const updated = {
      ...current,
      condition: condition ?? current.condition,
      conditionDescription: conditionDescription ?? current.conditionDescription,
      product: {
        ...current.product,
        title:       title       ?? current.product?.title,
        description: description ?? current.product?.description,
        aspects:     aspects     ?? current.product?.aspects,
      },
      availability: {
        ...current.availability,
        shipToLocationAvailability: {
          ...current.availability?.shipToLocationAvailability,
          quantity: quantity != null ? parseInt(quantity) : current.availability?.shipToLocationAvailability?.quantity,
        },
      },
    };

    await axios.put(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${sku}`, updated, { headers });
    res.json({ success: true });
  } catch (err) {
    console.error('Save listing error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.post('/api/enhance-listing', async (req, res) => {
  const { sku } = req.body;
  if (!sku) return res.status(400).json({ error: 'sku required' });

  try {
    // Fetch the inventory item to get title and description
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
    const itemRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${sku}`, { headers });
    const item = itemRes.data;

    const title       = item.product?.title       || sku;
    const description = item.product?.description || '';

    const { default: Anthropic } = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      system:     'You are an expert eBay seller specializing in automotive parts. Always respond with valid JSON only — no markdown, no explanation.',
      messages:   [{
        role: 'user',
        content: `Part title: ${title}\nDescription: ${description}\n\nBased on the title above, return ONLY a JSON object with these exact fields:\n{\n  "title": "optimized eBay title, max 80 chars. Format: [YY-YY Make Model(s) Part Description]. Example: 96-02 Toyota 4Runner ABS pump module Genuine OEM",\n  "brand": "manufacturer brand name, e.g. Toyota, Bosch, Dorman, Denso — or empty string if unknown",\n  "manufacturerPartNumber": "the primary OEM or aftermarket part number if identifiable from the title — or empty string if not",\n  "interchangeablePartNumbers": ["other OEM or aftermarket part numbers known to interchange with this part — empty array if none"],\n  "supersedePartNumbers": ["newer part numbers that supersede this one, or older numbers this supersedes — empty array if none"],\n  "condition": "Used / New / Remanufactured / For Parts — choose the most accurate based on the title",\n  "placement": "location on vehicle, e.g. Front, Rear, Driver Side, Passenger Side, Front Left, Rear Right — or empty string if not applicable",\n  "years": ["split years across bullets so each string is max 65 chars. First bullet: 2-digit years (e.g. '96 97 98 99 00 01 02'). Second bullet: 4-digit years (e.g. '1996 1997 1998 1999 2000 2001 2002'). If a single bullet exceeds 65 chars, split into multiple entries."],\n  "makeModels": ["one Make Model entry per line, max 65 chars each. List every compatible make and model. Example: ['Toyota 4Runner', 'Toyota Tacoma']"],\n  "keywords": ["Pack multiple unique search terms onto each line separated by spaces. Keep adding terms to the same entry until the next term would push it over 65 chars, then start a new entry. Do NOT put each term on its own line — fill each entry as full as possible. Terms must not already appear in title or make/model."]\n}`,
      }],
    });

    const raw = message.content[0].text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const result = JSON.parse(raw);
    res.json(result);
  } catch (err) {
    console.error('Enhance listing error:', err.message);
    res.status(500).json({ error: err.message });
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
    const title = req.query.title || 'Test Product - Do Not Buy';

    await axios.put(
      `${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${testSKU}`,
      {
        product: { title, description: 'Draft created via eBay Lister.', aspects: { Brand: ['Unknown'] }, imageUrls: ['https://via.placeholder.com/500'] },
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

    await addSKU(testSKU);
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
