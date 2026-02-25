# eBay Lister OAuth Setup Progress

## ⚠️ IMPORTANT REMINDER - DO THIS FIRST!

**Before testing OAuth, you MUST update the ngrok URL in your eBay Developer Portal:**

1. Start ngrok: `ngrok http 3001`
2. Get the HTTPS URL (e.g., `https://your-unique-url.ngrok-free.dev`)
3. **Go to:** https://developer.ebay.com/my/keys
4. **Select SANDBOX app** (TouYang-TestingA-SBX)
5. **Update RuName "Your auth accepted URL" to:**
   ```
   https://your-unique-url.ngrok-free.dev/auth/ebay/callback
   ```
6. Make sure **"OAuth"** is selected (NOT Auth'n'Auth)
7. **Save** the configuration

---

## Current Setup Status

### ✅ Completed:
- [x] OAuth Authorization Code flow implemented
- [x] Token storage service (AsyncStorage)
- [x] Auth service for token management
- [x] Login component with eBay OAuth
- [x] Backend server with OAuth endpoints
- [x] App.tsx updated with authentication check
- [x] Environment switched to Sandbox
- [x] ngrok configured for HTTPS tunneling

### 📋 Quick Start Commands:

```bash
# Terminal 1 - Start ngrok (get the HTTPS URL)
ngrok http 3001

# Terminal 2 - Start backend server
cd EbayLister
npm run server

# Terminal 3 - Start Expo web app
cd EbayLister
npm run web
```

### 🔑 Configuration Files:

**Backend Server:**
- File: `server/index.js`
- Update `REDIRECT_URI` with your ngrok URL (line 41)
- Currently hardcoded: `https://concentratedly-nonsententious-donald.ngrok-free.dev/auth/ebay/callback`

**Environment:**
- File: `.env.development`
- Environment: `EBAY_ENVIRONMENT=sandbox`
- Sandbox Client ID: `TouYang-TestingA-SBX-b4d901dbc-f32b4cae`

---

## OAuth Flow Architecture

### How it Works:

1. **User opens app** → http://localhost:8081
2. **App checks auth** → AuthService.initialize()
3. **If not authenticated** → Show Login screen
4. **User clicks "Login with eBay"** → Opens http://localhost:3001/auth/ebay
5. **Backend redirects** → eBay Sandbox login via ngrok HTTPS URL
6. **User logs in** → Uses Sandbox Test User credentials (NOT real eBay account)
7. **eBay redirects back** → https://your-ngrok-url.ngrok-free.dev/auth/ebay/callback
8. **Backend exchanges code** → Gets access token + refresh token
9. **Tokens sent to client** → Via URL fragment/postMessage
10. **Client stores tokens** → AsyncStorage + syncs with backend
11. **App shows main UI** → User is authenticated

### Key Files:

- `services/tokenStorage.ts` - Manages OAuth tokens in AsyncStorage
- `services/authService.ts` - Handles auth initialization and token refresh
- `components/Login.tsx` - Login UI and OAuth flow
- `server/index.js` - Backend OAuth endpoints
- `App.tsx` - Main app with auth check

---

## eBay Sandbox Test User

**⚠️ You MUST use Sandbox Test User credentials to login to Sandbox**

### Create Test User:
1. Go to: https://developer.ebay.com/sandbox/manage
2. Click "Create a new user"
3. Set user type: **"Seller"**
4. Create username/password
5. Use these credentials when logging into Sandbox (NOT your real eBay account)

### Existing Test Users:
Check: https://developer.ebay.com/sandbox/manage

---

## Troubleshooting

### "invalid_request" Error from eBay:

**Cause:** Redirect URI mismatch

**Solution:**
1. Verify ngrok URL matches exactly in eBay Developer Portal
2. Make sure using **Sandbox** app (not Production)
3. Check RuName is **enabled** (green checkmark)
4. Verify **OAuth** is selected (not Auth'n'Auth)

### Backend not picking up environment changes:

**Solution:**
1. Kill all node processes on port 3001:
   ```bash
   netstat -ano | findstr :3001
   powershell.exe -Command "Stop-Process -Id <PID> -Force"
   ```
2. Restart backend server:
   ```bash
   cd EbayLister && npm run server
   ```

### ngrok URL changes every restart:

**Solution:**
- Free ngrok URLs change on each restart
- You MUST update eBay RuName with new URL each time
- Consider ngrok paid plan for static URLs
- OR set up local HTTPS for permanent solution

### Login credentials don't work:

**Check:**
- Are you using **Sandbox Test User** credentials? (NOT real eBay account)
- Create test user at: https://developer.ebay.com/sandbox/manage

---

## Production Deployment (Future)

When moving to production:

1. **Update environment:**
   - Change `.env.development`: `EBAY_ENVIRONMENT=production`
   - Use production client credentials

2. **Use real domain:**
   - Replace ngrok with your production domain (HTTPS required)
   - Update eBay Production app with your domain's callback URL

3. **Update redirect URI:**
   - Use your production domain: `https://yourdomain.com/auth/ebay/callback`

4. **Users login with real eBay accounts:**
   - No test users needed in production

---

## Next Session Checklist

Before testing OAuth next time:

- [ ] Start ngrok: `ngrok http 3001`
- [ ] Copy the ngrok HTTPS URL
- [ ] Update eBay Sandbox RuName with new ngrok URL
- [ ] Update `server/index.js` line 41 with new ngrok URL
- [ ] Start backend server: `npm run server`
- [ ] Start Expo web: `npm run web`
- [ ] Create/use Sandbox Test User for login
- [ ] Test OAuth flow

---

## Resources

- **eBay Developer Portal:** https://developer.ebay.com/
- **Sandbox Test Users:** https://developer.ebay.com/sandbox/manage
- **OAuth Setup Guide:** `OAUTH_SETUP.md`
- **ngrok Dashboard:** https://dashboard.ngrok.com/

---

**Last Updated:** 2026-01-04
**Current ngrok URL:** `https://concentratedly-nonsententious-donald.ngrok-free.dev`
**Status:** Ready to test with Sandbox Test User credentials
