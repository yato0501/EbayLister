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

let memoryStore = { user: null, app: null, skus: [], skuSchedules: {}, descTemplates: [], skuFulfillmentPolicies: {}, skuShippingCosts: {}, skuRateTables: {} };
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
    user:          result.Item.userToken     ? JSON.parse(result.Item.userToken.S)      : null,
    app:           result.Item.appToken      ? JSON.parse(result.Item.appToken.S)       : null,
    skus:                    result.Item.skus                    ? JSON.parse(result.Item.skus.S)                    : [],
    skuSchedules:            result.Item.skuSchedules            ? JSON.parse(result.Item.skuSchedules.S)            : {},
    descTemplates:           result.Item.descTemplates           ? JSON.parse(result.Item.descTemplates.S)           : [],
    skuFulfillmentPolicies:  result.Item.skuFulfillmentPolicies  ? JSON.parse(result.Item.skuFulfillmentPolicies.S)  : {},
    skuShippingCosts:        result.Item.skuShippingCosts        ? JSON.parse(result.Item.skuShippingCosts.S)        : {},
    skuRateTables:           result.Item.skuRateTables           ? JSON.parse(result.Item.skuRateTables.S)           : {},
  } : { user: null, app: null, skus: [], skuSchedules: {}, descTemplates: [], skuFulfillmentPolicies: {}, skuShippingCosts: {}, skuRateTables: {} };

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
      userId:       { S: 'default' },
      userToken:    { S: JSON.stringify(tokens.user) },
      appToken:     { S: JSON.stringify(tokens.app) },
      skus:                   { S: JSON.stringify(tokens.skus || []) },
      skuSchedules:           { S: JSON.stringify(tokens.skuSchedules || {}) },
      descTemplates:          { S: JSON.stringify(tokens.descTemplates || []) },
      skuFulfillmentPolicies: { S: JSON.stringify(tokens.skuFulfillmentPolicies || {}) },
      skuShippingCosts:       { S: JSON.stringify(tokens.skuShippingCosts || {}) },
      skuRateTables:          { S: JSON.stringify(tokens.skuRateTables || {}) },
      updatedAt:    { S: new Date().toISOString() },
    },
  }));
}

// ── eBay OAuth helpers ────────────────────────────────────────────────────────

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
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

async function removeSKU(sku) {
  const stored = await loadTokens();
  const skuSchedules = { ...(stored.skuSchedules || {}) };
  delete skuSchedules[sku];
  await saveTokens({ ...stored, skus: (stored.skus || []).filter(s => s !== sku), skuSchedules });
}

async function setSkuSchedule(sku, date) {
  const stored = await loadTokens();
  const skuSchedules = { ...(stored.skuSchedules || {}), [sku]: date };
  await saveTokens({ ...stored, skuSchedules });
}

async function clearSkuSchedule(sku) {
  const stored = await loadTokens();
  const skuSchedules = { ...(stored.skuSchedules || {}) };
  delete skuSchedules[sku];
  await saveTokens({ ...stored, skuSchedules });
}

async function getOrUpdateSkuFulfillmentPolicy(token, sku, shippingCost, rateTableId) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
  const stored = await loadTokens();
  const existingId = (stored.skuFulfillmentPolicies || {})[sku];

  // Flat rate = lower 48 base cost; rate table = regional overrides (AK/HI, international) — both coexist
  const shippingService = {
    shippingCarrierCode: 'USPS',
    shippingServiceCode: 'USPSPriority',
    freeShipping: false,
    additionalShippingCost: { value: '0.00', currency: 'USD' },
    ...(shippingCost ? { shippingCost: { value: parseFloat(shippingCost).toFixed(2), currency: 'USD' } } : {}),
  };

  const shippingOption = {
    optionType: 'DOMESTIC',
    costType: 'FLAT_RATE',
    shippingServices: [shippingService],
    ...(rateTableId ? { rateTableId } : {}),
  };

  const policyBody = {
    name: `EbayLister-${sku}`,
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { value: 3, unit: 'DAY' },
    shipToLocations: { regionIncluded: [{ regionName: 'Worldwide', regionType: 'WORLDWIDE' }] },
    shippingOptions: [shippingOption],
  };

  if (existingId) {
    await axios.put(`${EBAY_BASE_URL}/sell/account/v1/fulfillment_policy/${existingId}`, policyBody, { headers });
    return existingId;
  }

  const res = await axios.post(`${EBAY_BASE_URL}/sell/account/v1/fulfillment_policy`, policyBody, { headers });
  const policyId = res.data.fulfillmentPolicyId;
  const skuFulfillmentPolicies = { ...(stored.skuFulfillmentPolicies || {}), [sku]: policyId };
  await saveTokens({ ...stored, skuFulfillmentPolicies });
  return policyId;
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
  dynamoCache = null;
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
  res.set('Cache-Control', 'no-store');
  try {
    const stored = await loadTokens();
    const skuSchedules = stored.skuSchedules || {};
    const skuShippingCosts = stored.skuShippingCosts || {};
    const skuRateTables = stored.skuRateTables || {};
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

    // Resolve unique return policy IDs to their details
    const allOffers = listings.flatMap(l => l.offers);
    const policyIds = [...new Set(allOffers.map(o => o.listingPolicies?.returnPolicyId).filter(Boolean))];
    const policyMap = {};
    await Promise.all(policyIds.map(async (id) => {
      try {
        const r = await axios.get(`${EBAY_BASE_URL}/sell/account/v1/return_policy/${id}`, { headers });
        policyMap[id] = r.data;
      } catch (e) { /* policy not found — skip */ }
    }));

    const listingsWithPolicies = listings.map(l => ({
      ...l,
      scheduledDate: skuSchedules[l.sku] || null,
      shippingCost: skuShippingCosts[l.sku] || null,
      rateTableId: skuRateTables[l.sku] || null,
      offers: l.offers.map(o => ({
        ...o,
        returnPolicy: o.listingPolicies?.returnPolicyId ? (policyMap[o.listingPolicies.returnPolicyId] || null) : null,
      })),
    }));

    res.json({ listings: listingsWithPolicies });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

// Cache policy IDs per choice to avoid redundant lookups
const returnPolicyCacheMap = {};

const RETURN_POLICY_DEFS = {
  BUYER_PAYS_30: {
    name: '30 Day Returns - Buyer Pays',
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: 'DAY' },
    returnShippingCostPayer: 'BUYER',
    refundMethod: 'MONEY_BACK',
    match: p => p.returnsAccepted && p.returnPeriod?.value === 30 && p.returnShippingCostPayer === 'BUYER',
  },
  FREE_RETURNS: {
    name: '30 Day Free Returns',
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: 'DAY' },
    returnShippingCostPayer: 'SELLER',
    refundMethod: 'MONEY_BACK',
    match: p => p.returnsAccepted && p.returnPeriod?.value === 30 && p.returnShippingCostPayer === 'SELLER',
  },
  NO_RETURNS: {
    name: 'No Returns',
    returnsAccepted: false,
    match: p => !p.returnsAccepted,
  },
};

// Build a PUT-safe offer body — eBay rejects empty strings for categoryId, listingDescription, etc.
const buildCleanOfferBody = (offerBody, overrides = {}) => {
  const body = {
    sku:            offerBody.sku,
    marketplaceId:  'EBAY_US',
    format:         offerBody.format         || 'FIXED_PRICE',
    pricingSummary: offerBody.pricingSummary  || { price: { value: '0.00', currency: 'USD' } },
    ...overrides,
  };
  // Only include optional fields when they have valid non-empty values
  if (offerBody.categoryId)           body.categoryId           = offerBody.categoryId;
  if (offerBody.listingDescription)   body.listingDescription   = offerBody.listingDescription;
  if (offerBody.quantityLimitPerBuyer) body.quantityLimitPerBuyer = offerBody.quantityLimitPerBuyer;
  if (offerBody.merchantLocationKey)  body.merchantLocationKey  = offerBody.merchantLocationKey;
  if (offerBody.tax)                  body.tax                  = offerBody.tax;
  return body;
};

let fulfillmentPolicyCacheId = null;
let merchantLocationKeyCached = null;

const getOrCreateMerchantLocation = async (token) => {
  if (merchantLocationKeyCached) return merchantLocationKeyCached;
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
  const key = 'ebaylister-us';

  try {
    // Try to GET existing location first
    await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/location/${key}`, { headers });
    merchantLocationKeyCached = key;
    return key;
  } catch (e) {
    if (e.response?.status !== 404) {
      console.log('Could not fetch merchant location:', e.response?.data || e.message);
    }
  }

  // Create it — eBay requires at least country + postalCode for US locations
  try {
    await axios.post(`${EBAY_BASE_URL}/sell/inventory/v1/location/${key}`, {
      location: { address: { country: 'US', postalCode: '10001' } },
      locationTypes: ['WAREHOUSE'],
      name: 'Default US Location',
      merchantLocationStatus: 'ENABLED',
    }, { headers });
    merchantLocationKeyCached = key;
    return key;
  } catch (e) {
    console.log('Could not create merchant location:', e.response?.data || e.message);
    return null;
  }
};

const getOrCreateFulfillmentPolicy = async (token) => {
  if (fulfillmentPolicyCacheId) return fulfillmentPolicyCacheId;

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

  const defaultPolicyBody = {
    name: 'Default Shipping',
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { value: 3, unit: 'DAY' },
    shipToLocations: { regionIncluded: [{ regionName: 'Worldwide', regionType: 'WORLDWIDE' }] },
    shippingOptions: [{
      optionType: 'DOMESTIC',
      costType: 'FLAT_RATE',
      shippingServices: [{
        shippingCarrierCode: 'USPS',
        shippingServiceCode: 'USPSPriority',
        freeShipping: false,
        shippingCost: { value: '5.00', currency: 'USD' },
        additionalShippingCost: { value: '0.00', currency: 'USD' },
      }],
    }],
  };

  try {
    const res = await axios.get(`${EBAY_BASE_URL}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, { headers });
    const existing = (res.data?.fulfillmentPolicies || [])[0];
    if (existing) {
      // Always PUT-update to ensure shipToLocations is present
      try {
        await axios.put(`${EBAY_BASE_URL}/sell/account/v1/fulfillment_policy/${existing.fulfillmentPolicyId}`, defaultPolicyBody, { headers });
      } catch (e) {
        console.log('Could not update existing fulfillment policy:', e.response?.data || e.message);
      }
      fulfillmentPolicyCacheId = existing.fulfillmentPolicyId;
      return fulfillmentPolicyCacheId;
    }
  } catch (e) {
    console.log('Could not list fulfillment policies:', e.message);
  }

  // Create a minimal flat-rate domestic shipping policy
  const created = await axios.post(`${EBAY_BASE_URL}/sell/account/v1/fulfillment_policy`, defaultPolicyBody, { headers });

  fulfillmentPolicyCacheId = created.data?.fulfillmentPolicyId;
  return fulfillmentPolicyCacheId;
};

const getOrCreateReturnPolicy = async (token, choice = 'BUYER_PAYS_30') => {
  if (returnPolicyCacheMap[choice]) return returnPolicyCacheMap[choice];

  const def = RETURN_POLICY_DEFS[choice];
  if (!def) return null;

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

  try {
    const res = await axios.get(`${EBAY_BASE_URL}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, { headers });
    const existing = (res.data?.returnPolicies || []).find(def.match);
    if (existing) {
      returnPolicyCacheMap[choice] = existing.returnPolicyId;
      return returnPolicyCacheMap[choice];
    }
  } catch (e) {
    console.log('Could not list return policies:', e.message);
  }

  const { match, ...policyBody } = def;
  const created = await axios.post(`${EBAY_BASE_URL}/sell/account/v1/return_policy`, {
    ...policyBody,
    marketplaceId: 'EBAY_US',
  }, { headers });

  returnPolicyCacheMap[choice] = created.data?.returnPolicyId;
  return returnPolicyCacheMap[choice];
};

app.post('/api/listings', async (req, res) => {
  const { title, imageUrls = [], condition = 'USED_GOOD', price = '0.00', quantity = 1 } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const sku = `DRAFT-${Date.now()}`;
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

    // Create inventory item (omit imageUrls entirely if none provided — eBay rejects empty array)
    const filteredUrls = imageUrls.filter(Boolean);
    const product = filteredUrls.length > 0 ? { title, imageUrls: filteredUrls } : { title };
    await axios.put(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      condition,
      product,
      availability: { shipToLocationAvailability: { quantity: parseInt(quantity) } },
    }, { headers });

    // Create offer (categoryId can be added later before publishing)
    await axios.post(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, {
      sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      listingDescription: title,
      pricingSummary: { price: { value: price, currency: 'USD' } },
    }, { headers });

    await addSKU(sku);
    res.json({ sku });
  } catch (err) {
    console.error('Create listing error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.put('/api/listings/:sku', async (req, res) => {
  const { sku } = req.params;
  const { title, condition, conditionDescription, description, quantity, aspects, returnPolicyChoice, scheduledDate, weight, length, width, height, shippingCost, rateTableId, categoryId } = req.body;

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

    // Update packageWeightAndSize if weight or dimensions provided
    const hasWeight = weight != null && weight !== '';
    const hasDims = length != null && length !== '' && width != null && width !== '' && height != null && height !== '';
    if (hasWeight || hasDims) {
      updated.packageWeightAndSize = {
        ...(current.packageWeightAndSize || {}),
        ...(hasWeight ? { weight: { value: parseFloat(weight), unit: 'POUND' } } : {}),
        ...(hasDims ? { dimensions: { length: parseFloat(length), width: parseFloat(width), height: parseFloat(height), unit: 'INCH' } } : {}),
      };
    }

    await axios.put(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${sku}`, updated, { headers });

    // Apply return + fulfillment policies to all offers for this SKU
    try {
      let fulfillmentPolicyId;
      const hasShipping = (shippingCost != null && shippingCost !== '') || (rateTableId != null && rateTableId !== '');
      if (hasShipping) {
        // Create/update a per-SKU policy (rate table takes precedence over flat cost)
        fulfillmentPolicyId = await getOrUpdateSkuFulfillmentPolicy(token, sku, shippingCost, rateTableId);
        const s2 = await loadTokens();
        const skuShippingCosts = { ...(s2.skuShippingCosts || {}), [sku]: shippingCost || '' };
        const skuRateTables = { ...(s2.skuRateTables || {}), [sku]: rateTableId || '' };
        await saveTokens({ ...s2, skuShippingCosts, skuRateTables });
      } else {
        // Use existing per-SKU policy if available, otherwise fall back to default
        const s = await loadTokens();
        fulfillmentPolicyId = (s.skuFulfillmentPolicies || {})[sku] || await getOrCreateFulfillmentPolicy(token);
      }
      const returnPolicyId = await getOrCreateReturnPolicy(token, returnPolicyChoice || 'BUYER_PAYS_30');
      const offersRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
      const offers = offersRes.data?.offers || [];
      const merchantLocationKey = await getOrCreateMerchantLocation(token);
      await Promise.all(offers.map(async (offer) => {
        const { offerId, status, listing, ...offerBody } = offer;
        const listingPolicies = {
          ...(offerBody.listingPolicies || {}),
          ...(returnPolicyId     ? { returnPolicyId }     : {}),
          ...(fulfillmentPolicyId ? { fulfillmentPolicyId } : {}),
        };
        const cleanBody = buildCleanOfferBody(offerBody, {
          listingPolicies,
          merchantLocationKey: merchantLocationKey || offerBody.merchantLocationKey,
          ...(categoryId ? { categoryId } : {}),
        });
        if (offer.marketplaceId === 'EBAY_MOTORS_US') {
          console.log(`Fixing EBAY_MOTORS_US offer ${offerId} — deleting and recreating as EBAY_US`);
          await axios.delete(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${offerId}`, { headers });
          await axios.post(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, cleanBody, { headers });
        } else {
          await axios.put(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${offerId}`, cleanBody, { headers });
        }
      }));
    } catch (e) {
      console.log('Policy update skipped:', e.response?.data || e.message);
    }

    // Apply categoryId to offer — kept outside the silent catch above so failures surface to the user
    if (categoryId) {
      const catOffersRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
      const catOffers = catOffersRes.data?.offers || [];
      await Promise.all(catOffers.map(async (offer) => {
        const { offerId, status, listing, ...offerBody } = offer;
        const cleanBody = buildCleanOfferBody(offerBody, { categoryId });
        await axios.put(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${offerId}`, cleanBody, { headers });
      }));
    }

    // Store or clear scheduled date
    if (scheduledDate) {
      await setSkuSchedule(sku, scheduledDate);
    } else if (scheduledDate === null || scheduledDate === '') {
      await clearSkuSchedule(sku);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save listing error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.delete('/api/listings/:sku', async (req, res) => {
  const { sku } = req.params;
  if (!sku) return res.status(400).json({ error: 'sku required' });
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

    const isNotFound = (err) => {
      const errorId = err.response?.data?.errors?.[0]?.errorId;
      return err.response?.status === 404 || errorId === 25710 || errorId === 25001;
    };

    // Delete any offers associated with this SKU first
    try {
      const offersRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
      const offers = offersRes.data?.offers || [];
      await Promise.all(offers.map(o => axios.delete(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${o.offerId}`, { headers }).catch(() => {})));
    } catch (_) { /* no offers — continue */ }

    // Delete the inventory item — treat "not found" as success (already gone from eBay)
    try {
      await axios.delete(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { headers });
    } catch (err) {
      if (!isNotFound(err)) throw err;
      console.log(`SKU ${sku} already gone from eBay — removing from local store only`);
    }

    // Clean up per-SKU fulfillment policy from eBay and local store
    try {
      const s = await loadTokens();
      const policyId = (s.skuFulfillmentPolicies || {})[sku];
      if (policyId) {
        await axios.delete(`${EBAY_BASE_URL}/sell/account/v1/fulfillment_policy/${policyId}`, { headers }).catch(() => {});
      }
      const skuShippingCosts = { ...(s.skuShippingCosts || {}) };
      const skuFulfillmentPolicies = { ...(s.skuFulfillmentPolicies || {}) };
      const skuRateTables = { ...(s.skuRateTables || {}) };
      delete skuShippingCosts[sku];
      delete skuFulfillmentPolicies[sku];
      delete skuRateTables[sku];
      await saveTokens({ ...s, skuShippingCosts, skuFulfillmentPolicies, skuRateTables });
    } catch (_) {}

    // Always remove from DynamoDB
    await removeSKU(sku);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete listing error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data || { message: err.message } });
  }
});

app.get('/api/rate-tables', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
    const r = await axios.get(`${EBAY_BASE_URL}/sell/account/v1/rate_table?marketplace_id=EBAY_US`, { headers });
    res.json({ rateTables: r.data?.rateTables || [] });
  } catch (err) {
    // Return empty list on error so UI degrades gracefully
    console.log('Rate tables fetch failed:', err.response?.data || err.message);
    res.json({ rateTables: [] });
  }
});

// ── eBay Motors category cache ────────────────────────────────────────────────
// Fetches the eBay Motors subtree (tree 0, category 6000) once per Lambda
// lifecycle and does local text search — avoids eBay's broken suggestion API.

let ebayMotorsCategoriesCache = null;

async function getEbayMotorsToken() {
  const prodAuth = 'Basic ' + Buffer.from(
    `${process.env.EBAY_PRODUCTION_CLIENT_ID}:${process.env.EBAY_PRODUCTION_CLIENT_SECRET}`
  ).toString('base64');
  const tokenRes = await axios.post(
    'https://api.ebay.com/identity/v1/oauth2/token',
    `grant_type=client_credentials&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope')}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': prodAuth } }
  );
  return tokenRes.data.access_token;
}

async function fetchEbayMotorsCategories() {
  if (ebayMotorsCategoriesCache) return ebayMotorsCategoriesCache;
  const token = await getEbayMotorsToken();
  // Tree 100 = EBAY_MOTORS_US — fetch the full subtree from the root
  const r = await axios.get(
    'https://api.ebay.com/commerce/taxonomy/v1/category_tree/100',
    { headers: { 'Authorization': `Bearer ${token}` }, timeout: 30000 }
  );
  const categories = [];
  function flatten(node, pathParts) {
    const name = node.category?.categoryName;
    const id   = node.category?.categoryId;
    if (!name || !id) return;
    const currentPath = [...pathParts, name];
    const children = node.childCategoryTreeNodes;
    if (!children || children.length === 0) {
      categories.push({ categoryId: id, categoryName: name, categoryPath: currentPath.join(' > ') });
    } else {
      children.forEach(child => flatten(child, currentPath));
    }
  }
  const root = r.data?.rootCategoryNode;
  if (root?.childCategoryTreeNodes) {
    root.childCategoryTreeNodes.forEach(child => flatten(child, []));
  }
  ebayMotorsCategoriesCache = categories;
  console.log(`eBay Motors (tree 100) category cache: ${categories.length} leaf categories`);
  return categories;
}

app.get('/api/category-suggestions', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ suggestions: [] });
  try {
    const categories = await fetchEbayMotorsCategories();
    const ql = q.toLowerCase();
    // Score: name match scores higher than path match
    const scored = categories
      .map(c => {
        const nameMatch = c.categoryName.toLowerCase().includes(ql);
        const pathMatch = c.categoryPath.toLowerCase().includes(ql);
        return { ...c, score: nameMatch ? 2 : pathMatch ? 1 : 0 };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ score, ...c }) => c);
    res.json({ suggestions: scored });
  } catch (err) {
    console.error('Category suggestions error:', err.response?.data || err.message);
    res.status(500).json({ suggestions: [], error: err.response?.data || err.message });
  }
});

app.get('/api/description-templates', async (req, res) => {
  const stored = await loadTokens();
  res.json({ templates: stored.descTemplates || [] });
});

app.post('/api/description-templates', async (req, res) => {
  const { name, text } = req.body;
  if (!name || !text) return res.status(400).json({ error: 'name and text required' });
  const stored = await loadTokens();
  const templates = [...(stored.descTemplates || []), { name, text }];
  await saveTokens({ ...stored, descTemplates: templates });
  res.json({ templates });
});

app.delete('/api/description-templates/:name', async (req, res) => {
  const stored = await loadTokens();
  const templates = (stored.descTemplates || []).filter(t => t.name !== req.params.name);
  await saveTokens({ ...stored, descTemplates: templates });
  res.json({ templates });
});

app.post('/api/publish-listing', async (req, res) => {
  const { sku, categoryId } = req.body;
  if (!sku) return res.status(400).json({ error: 'sku required' });

  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

    const offersRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
    const offers = offersRes.data?.offers || [];
    if (offers.length === 0) return res.status(404).json({ success: false, errors: [{ message: 'No offers found for this SKU' }] });

    // Ensure fulfillment + return policy + merchant location are set (all required by eBay before publish)
    const [fulfillmentPolicyId, returnPolicyId, merchantLocationKey] = await Promise.all([
      getOrCreateFulfillmentPolicy(token),
      getOrCreateReturnPolicy(token, 'BUYER_PAYS_30'),
      getOrCreateMerchantLocation(token),
    ]);
    let hadMotorsOffer = false;
    await Promise.all(offers.map(async (offer) => {
      const { offerId, status, listing, ...offerBody } = offer;
      const listingPolicies = {
        ...(offerBody.listingPolicies || {}),
        ...(fulfillmentPolicyId ? { fulfillmentPolicyId } : {}),
        ...(returnPolicyId     ? { returnPolicyId }     : {}),
      };
      const cleanBody = buildCleanOfferBody(offerBody, {
        listingPolicies,
        merchantLocationKey: merchantLocationKey || offerBody.merchantLocationKey,
        ...(categoryId ? { categoryId } : {}),
      });
      if (offer.marketplaceId === 'EBAY_MOTORS_US') {
        hadMotorsOffer = true;
        console.log(`Fixing EBAY_MOTORS_US offer ${offerId} — deleting and recreating as EBAY_US`);
        await axios.delete(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${offerId}`, { headers });
        await axios.post(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, cleanBody, { headers });
      } else {
        await axios.put(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${offerId}`, cleanBody, { headers });
      }
    }));

    // Re-fetch offers so we have the correct offerId(s) after any delete+recreate
    const publishOffers = hadMotorsOffer
      ? (await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers })).data?.offers || []
      : offers;

    const results = await Promise.allSettled(
      publishOffers.map(offer =>
        axios.post(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${offer.offerId}/publish`, {}, { headers })
          .then(r => ({ offerId: offer.offerId, listingId: r.data.listingId }))
      )
    );

    const successes = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failures  = results.filter(r => r.status === 'rejected').map(r => {
      const errs = r.reason?.response?.data?.errors;
      return errs ? errs : [{ message: r.reason?.message || 'Unknown error' }];
    }).flat();

    if (successes.length > 0) {
      res.json({ success: true, listings: successes, errors: failures });
    } else {
      res.status(400).json({ success: false, errors: failures });
    }
  } catch (err) {
    const errs = err.response?.data?.errors;
    res.status(err.response?.status || 500).json({
      success: false,
      errors: errs || [{ message: err.message }],
    });
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

// Force-repair a broken offer (e.g. stuck EBAY_MOTORS_US): delete all offers for SKU and create a fresh EBAY_US one
app.post('/api/fix-offer/:sku', async (req, res) => {
  const { sku } = req.params;
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

    // Try to delete any existing offers — ignore errors (may not be retrievable)
    try {
      const offersRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
      const offers = offersRes.data?.offers || [];
      await Promise.all(offers.map(o => axios.delete(`${EBAY_BASE_URL}/sell/inventory/v1/offer/${o.offerId}`, { headers }).catch(() => {})));
      console.log(`fix-offer: deleted ${offers.length} existing offer(s) for ${sku}`);
    } catch (e) {
      console.log(`fix-offer: GET offers failed (${e.response?.data?.errors?.[0]?.errorId}) — continuing`);
    }

    // Create a fresh EBAY_US offer
    const fulfillmentPolicyId = await getOrCreateFulfillmentPolicy(token);
    const merchantLocationKey = await getOrCreateMerchantLocation(token);
    const createRes = await axios.post(`${EBAY_BASE_URL}/sell/inventory/v1/offer`, {
      sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      pricingSummary: { price: { value: '0.01', currency: 'USD' } },
      listingPolicies: { fulfillmentPolicyId },
      merchantLocationKey,
    }, { headers });
    res.json({ success: true, offerId: createRes.data.offerId });
  } catch (err) {
    console.error('fix-offer error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

app.get('/api/offer-debug/:sku', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
    const offersRes = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/offer?sku=${encodeURIComponent(req.params.sku)}`, { headers });
    res.json(offersRes.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

app.get('/api/diagnose', async (req, res) => {
  try {
    const token = await getUserAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };
    const result = await axios.get(`${EBAY_BASE_URL}/sell/inventory/v1/inventory_item`, { headers })
      .then(r => ({ status: r.status, data: r.data }))
      .catch(e => ({ status: e.response?.status, data: e.response?.data, message: e.message }));
    res.json({ environment: EBAY_ENV, result });
  } catch (err) {
    res.json({ environment: EBAY_ENV, error: err.message });
  }
});

app.post('/auth/logout', async (req, res) => {
  const stored = await loadTokens();
  await saveTokens({ ...stored, user: null });
  dynamoCache = null;
  res.json({ success: true });
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

module.exports = app;
