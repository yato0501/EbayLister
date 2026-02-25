import { EbayConfig } from './ebay.types';
import Constants from 'expo-constants';

/**
 * eBay API Configuration
 *
 * To use this service, you need to:
 * 1. Go to https://developer.ebay.com/
 * 2. Sign in and create an application
 * 3. Get your App ID (Client ID) and Cert ID (Client Secret)
 * 4. Add your credentials to .env.development file
 *
 * Credentials are loaded from environment variables (.env.development)
 * This file is gitignored and will NOT be committed to version control
 */

// Safe getter for environment variables
function getEnvConfig() {
  try {
    const isWeb = typeof window !== 'undefined';
    const expoExtra = Constants.expoConfig?.extra || {};

    // For web, use EXPO_PUBLIC_ prefixed environment variables
    // These are automatically injected by Expo web
    if (isWeb) {
      const webConfig = {
        EBAY_SANDBOX_CLIENT_ID: process.env.EXPO_PUBLIC_EBAY_SANDBOX_CLIENT_ID,
        EBAY_SANDBOX_CLIENT_SECRET: process.env.EXPO_PUBLIC_EBAY_SANDBOX_CLIENT_SECRET,
        EBAY_PRODUCTION_CLIENT_ID: process.env.EXPO_PUBLIC_EBAY_PRODUCTION_CLIENT_ID,
        EBAY_PRODUCTION_CLIENT_SECRET: process.env.EXPO_PUBLIC_EBAY_PRODUCTION_CLIENT_SECRET,
        EBAY_ENVIRONMENT: process.env.EXPO_PUBLIC_EBAY_ENVIRONMENT,
      };

      // Debug logging
      console.log('=== eBay Config Debug ===');
      console.log('Platform: Web');
      console.log('Web Config:', webConfig);
      console.log('Web Config keys:', Object.keys(webConfig));
      console.log('========================');

      return webConfig;
    }

    // For native, use expoConfig.extra
    console.log('=== eBay Config Debug ===');
    console.log('Platform: Native');
    console.log('Constants available:', !!Constants);
    console.log('expoConfig available:', !!Constants.expoConfig);
    console.log('Expo Extra:', expoExtra);
    console.log('Extra keys:', Object.keys(expoExtra));
    console.log('========================');

    return expoExtra;
  } catch (error) {
    console.error('Error loading expo constants:', error);
    return {};
  }
}

const expoExtra = getEnvConfig();

// Get the environment setting (sandbox or production)
const environment = (expoExtra.EBAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

// Select credentials based on environment
const clientId = environment === 'sandbox'
  ? expoExtra.EBAY_SANDBOX_CLIENT_ID
  : expoExtra.EBAY_PRODUCTION_CLIENT_ID;

const clientSecret = environment === 'sandbox'
  ? expoExtra.EBAY_SANDBOX_CLIENT_SECRET
  : expoExtra.EBAY_PRODUCTION_CLIENT_SECRET;

console.log('Using environment:', environment);
console.log('Client ID loaded:', clientId ? '✓ Yes' : '✗ No');
console.log('Client Secret loaded:', clientSecret ? '✓ Yes' : '✗ No');

export const ebayConfig: EbayConfig = {
  clientId: clientId || 'TBD',
  clientSecret: clientSecret || 'TBD',
  environment,
};

/**
 * Validate that credentials are configured
 */
export function validateConfig(config: EbayConfig): boolean {
  if (config.clientId === 'TBD' || !config.clientId || config.clientId.trim() === '') {
    console.error('eBay Client ID not configured in .env.development');
    return false;
  }
  if (config.clientSecret === 'TBD' || !config.clientSecret || config.clientSecret.trim() === '') {
    console.error('eBay Client Secret not configured in .env.development');
    return false;
  }
  return true;
}
