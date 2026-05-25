import { ScrollView, Text, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { EbayOffer } from '../services';
import { DraftCard } from './DraftCard';
import { DescTemplate, RateTable } from '../App';

interface DraftListProps {
  drafts: EbayOffer[];
  descTemplates?: DescTemplate[];
  onTemplateAdded?: (t: DescTemplate) => void;
  onTemplateDeleted?: (name: string) => void;
  rateTables?: RateTable[];
}

export const DraftList = ({ drafts, descTemplates = [], onTemplateAdded, onTemplateDeleted, rateTables = [] }: DraftListProps) => {
  const [items, setItems] = useState<EbayOffer[]>(drafts);

  useEffect(() => { setItems(drafts); }, [drafts]);

  const handleDelete = (sku: string) =>
    setItems(prev => prev.filter(d => d.sku !== sku));

  if (items.length === 0) return null;

  const allScheduledDates = items
    .map(d => d.scheduledDate)
    .filter((d): d is string => typeof d === 'string' && !!d);

  return (
    <ScrollView style={styles.resultsContainer}>
      <Text style={styles.resultsHeader}>
        Found {items.length} listing draft{items.length !== 1 ? 's' : ''}:
      </Text>
      {items.map((draft, index) => (
        <DraftCard key={draft.offerId} draft={draft} index={index} onDelete={handleDelete} allScheduledDates={allScheduledDates} descTemplates={descTemplates} onTemplateAdded={onTemplateAdded} onTemplateDeleted={onTemplateDeleted} rateTables={rateTables} />
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
