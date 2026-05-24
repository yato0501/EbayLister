import { View, Text, Image, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, Platform } from 'react-native';
import { useState } from 'react';
import { EbayOffer, EnhancementResult } from '../services';

const BACKEND_URL = 'https://api.ebay.who-is-tou.com';

// Generate 3 search-friendly variants of a part number.
// e.g. "89541-04010" → ["89541-04010 89541 04010 8954104010"] if ≤65 chars,
// otherwise ["89541-04010", "89541 04010", "8954104010"] as separate entries.
const mpnVariants = (mpn: string): string[] => {
  if (!mpn) return [];
  const withDash  = mpn.trim();
  const withSpace = withDash.replace(/-/g, ' ');
  const noSep     = withDash.replace(/[-\s]/g, '');
  // Deduplicate (e.g. if no dashes present, withDash === withSpace)
  const unique = [...new Set([withDash, withSpace, noSep])];
  const combined = unique.join(' ');
  return combined.length <= 65 ? [combined] : unique;
};

const CONDITION_OPTIONS = [
  { value: 'NEW',                      label: 'New' },
  { value: 'USED_EXCELLENT',           label: 'Used - Excellent' },
  { value: 'USED_VERY_GOOD',           label: 'Used - Very Good' },
  { value: 'USED_GOOD',                label: 'Used - Good' },
  { value: 'USED_ACCEPTABLE',          label: 'Used - Acceptable' },
  { value: 'FOR_PARTS_OR_NOT_WORKING', label: 'For Parts or Not Working' },
];

interface DraftCardProps {
  draft: EbayOffer;
  index: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ReadField = ({ label, value }: { label: string; value: string }) => {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
};

const EditField = ({
  label, value, onChangeText, multiline = false,
}: {
  label: string; value: string; onChangeText: (v: string) => void; multiline?: boolean;
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
    />
  </View>
);

const ConditionPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>CONDITION</Text>
        {/* @ts-ignore — native <select> on web */}
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          style={webSelectStyle}
        >
          {CONDITION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </View>
    );
  }
  // Fallback for native
  return <EditField label="CONDITION" value={value} onChangeText={onChange} />;
};

const EditMultiField = ({
  label, values, onChange,
}: {
  label: string; values: string[]; onChange: (vals: string[]) => void;
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {values.map((val, i) => (
      <View key={i} style={styles.multiRow}>
        <TextInput
          style={styles.multiInput}
          value={val}
          onChangeText={(text) => {
            const next = [...values];
            next[i] = text;
            onChange(next);
          }}
        />
        <TouchableOpacity onPress={() => onChange(values.filter((_, j) => j !== i))} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    ))}
    <TouchableOpacity onPress={() => onChange([...values, ''])} style={styles.addBtn}>
      <Text style={styles.addBtnText}>+ Add</Text>
    </TouchableOpacity>
  </View>
);

// Suggestion row: label + value + copy arrow button
const SuggestionField = ({
  label, value, onApply,
}: {
  label: string; value: string; onApply?: () => void;
}) => {
  if (!value) return null;
  return (
    <View style={styles.suggestionRow}>
      <View style={styles.suggestionText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      {onApply && (
        <TouchableOpacity onPress={onApply} style={styles.applyBtn}>
          <Text style={styles.applyBtnText}>←</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const SuggestionBulletList = ({
  label, items, onApply,
}: {
  label: string; items: string[]; onApply?: () => void;
}) => {
  if (!items?.length) return null;
  return (
    <View style={styles.suggestionRow}>
      <View style={styles.suggestionText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {items.map((item, i) => (
          <Text key={i} style={styles.bulletItem}>• {item}</Text>
        ))}
      </View>
      {onApply && (
        <TouchableOpacity onPress={onApply} style={styles.applyBtn}>
          <Text style={styles.applyBtnText}>←</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const DraftCard = ({ draft, index }: DraftCardProps) => {
  const [enhancing, setEnhancing] = useState(false);
  const [enhancement, setEnhancement] = useState<EnhancementResult | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  const [editData, setEditData] = useState({
    title:                draft.title                || '',
    condition:            draft.condition            || 'USED_GOOD',
    conditionDescription: draft.conditionDescription || '',
    description:          draft.listingDescription   || '',
    quantity:             String(draft.quantity ?? 0),
    aspects: Object.fromEntries(
      Object.entries(draft.aspects || {}).map(([k, v]) => [k, [...v]])
    ) as Record<string, string[]>,
  });

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const setField = (key: keyof Omit<typeof editData, 'aspects'>) => (val: string) =>
    setEditData(prev => ({ ...prev, [key]: val }));

  const setAspectValues = (key: string) => (vals: string[]) =>
    setEditData(prev => ({ ...prev, aspects: { ...prev.aspects, [key]: vals } }));

  // Build Manufacturer Part Number aspect values: MPN + interchangeable part numbers, each with 3 variants
  const buildMpnAspect = (e: EnhancementResult): string[] => [
    ...mpnVariants(e.manufacturerPartNumber),
    ...e.interchangeablePartNumbers.flatMap(p => mpnVariants(p)),
  ].filter(Boolean);

  // Apply all Claude suggestions to draft fields
  const applyAll = (e: EnhancementResult) => {
    setEditData(prev => ({
      ...prev,
      title: e.title || prev.title,
      aspects: {
        ...prev.aspects,
        ...(e.brand ? { Brand: [e.brand] } : {}),
        ...(e.manufacturerPartNumber || e.interchangeablePartNumbers?.length
          ? { 'Manufacturer Part Number': buildMpnAspect(e) }
          : {}),
        'Interchange Part Number': [
          ...e.years.filter(Boolean),
          ...e.keywords.filter(Boolean),
        ],
        'Superseded Part Number': e.makeModels.filter(Boolean),
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/listings/${draft.sku}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data.error) || 'Save failed');
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEnhance = async () => {
    setEnhancing(true);
    setEnhancement(null);
    setEnhanceError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/enhance-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: draft.sku }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Enhancement failed');
      setEnhancement(data);
    } catch (err) {
      setEnhanceError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setEnhancing(false);
    }
  };

  const aspectEntries = Object.entries(editData.aspects);

  return (
    <View style={styles.card}>
      {/* Images */}
      {draft.imageUrls && draft.imageUrls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {draft.imageUrls.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={styles.image} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      {/* Title — editable, full width */}
      <View style={styles.titleRow}>
        <TextInput
          style={styles.titleInput}
          value={editData.title}
          onChangeText={setField('title')}
          placeholder="Title"
          placeholderTextColor="#aaa"
        />
      </View>

      {/* Two-column body */}
      <View style={styles.columns}>

        {/* Left — editable draft fields */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>CURRENT DRAFT</Text>

          <ReadField label="SKU" value={draft.sku} />
          <ReadField label="STATUS" value={draft.status || ''} />

          <ConditionPicker value={editData.condition} onChange={setField('condition')} />
          <EditField label="CONDITION NOTES" value={editData.conditionDescription} onChangeText={setField('conditionDescription')} />
          <EditField label="QUANTITY" value={editData.quantity} onChangeText={setField('quantity')} />
          <EditField label="DESCRIPTION" value={editData.description} onChangeText={setField('description')} multiline />

          {aspectEntries.length > 0 && (
            <View style={styles.aspectsBlock}>
              <Text style={styles.sectionLabel}>ITEM SPECIFICS</Text>
              {aspectEntries.map(([key, vals]) => (
                <EditMultiField
                  key={key}
                  label={key.toUpperCase()}
                  values={vals}
                  onChange={setAspectValues(key)}
                />
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveButtonText}>Save to eBay</Text>
            }
          </TouchableOpacity>
          {saveMessage && (
            <Text style={[styles.saveMessage, saveMessage === 'Saved' ? styles.saveMessageOk : styles.saveMessageErr]}>
              {saveMessage}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Right — Claude suggestions */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>CLAUDE SUGGESTIONS</Text>

          {!enhancement && !enhancing && (
            <Text style={styles.placeholderText}>Click "Enhance" to generate suggestions.</Text>
          )}
          {enhancing && (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="small" color="#7c3aed" />
              <Text style={styles.loadingText}>Analyzing with Claude...</Text>
            </View>
          )}
          {enhanceError && <Text style={styles.errorText}>{enhanceError}</Text>}

          {enhancement && (
            <View style={styles.suggestionFields}>
              {/* Apply All */}
              <TouchableOpacity onPress={() => applyAll(enhancement)} style={styles.applyAllBtn}>
                <Text style={styles.applyAllBtnText}>← Apply All to Draft</Text>
              </TouchableOpacity>

              <SuggestionField
                label="TITLE (80 chars max)"
                value={enhancement.title}
                onApply={() => setField('title')(enhancement.title)}
              />
              <SuggestionField
                label="BRAND"
                value={enhancement.brand}
                onApply={() => setAspectValues('Brand')([enhancement.brand])}
              />
              <SuggestionField
                label="MANUFACTURER PART NUMBER → Manufacturer Part Number"
                value={[enhancement.manufacturerPartNumber, ...enhancement.interchangeablePartNumbers].filter(Boolean).join(' ')}
                onApply={() => setAspectValues('Manufacturer Part Number')(buildMpnAspect(enhancement))}
              />
              <ReadField label="PLACEMENT" value={enhancement.placement} />

              <SuggestionBulletList
                label="YEAR → Interchange Part Number"
                items={enhancement.years}
                onApply={() => setAspectValues('Interchange Part Number')([
                  ...enhancement.years.filter(Boolean),
                  ...enhancement.keywords.filter(Boolean),
                ])}
              />
              <SuggestionBulletList
                label="MAKE / MODEL → Superseded Part Number"
                items={enhancement.makeModels}
                onApply={() => setAspectValues('Superseded Part Number')(enhancement.makeModels.filter(Boolean))}
              />
              <SuggestionBulletList
                label="KEYWORDS → Interchange Part Number"
                items={enhancement.keywords}
                onApply={() => setAspectValues('Interchange Part Number')([
                  ...enhancement.years.filter(Boolean),
                  ...enhancement.keywords.filter(Boolean),
                ])}
              />
              <SuggestionBulletList
                label="SUPERSEDE PART NUMBERS"
                items={enhancement.supersedePartNumbers}
              />
            </View>
          )}
        </View>
      </View>

      {/* Enhance button */}
      <TouchableOpacity
        style={[styles.enhanceButton, enhancing && styles.enhanceButtonDisabled]}
        onPress={handleEnhance}
        disabled={enhancing}
      >
        <Text style={styles.enhanceButtonText}>
          {enhancement ? 'Re-enhance with Claude' : 'Enhance with Claude'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const webSelectStyle = {
  fontSize: 13,
  color: '#222',
  border: '1px solid #e0e0e0',
  borderRadius: 4,
  padding: '4px 8px',
  backgroundColor: '#fafafa',
  width: '100%',
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  imageRow: { flexDirection: 'row' },
  image: { width: 120, height: 120, marginRight: 4 },
  titleRow: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 8 },
  titleInput: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1976d2',
    borderBottomWidth: 1,
    borderBottomColor: '#bbdefb',
    paddingVertical: 4,
  },
  columns: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 10 },
  column: { flex: 1, gap: 8, paddingVertical: 4 },
  columnHeader: { fontSize: 11, fontWeight: '800', color: '#555', letterSpacing: 1, marginBottom: 4 },
  divider: { width: 1, backgroundColor: '#e0e0e0', marginHorizontal: 12 },
  field: { gap: 2 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.6 },
  fieldValue: { fontSize: 13, color: '#222', lineHeight: 18 },
  bulletItem: { fontSize: 13, color: '#222', lineHeight: 18, paddingLeft: 4 },
  input: {
    fontSize: 13,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
  },
  inputMultiline: { minHeight: 56, textAlignVertical: 'top' },
  multiRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  multiInput: {
    flex: 1,
    fontSize: 13,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 11, color: '#c62828' },
  addBtn: { marginTop: 2 },
  addBtnText: { fontSize: 12, color: '#1976d2', fontWeight: '600' },
  aspectsBlock: { gap: 8, marginTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#777', letterSpacing: 0.8 },
  saveButton: {
    backgroundColor: '#1976d2',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { backgroundColor: '#90caf9' },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  saveMessage: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  saveMessageOk: { color: '#2e7d32' },
  saveMessageErr: { color: '#c62828' },
  enhanceButton: {
    backgroundColor: '#7c3aed',
    marginHorizontal: 15,
    marginBottom: 12,
    marginTop: 4,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  enhanceButtonDisabled: { backgroundColor: '#a78bda' },
  enhanceButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  placeholderText: { fontSize: 12, color: '#bbb', fontStyle: 'italic' },
  loadingBlock: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 12, color: '#7c3aed' },
  suggestionFields: { gap: 8 },
  errorText: { color: '#d32f2f', fontSize: 12 },
  // Suggestion rows with apply button
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  suggestionText: { flex: 1, gap: 2 },
  applyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  applyBtnText: { fontSize: 13, color: '#7c3aed', fontWeight: '700' },
  applyAllBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  applyAllBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});
