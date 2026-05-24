# Ideas

## Frontend
- Convert React Native app to plain React web app
- Add React Router for multi-page navigation
- Add a dashboard view with listing stats/summary
- Dark mode support
- Mobile-responsive CSS layout

## eBay Listing Features
- Create new listings from the UI (not just drafts)
- Edit existing listings
- Bulk publish drafts to eBay
- Image upload support for listings
- Listing templates / presets for common item types
- Search and filter drafts by title, category, price

## Auth & Security
- Session expiry warning and auto-refresh before timeout
- Multi-account support (multiple eBay accounts)
- Logout confirmation dialog

## Automation / Batch Jobs
- Daily batch job (EventBridge scheduled rule → Lambda) that finds all active listings older than 30 days and enables Best Offer on them via the eBay Inventory/Trading API

## Backend
- Add caching layer for eBay API responses (reduce API calls)
- Rate limit handling with retry logic
- Webhook support for eBay order notifications
- Logging and error tracking (e.g., CloudWatch dashboards)

## Infrastructure
- Add staging vs production environment split in Terraform
- CI/CD pipeline (GitHub Actions) for Lambda deploys
- Automated Lambda deployment on push to main