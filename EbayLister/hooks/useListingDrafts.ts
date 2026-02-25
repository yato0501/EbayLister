import { useState } from 'react';
import { EbayService, ebayConfig, validateConfig, EbayOffer } from '../services';

export const useListingDrafts = () => {
  const [drafts, setDrafts] = useState<EbayOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchListingDrafts = async () => {
    // Validate configuration
    if (!validateConfig(ebayConfig)) {
      setError('Please configure your eBay API credentials in services/ebayConfig.ts');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ebayService = new EbayService(ebayConfig);
      const listingDrafts = await ebayService.getListingDrafts();
      setDrafts(listingDrafts);

      if (listingDrafts.length === 0) {
        setError('No listing drafts found. Create some drafts in your eBay Sandbox account.');
      }
    } catch (err) {
      setError(`Error fetching drafts: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Error:', err);
      console.error('ebayConfig at time of error:', ebayConfig);
      console.error('ebayConfig type:', typeof ebayConfig);
      console.error('ebayConfig keys:', ebayConfig ? Object.keys(ebayConfig) : 'null/undefined');
    } finally {
      setLoading(false);
    }
  };

  return {
    drafts,
    loading,
    error,
    fetchListingDrafts,
  };
};
