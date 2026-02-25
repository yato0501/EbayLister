# OAuth Setup Guide

This guide explains how to set up OAuth authentication for the eBay Lister app.

## Overview

The app uses **OAuth 2.0 Authorization Code Flow** to access your eBay seller account data. This requires:
1. eBay API credentials (Client ID and Secret)
2. Configuring a redirect URI in eBay Developer Portal
3. User login and consent

## Step 1: Configure Redirect URI in eBay Developer Portal

**IMPORTANT**: You must add the redirect URI to your eBay app configuration before OAuth will work.

1. Go to [eBay Developer Portal](https://developer.ebay.com/)
2. Sign in with your eBay account
3. Navigate to **"My Account"** → **"Application Keys"**
4. Select your application (or create a new one)
5. Scroll to **"Application access"** section
6. Click **"Edit"** next to Auth
7. Under **"OAuth redirect URIs"**, add:
   ```
   http://localhost:3001/auth/ebay/callback
   ```
8. Click **"Continue"** then **"Save"**

**For Sandbox Environment:**
- Use the same redirect URI for sandbox testing
- Make sure your sandbox credentials are configured

**For Production Environment:**
- You'll need to add the same redirect URI to your production app
- eBay may require additional verification for production access

## Step 2: Verify Your Credentials

Make sure your `.env.development` file has the correct credentials:

```env
# For Sandbox testing (recommended)
EBAY_SANDBOX_CLIENT_ID=your_sandbox_client_id
EBAY_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
EBAY_ENVIRONMENT=sandbox

# For Production
EBAY_PRODUCTION_CLIENT_ID=your_production_client_id
EBAY_PRODUCTION_CLIENT_SECRET=your_production_client_secret
EBAY_ENVIRONMENT=production
```

## Step 3: OAuth Flow

### How it Works

1. **User clicks "Login with eBay"** in the app
2. **Browser opens** → Redirects to eBay login page
3. **User logs in** → eBay account credentials
4. **User grants permission** → Allows app to access their inventory
5. **eBay redirects back** → To `http://localhost:3001/auth/ebay/callback` with authorization code
6. **Backend exchanges code** → Gets access token and refresh token
7. **Tokens sent to app** → Stored securely in AsyncStorage
8. **App can now access** → User's eBay inventory data

### Token Management

- **Access Token**: Valid for ~2 hours, used for API calls
- **Refresh Token**: Valid for ~18 months, used to get new access tokens
- Tokens are stored in AsyncStorage and synced with the backend server
- Tokens are automatically refreshed when they expire

## Step 4: Required Scopes

The app requests these eBay API scopes:

- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly` - Read inventory items
- `https://api.ebay.com/oauth/api_scope/sell.inventory` - Manage inventory items and offers

## Step 5: Testing the Flow

### Start the Backend Server

```bash
cd EbayLister
npm run server
```

You should see:
```
🚀 Backend server running on http://localhost:3001
📦 eBay Environment: sandbox (or production)
```

### Start the Expo App

In another terminal:

```bash
cd EbayLister
npm run web
```

The app will open at `http://localhost:8081`

### Login Process

1. You'll see the **Login screen** on first launch
2. Click **"Login with eBay"**
3. A new browser tab opens with eBay login
4. Log in with your eBay account (use sandbox test user for testing)
5. Click **"Agree"** to grant permissions
6. You'll be redirected to a success page
7. Click **"Return to app"** or the page will auto-redirect
8. The app will now show the main interface

### Verify Authentication

Check the backend server logs - you should see:
```
✅ User authorization successful!
   Access token expires in: 7200 seconds
   Refresh token expires in: 47304000 seconds
✓ Tokens synced with backend
```

## Troubleshooting

### "Redirect URI mismatch" error

- Make sure you added `http://localhost:3001/auth/ebay/callback` exactly as shown in eBay Developer Portal
- Check that you're using the correct environment (sandbox vs production)
- Verify the redirect URI doesn't have trailing slashes

### "Invalid client credentials" error

- Verify your Client ID and Secret in `.env.development`
- Make sure you're using sandbox credentials if `EBAY_ENVIRONMENT=sandbox`
- Make sure you're using production credentials if `EBAY_ENVIRONMENT=production`

### Tokens not persisting after app restart

- Make sure AsyncStorage is installed: `npm install @react-native-async-storage/async-storage`
- Check browser console for errors
- Verify the backend server is running

### "User authorization required" error

- This means you need to log in again
- Refresh tokens may have expired (18 months validity)
- Click "Login with eBay" to re-authenticate

## Security Notes

- Never commit `.env.development` to version control (it's gitignored)
- Access tokens are stored in AsyncStorage (secure on mobile, localStorage on web)
- The backend server stores tokens in memory (lost on restart)
- For production, consider using a database to persist tokens server-side

## Testing with Sandbox

eBay provides a sandbox environment for testing:

1. Set `EBAY_ENVIRONMENT=sandbox` in `.env.development`
2. Use sandbox credentials
3. Login with a sandbox test user (create one in eBay Developer Portal)
4. Create test listings in the sandbox seller hub
5. Verify the app can fetch your test listings

## Moving to Production

When ready for production:

1. Update `.env.development`:
   ```env
   EBAY_ENVIRONMENT=production
   ```
2. Ensure production credentials are configured
3. Add the same redirect URI to your production app in eBay Developer Portal
4. Test thoroughly with your real eBay seller account
5. Consider implementing a production-grade token storage solution

## Resources

- [eBay OAuth Guide](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- [eBay Developer Portal](https://developer.ebay.com/)
- [eBay Inventory API](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
