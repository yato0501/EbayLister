# eBay Lister

## Architecture

- **Frontend:** React Native / Expo (web target)
- **Backend:** AWS Lambda + API Gateway v2, custom domain `api.ebay.who-is-tou.com`
- **Token storage:** DynamoDB (`ebay-lister-tokens-staging`)
- **Infrastructure:** Terraform at `aws-infrastructure/terraform/`

## Quick Start

```bash
# Start Expo web app (frontend only)
cd EbayLister
npm run web
```

The backend is deployed to AWS — no local server needed.

## Backend

**URL:** `https://api.ebay.who-is-tou.com`

**Deploy code changes:**
```bash
cd EbayLister
npm run deploy:lambda
```

**Key endpoints:**
- `GET  /health` — health check
- `GET  /auth/ebay` — start OAuth flow
- `GET  /auth/ebay/callback` — OAuth callback
- `GET  /auth/status` — check auth state
- `POST /auth/tokens` — store tokens
- `POST /auth/refresh` — refresh access token
- `GET  /api/ebay/*` — proxy to eBay API

## eBay OAuth

**Redirect URI (set in eBay Developer Portal):**
```
https://api.ebay.who-is-tou.com/auth/ebay/callback
```

**Sandbox app:** TouYang-TestingA-SBX

Login with a **Sandbox Test User** (not your real eBay account).
Create test users at: https://developer.ebay.com/sandbox/manage

## Troubleshooting

**"invalid_request" from eBay:** Redirect URI mismatch — verify the RuName in the Developer Portal matches exactly.

**Login credentials don't work:** Use Sandbox Test User credentials, not your real eBay account.

## Key Files

- `EbayLister/server/app.js` — Express app (runs in Lambda)
- `EbayLister/server/lambda.js` — Lambda handler wrapper
- `EbayLister/services/authService.ts` — token management
- `EbayLister/services/tokenStorage.ts` — AsyncStorage wrapper
- `EbayLister/components/Login.tsx` — login UI
- `aws-infrastructure/terraform/` — all infrastructure
- `aws-infrastructure/deploy-lambda.ps1` — deployment script
