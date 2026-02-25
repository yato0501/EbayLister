import { ScrollView, Text, StyleSheet } from 'react-native';
import { EbayOffer } from '../services';
import { DraftCard } from './DraftCard';

interface DraftListProps {
  drafts: EbayOffer[];
}

export const DraftList = ({ drafts }: DraftListProps) => {
  if (drafts.length === 0) {
    return null;
  }

  return (
    <ScrollView style={styles.resultsContainer}>
      <Text style={styles.resultsHeader}>
        Found {drafts.length} listing draft{drafts.length !== 1 ? 's' : ''}:
      </Text>
      {drafts.map((draft, index) => (
        <DraftCard key={draft.offerId} draft={draft} index={index} />
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  resultsContainer: {
    marginTop: 20,
    flex: 1,
  },
  resultsHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
});
