import { View, Text, StyleSheet } from 'react-native';
import { EbayOffer } from '../services';

interface DraftCardProps {
  draft: EbayOffer;
  index: number;
}

export const DraftCard = ({ draft, index }: DraftCardProps) => {
  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftTitle}>Draft #{index + 1}</Text>
      <Text style={styles.draftDetail}>Offer ID: {draft.offerId}</Text>
      <Text style={styles.draftDetail}>SKU: {draft.sku}</Text>
      <Text style={styles.draftDetail}>Status: {draft.status}</Text>
      <Text style={styles.draftDetail}>Format: {draft.format}</Text>
      {draft.pricingSummary?.price && (
        <Text style={styles.draftDetail}>
          Price: {draft.pricingSummary.price.currency} {draft.pricingSummary.price.value}
        </Text>
      )}
      {draft.categoryId && (
        <Text style={styles.draftDetail}>Category ID: {draft.categoryId}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  draftCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1976d2',
  },
  draftDetail: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
});
