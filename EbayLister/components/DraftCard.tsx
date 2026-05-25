import { View, Text, Image, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { EbayOffer, EnhancementResult } from '../services';
import { DescTemplate, RateTable } from '../App';

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

const RETURN_POLICY_OPTIONS = [
  { value: 'BUYER_PAYS_30', label: '30 Day Returns - Customer Pays' },
  { value: 'FREE_RETURNS',  label: 'Free Returns (30 Day)' },
  { value: 'NO_RETURNS',    label: 'No Returns Accepted' },
];

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
  onDelete?: (sku: string) => void;
  allScheduledDates?: string[];
  descTemplates?: DescTemplate[];
  onTemplateAdded?: (t: DescTemplate) => void;
  onTemplateDeleted?: (name: string) => void;
  rateTables?: RateTable[];
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

const ReturnPolicyPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>RETURN POLICY</Text>
        {/* @ts-ignore — native <select> on web */}
        <select value={value} onChange={(e: any) => onChange(e.target.value)} style={webSelectStyle}>
          {RETURN_POLICY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </View>
    );
  }
  return <EditField label="RETURN POLICY" value={value} onChangeText={onChange} />;
};

const CategoryPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ categoryId: string; categoryPath: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`${BACKEND_URL}/api/category-suggestions?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        setSuggestions(data.suggestions || []);
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>CATEGORY ID (required to publish)</Text>
      {value ? (
        <View style={styles.categorySelected}>
          <Text style={styles.categorySelectedText}>ID: {value}</Text>
          <TouchableOpacity onPress={() => onChange('')} style={styles.categoryClrBtn}>
            <Text style={styles.categoryClrBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={value ? 'Search to change category...' : 'Search category (e.g. "brake caliper")'}
        placeholderTextColor="#aaa"
      />
      {loading && <Text style={styles.categoryLoading}>Searching...</Text>}
      {suggestions.length > 0 && (
        <View style={styles.categorySuggestions}>
          {suggestions.map(s => (
            <TouchableOpacity
              key={s.categoryId}
              style={styles.categorySuggRow}
              onPress={() => {
                onChange(s.categoryId);
                setQuery('');
                setSuggestions([]);
              }}
            >
              <Text style={styles.categorySuggPath}>{s.categoryPath}</Text>
              <Text style={styles.categorySuggId}>#{s.categoryId}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
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

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// Normalize a part number for comparison: strip dashes/spaces, uppercase
const normPn = (s: string) => s.replace(/[-\s]/g, '').toUpperCase();

// True if every suggested MPN (and interchangeable PNs) appears somewhere in the draft values
const isMpnApplied = (draftValues: string[], e: EnhancementResult): boolean => {
  if (!e.manufacturerPartNumber && !e.interchangeablePartNumbers?.length) return false;
  const draftFlat = normPn(draftValues.join(' '));
  const pns = [e.manufacturerPartNumber, ...(e.interchangeablePartNumbers || [])].filter(Boolean);
  return pns.every(pn => draftFlat.includes(normPn(pn)));
};

// Suggestion row: label + value + copy arrow (or green checkmark if already applied)
const SuggestionField = ({
  label, value, onApply, isApplied,
}: {
  label: string; value: string; onApply?: () => void; isApplied?: boolean;
}) => {
  if (!value) return null;
  return (
    <View style={styles.suggestionRow}>
      <View style={styles.suggestionText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      {onApply && (
        isApplied
          ? <View style={styles.checkBtn}><Text style={styles.checkBtnText}>✓</Text></View>
          : <TouchableOpacity onPress={onApply} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>←</Text>
            </TouchableOpacity>
      )}
    </View>
  );
};

const SuggestionBulletList = ({
  label, items, onApply, isApplied,
}: {
  label: string; items: string[]; onApply?: () => void; isApplied?: boolean;
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
        isApplied
          ? <View style={styles.checkBtn}><Text style={styles.checkBtnText}>✓</Text></View>
          : <TouchableOpacity onPress={onApply} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>←</Text>
            </TouchableOpacity>
      )}
    </View>
  );
};

// Returns a datetime-local string (YYYY-MM-DDTHH:MM) set to 6am the day after
// the latest scheduled date, or 6am tomorrow if nothing is scheduled yet.
const defaultScheduleDate = (allScheduledDates: string[]): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const validDates = allScheduledDates
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()));

  let base: Date;
  if (validDates.length === 0) {
    base = new Date();
    base.setDate(base.getDate() + 1);
  } else {
    const latest = new Date(Math.max(...validDates.map(d => d.getTime())));
    base = new Date(latest);
    base.setDate(base.getDate() + 1);
  }
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T06:00`;
};

// Approximate commercial base rates — Zone 4-5 midpoint; ±15% range covers most zones
const USPS_PRIORITY_RATES = [
  { max: 1,  rate: 9.25 },
  { max: 2,  rate: 10.20 },
  { max: 3,  rate: 11.10 },
  { max: 5,  rate: 12.50 },
  { max: 10, rate: 15.30 },
  { max: 15, rate: 19.10 },
  { max: 20, rate: 22.75 },
  { max: 25, rate: 26.50 },
  { max: 70, rate: 54.20 },
];

const USPS_GROUND_RATES = [
  { max: 1,  rate: 5.60 },
  { max: 2,  rate: 7.10 },
  { max: 3,  rate: 8.40 },
  { max: 5,  rate: 10.20 },
  { max: 10, rate: 13.80 },
  { max: 15, rate: 17.50 },
  { max: 20, rate: 21.00 },
  { max: 25, rate: 25.00 },
  { max: 70, rate: 38.00 },
];

const UPS_GROUND_RATES = [
  { max: 1,  rate: 9.25 },
  { max: 2,  rate: 10.75 },
  { max: 3,  rate: 11.75 },
  { max: 5,  rate: 13.50 },
  { max: 10, rate: 18.25 },
  { max: 15, rate: 22.75 },
  { max: 20, rate: 27.00 },
  { max: 25, rate: 31.00 },
  { max: 70, rate: 52.00 },
];

const FEDEX_GROUND_RATES = [
  { max: 1,  rate: 9.50 },
  { max: 2,  rate: 11.00 },
  { max: 3,  rate: 12.00 },
  { max: 5,  rate: 14.25 },
  { max: 10, rate: 18.50 },
  { max: 15, rate: 23.00 },
  { max: 20, rate: 27.50 },
  { max: 25, rate: 31.50 },
  { max: 70, rate: 53.00 },
];

// Returns billable weight using dimensional weight formula (L×W×H / 139)
const getBillableWeight = (weight: string, length: string, width: string, height: string): number => {
  const w = parseFloat(weight);
  if (!w || isNaN(w)) return 0;
  const l = parseFloat(length);
  const wd = parseFloat(width);
  const h = parseFloat(height);
  const dimWeight = (l > 0 && wd > 0 && h > 0) ? (l * wd * h / 139) : 0;
  return Math.max(w, dimWeight);
};

const rateEstimate = (table: { max: number; rate: number }[], billable: number): string => {
  const entry = table.find(r => billable <= r.max);
  if (!entry) return '';
  return `~$${(entry.rate * 0.85).toFixed(2)}–$${(entry.rate * 1.15).toFixed(2)}`;
};

// ── Main component ────────────────────────────────────────────────────────────

export const DraftCard = ({ draft, index, onDelete, allScheduledDates = [], descTemplates = [], onTemplateAdded, onTemplateDeleted, rateTables = [] }: DraftCardProps) => {
  const [enhancing, setEnhancing] = useState(false);
  const [enhancement, setEnhancement] = useState<EnhancementResult | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  const initialReturnPolicyChoice = (() => {
    const rp = draft.returnPolicy;
    if (!rp || !rp.returnsAccepted) return rp ? 'NO_RETURNS' : 'BUYER_PAYS_30';
    return rp.returnShippingCostPayer === 'SELLER' ? 'FREE_RETURNS' : 'BUYER_PAYS_30';
  })();

  const [editData, setEditData] = useState({
    title:                draft.title                || '',
    price:                draft.pricingSummary?.price?.value || '',
    condition:            draft.condition            || 'USED_GOOD',
    conditionDescription: draft.conditionDescription || '',
    returnPolicyChoice:   initialReturnPolicyChoice,
    description:          draft.listingDescription   || '',
    quantity:             String(draft.quantity ?? 0),
    aspects: Object.fromEntries(
      Object.entries(draft.aspects || {}).map(([k, v]) => [k, [...v]])
    ) as Record<string, string[]>,
    scheduled:    !!draft.scheduledDate,
    scheduledDate: draft.scheduledDate || '',
    packageWeight: draft.packageWeight != null ? String(draft.packageWeight) : '',
    packageLength: draft.packageLength != null ? String(draft.packageLength) : '',
    packageWidth:  draft.packageWidth  != null ? String(draft.packageWidth)  : '',
    packageHeight: draft.packageHeight != null ? String(draft.packageHeight) : '',
    shippingCost:  draft.shippingCost  || '',
    rateTableId:   draft.rateTableId   || '',
    categoryId:    draft.categoryId    || '',
  });

  const [descHeight, setDescHeight] = useState(56);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ listingId?: string; errors?: string[] } | null>(null);

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

  const handlePublish = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/publish-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: draft.sku,
          categoryId: editData.categoryId || undefined,
          price: editData.price || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const listingId = data.listings?.[0]?.listingId;
        setPublishResult({ listingId });
      } else {
        const errors = (data.errors || []).map((e: any) =>
          e.longMessage || e.message || JSON.stringify(e)
        );
        setPublishResult({ errors });
      }
    } catch (err) {
      setPublishResult({ errors: [err instanceof Error ? err.message : 'Unknown error'] });
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveDescTemplate = async () => {
    const text = editData.description.trim();
    if (!text) return;
    const name = (window as any).prompt?.('Template name:')?.trim();
    if (!name) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/description-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text }),
      });
      const data = await res.json();
      if (res.ok) onTemplateAdded?.({ name, text });
    } catch (_) {}
  };

  const handleDeleteDescTemplate = async (name: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/description-templates/${encodeURIComponent(name)}`, { method: 'DELETE' });
      onTemplateDeleted?.(name);
    } catch (_) {}
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/listings/${draft.sku}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editData,
          returnPolicyChoice: editData.returnPolicyChoice,
          scheduledDate: editData.scheduled ? (editData.scheduledDate || null) : null,
          weight: editData.packageWeight || undefined,
          length: editData.packageLength || undefined,
          width:  editData.packageWidth  || undefined,
          height: editData.packageHeight || undefined,
          shippingCost: editData.shippingCost || undefined,
          rateTableId: editData.rateTableId || undefined,
          categoryId: editData.categoryId || undefined,
          price: editData.price || undefined,
        }),
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/listings/${draft.sku}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data.error) || 'Delete failed');
      onDelete?.(draft.sku);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
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
  const billableWeight = getBillableWeight(editData.packageWeight, editData.packageLength, editData.packageWidth, editData.packageHeight);
  const shippingEstimates = billableWeight > 0 ? [
    { label: 'USPS Priority',       range: rateEstimate(USPS_PRIORITY_RATES, billableWeight) },
    { label: 'USPS Ground Adv.',    range: rateEstimate(USPS_GROUND_RATES,    billableWeight) },
    { label: 'UPS Ground',          range: rateEstimate(UPS_GROUND_RATES,     billableWeight) },
    { label: 'FedEx Ground',        range: rateEstimate(FEDEX_GROUND_RATES,   billableWeight) },
  ].filter(e => e.range) : [];

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

      {/* Title row with delete button */}
      <View style={styles.titleRow}>
        <TextInput
          style={[styles.titleInput, { flex: 1 }]}
          value={editData.title}
          onChangeText={setField('title')}
          placeholder="Title"
          placeholderTextColor="#aaa"
        />
        <TouchableOpacity
          onPress={handleDelete}
          disabled={deleting}
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
        >
          {deleting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.deleteBtnText}>Delete</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Two-column body */}
      <View style={styles.columns}>

        {/* Left — editable draft fields */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>CURRENT DRAFT</Text>

          <ReadField label="SKU" value={draft.sku} />
          <ReadField label="STATUS" value={draft.status || ''} />
          <ReturnPolicyPicker value={editData.returnPolicyChoice} onChange={setField('returnPolicyChoice')} />

          <ConditionPicker value={editData.condition} onChange={setField('condition')} />
          <EditField label="CONDITION NOTES" value={editData.conditionDescription} onChangeText={setField('conditionDescription')} />
          <EditField label="QUANTITY" value={editData.quantity} onChangeText={setField('quantity')} />
          <EditField label="PRICE (USD)" value={editData.price} onChangeText={setField('price')} />

          {/* Shipping */}
          <View style={styles.shippingBlock}>
            <Text style={styles.sectionLabel}>SHIPPING</Text>
            <View style={styles.dimRow}>
              <View style={styles.dimField}>
                <Text style={styles.fieldLabel}>WEIGHT (lbs)</Text>
                <TextInput
                  style={styles.input}
                  value={editData.packageWeight}
                  onChangeText={setField('packageWeight')}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor="#aaa"
                />
              </View>
              <View style={styles.dimField}>
                <Text style={styles.fieldLabel}>L (in)</Text>
                <TextInput
                  style={styles.input}
                  value={editData.packageLength}
                  onChangeText={setField('packageLength')}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
              </View>
              <View style={styles.dimField}>
                <Text style={styles.fieldLabel}>W (in)</Text>
                <TextInput
                  style={styles.input}
                  value={editData.packageWidth}
                  onChangeText={setField('packageWidth')}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
              </View>
              <View style={styles.dimField}>
                <Text style={styles.fieldLabel}>H (in)</Text>
                <TextInput
                  style={styles.input}
                  value={editData.packageHeight}
                  onChangeText={setField('packageHeight')}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
              </View>
            </View>
            {shippingEstimates.length > 0 && (
              <View style={styles.shippingEstimates}>
                {shippingEstimates.map(e => (
                  <Text key={e.label} style={styles.shippingEstimate}>{e.label}: {e.range}</Text>
                ))}
              </View>
            )}
            {/* eBay rate table selector — uses tables configured in Seller Hub */}
            {rateTables.length > 0 && Platform.OS === 'web' && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>EBAY RATE TABLE (AK/HI &amp; international overrides)</Text>
                {/* @ts-ignore — native <select> on web */}
                <select
                  value={editData.rateTableId}
                  onChange={(e: any) => setField('rateTableId')(e.target.value)}
                  style={webSelectStyle}
                >
                  <option value="">— none (use flat rate below) —</option>
                  {rateTables.map(rt => (
                    <option key={rt.rateTableId} value={rt.rateTableId}>
                      {rt.name}{rt.type ? ` (${rt.type})` : ''}
                    </option>
                  ))}
                </select>
              </View>
            )}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>FLAT RATE SHIPPING (USD) — lower 48 states</Text>
              <TextInput
                style={styles.input}
                value={editData.shippingCost}
                onChangeText={setField('shippingCost')}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#aaa"
              />
            </View>
          </View>

          <CategoryPicker value={editData.categoryId} onChange={setField('categoryId')} />

          {/* Description with template dropdown */}
          <View style={styles.field}>
            <View style={styles.descLabelRow}>
              <Text style={styles.fieldLabel}>DESCRIPTION</Text>
              <TouchableOpacity onPress={handleSaveDescTemplate}>
                <Text style={styles.saveTemplateLink}>+ Save as template</Text>
              </TouchableOpacity>
            </View>
            {descTemplates.length > 0 && Platform.OS === 'web' && (
              // @ts-ignore — native <select> on web
              <select
                defaultValue=""
                onChange={(e: any) => {
                  if (e.target.value) {
                    setEditData(prev => ({ ...prev, description: e.target.value }));
                    e.target.value = '';
                  }
                }}
                style={{ ...webSelectStyle, marginBottom: 4 }}
              >
                <option value="" disabled>Load template…</option>
                {descTemplates.map((t, i) => (
                  <option key={i} value={t.text}>{t.name}</option>
                ))}
              </select>
            )}
            <TextInput
              style={[styles.input, styles.inputMultiline, { height: Math.max(56, descHeight) }]}
              value={editData.description}
              onChangeText={setField('description')}
              onContentSizeChange={e => setDescHeight(e.nativeEvent.contentSize.height)}
              multiline
            />
          </View>

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

          {/* Schedule toggle */}
          <TouchableOpacity
            style={[styles.scheduleToggle, editData.scheduled && styles.scheduleToggleOn]}
            onPress={() => setEditData(prev => ({
              ...prev,
              scheduled: !prev.scheduled,
              scheduledDate: !prev.scheduled && !prev.scheduledDate
                ? defaultScheduleDate(allScheduledDates)
                : prev.scheduledDate,
            }))}
            activeOpacity={0.8}
          >
            <View style={[styles.scheduleCheckbox, editData.scheduled && styles.scheduleCheckboxOn]}>
              {editData.scheduled && <Text style={styles.scheduleCheckmark}>✓</Text>}
            </View>
            <Text style={[styles.scheduleToggleLabel, editData.scheduled && styles.scheduleToggleLabelOn]}>
              {editData.scheduled ? 'Scheduled' : 'Schedule listing'}
            </Text>
          </TouchableOpacity>

          {editData.scheduled && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>SCHEDULED DATE</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore — native datetime-local on web
                <input
                  type="datetime-local"
                  value={editData.scheduledDate}
                  onChange={(e: any) => setEditData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                  style={webDateInputStyle}
                />
              ) : (
                <TextInput
                  style={styles.input}
                  value={editData.scheduledDate}
                  onChangeText={(v) => setEditData(prev => ({ ...prev, scheduledDate: v }))}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor="#aaa"
                />
              )}
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

          {/* Publish */}
          <TouchableOpacity
            style={[styles.publishButton, publishing && styles.publishButtonDisabled]}
            onPress={handlePublish}
            disabled={publishing}
          >
            {publishing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.publishButtonText}>List on eBay</Text>
            }
          </TouchableOpacity>
          {publishResult && (
            publishResult.listingId
              ? <Text style={styles.publishSuccess}>Listed! ID: {publishResult.listingId}</Text>
              : <View style={styles.publishErrors}>
                  {(publishResult.errors || []).map((e, i) => (
                    <Text key={i} style={styles.publishErrorText}>• {e}</Text>
                  ))}
                </View>
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

          {enhancement && (() => {
            const interchangeTarget = [
              ...enhancement.years.filter(Boolean),
              ...enhancement.keywords.filter(Boolean),
            ];
            return (
            <View style={styles.suggestionFields}>
              {/* Apply All */}
              <TouchableOpacity onPress={() => applyAll(enhancement)} style={styles.applyAllBtn}>
                <Text style={styles.applyAllBtnText}>← Apply All to Draft</Text>
              </TouchableOpacity>

              <SuggestionField
                label="TITLE (80 chars max)"
                value={enhancement.title}
                onApply={() => setField('title')(enhancement.title)}
                isApplied={editData.title.toLowerCase() === enhancement.title.toLowerCase()}
              />
              <SuggestionField
                label="BRAND"
                value={enhancement.brand}
                onApply={() => setAspectValues('Brand')([enhancement.brand])}
                isApplied={editData.aspects['Brand']?.[0] === enhancement.brand}
              />
              <SuggestionField
                label="MANUFACTURER PART NUMBER → Manufacturer Part Number"
                value={[enhancement.manufacturerPartNumber, ...enhancement.interchangeablePartNumbers].filter(Boolean).join(' ')}
                onApply={() => setAspectValues('Manufacturer Part Number')(buildMpnAspect(enhancement))}
                isApplied={isMpnApplied(editData.aspects['Manufacturer Part Number'] || [], enhancement)}
              />
              <ReadField label="PLACEMENT" value={enhancement.placement} />

              <SuggestionBulletList
                label="YEAR → Interchange Part Number"
                items={enhancement.years}
                onApply={() => setAspectValues('Interchange Part Number')(interchangeTarget)}
                isApplied={enhancement.years.filter(Boolean).every(y => (editData.aspects['Interchange Part Number'] || []).includes(y))}
              />
              <SuggestionBulletList
                label="MAKE / MODEL → Superseded Part Number"
                items={enhancement.makeModels}
                onApply={() => setAspectValues('Superseded Part Number')(enhancement.makeModels.filter(Boolean))}
                isApplied={enhancement.makeModels.filter(Boolean).every(m => (editData.aspects['Superseded Part Number'] || []).includes(m))}
              />
              <SuggestionBulletList
                label="KEYWORDS → Interchange Part Number"
                items={enhancement.keywords}
                onApply={() => setAspectValues('Interchange Part Number')(interchangeTarget)}
                isApplied={enhancement.keywords.filter(Boolean).every(k => (editData.aspects['Interchange Part Number'] || []).includes(k))}
              />
              <SuggestionBulletList
                label="SUPERSEDE PART NUMBERS"
                items={enhancement.supersedePartNumbers}
              />
            </View>
            );
          })()}
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

const webDateInputStyle = {
  fontSize: 13,
  color: '#222',
  border: '1px solid #e0e0e0',
  borderRadius: 4,
  padding: '4px 8px',
  backgroundColor: '#fafafa',
  width: '100%',
  marginTop: 4,
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 8 },
  deleteBtn: {
    backgroundColor: '#d32f2f',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  deleteBtnDisabled: { backgroundColor: '#ef9a9a' },
  deleteBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
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
  checkBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  checkBtnText: { fontSize: 14, color: '#2e7d32', fontWeight: '700' },
  applyAllBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  applyAllBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  scheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  scheduleToggleOn: {
    borderColor: '#1565c0',
    backgroundColor: '#e3f2fd',
  },
  scheduleCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#bdbdbd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCheckboxOn: {
    borderColor: '#1565c0',
    backgroundColor: '#1565c0',
  },
  scheduleCheckmark: { fontSize: 13, color: '#fff', fontWeight: '800', lineHeight: 16 },
  scheduleToggleLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  scheduleToggleLabelOn: { color: '#1565c0', fontWeight: '700' },
  descLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveTemplateLink: { fontSize: 11, color: '#1976d2', fontWeight: '600' },
  publishButton: {
    backgroundColor: '#2e7d32',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  publishButtonDisabled: { backgroundColor: '#81c784' },
  publishButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  publishSuccess: { fontSize: 12, color: '#2e7d32', fontWeight: '600', marginTop: 4, textAlign: 'center' },
  publishErrors: { marginTop: 6, backgroundColor: '#fff3e0', borderRadius: 6, padding: 8, gap: 4 },
  publishErrorText: { fontSize: 12, color: '#bf360c', lineHeight: 17 },
  shippingBlock: { gap: 6, marginTop: 4, padding: 8, backgroundColor: '#f8f8f8', borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  dimRow: { flexDirection: 'row', gap: 6 },
  dimField: { flex: 1 },
  shippingEstimates: { gap: 2 },
  shippingEstimate: { fontSize: 12, color: '#388e3c', fontWeight: '600', fontStyle: 'italic' },
  fieldDimmed: { opacity: 0.45 },
  categorySelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e8f5e9',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  categorySelectedText: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },
  categoryClrBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#c8e6c9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryClrBtnText: { fontSize: 10, color: '#1b5e20', fontWeight: '700' },
  categoryLoading: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 2 },
  categorySuggestions: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    backgroundColor: '#fff',
    marginTop: 2,
    overflow: 'hidden',
  },
  categorySuggRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categorySuggPath: { fontSize: 12, color: '#222', flex: 1, flexWrap: 'wrap' },
  categorySuggId: { fontSize: 11, color: '#888', marginLeft: 6, flexShrink: 0 },
});
