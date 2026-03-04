const app = require('./app');

const PORT = process.env.PORT || 3001;
const EBAY_ENV = process.env.EBAY_ENVIRONMENT || 'sandbox';

app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📦 eBay Environment: ${EBAY_ENV}`);
  console.log(`\nReady to proxy eBay API requests!\n`);
});
