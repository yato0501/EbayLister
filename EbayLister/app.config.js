require('dotenv').config({ path: '.env.development' });

// Debug: Log loaded environment variables
console.log('=== Loading Environment Variables ===');
console.log('EBAY_ENVIRONMENT:', process.env.EBAY_ENVIRONMENT);
console.log('EBAY_SANDBOX_CLIENT_ID:', process.env.EBAY_SANDBOX_CLIENT_ID ? '✓ Loaded' : '✗ Not found');
console.log('EBAY_SANDBOX_CLIENT_SECRET:', process.env.EBAY_SANDBOX_CLIENT_SECRET ? '✓ Loaded' : '✗ Not found');
console.log('EBAY_PRODUCTION_CLIENT_ID:', process.env.EBAY_PRODUCTION_CLIENT_ID ? '✓ Loaded' : '✗ Not found');
console.log('EBAY_PRODUCTION_CLIENT_SECRET:', process.env.EBAY_PRODUCTION_CLIENT_SECRET ? '✓ Loaded' : '✗ Not found');
console.log('====================================');

module.exports = {
  expo: {
    name: 'EbayLister',
    slug: 'EbayLister',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      EBAY_SANDBOX_CLIENT_ID: process.env.EBAY_SANDBOX_CLIENT_ID,
      EBAY_SANDBOX_CLIENT_SECRET: process.env.EBAY_SANDBOX_CLIENT_SECRET,
      EBAY_PRODUCTION_CLIENT_ID: process.env.EBAY_PRODUCTION_CLIENT_ID,
      EBAY_PRODUCTION_CLIENT_SECRET: process.env.EBAY_PRODUCTION_CLIENT_SECRET,
      EBAY_ENVIRONMENT: process.env.EBAY_ENVIRONMENT,
    },
  },
};
