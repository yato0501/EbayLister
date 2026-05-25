import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useState } from 'react';

const BACKEND_URL = 'https://api.ebay.who-is-tou.com';

const CONDITION_OPTIONS = [
  { value: 'NEW',                      label: 'New' },
  { value: 'USED_EXCELLENT',           label: 'Used - Excellent' },
  { value: 'USED_VERY_GOOD',           label: 'Used - Very Good' },
  { value: 'USED_GOOD',                label: 'Used - Good' },
  { value: 'USED_ACCEPTABLE',          label: 'Used - Acceptable' },
  { value: 'FOR_PARTS_OR_NOT_WORKING', label: 'For Parts or Not Working' },
];

interface NewDraftFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

export const NewDraftForm = ({ onCreated, onCancel }: NewDraftFormProps) => {
  const [title, setTitle] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>(['']);
  const [condition, setCondition] = useState('USED_GOOD');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          imageUrls: imageUrls.map(u => u.trim()).filter(Boolean),
          condition,
          price: price.trim() || '0.00',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data.error) || 'Create failed');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateImageUrl = (index: number, value: string) => {
    const next = [...imageUrls];
    next[index] = value;
    setImageUrls(next);
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const addImageUrl = () => setImageUrls([...imageUrls, '']);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>New Draft</Text>

      {/* Title */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>TITLE</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. 96-02 Toyota 4Runner ABS pump module OEM"
          placeholderTextColor="#aaa"
        />
      </View>

      {/* Condition */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>CONDITION</Text>
        {Platform.OS === 'web' ? (
          // @ts-ignore — native <select> on web
          <select value={condition} onChange={(e: any) => setCondition(e.target.value)} style={webSelectStyle}>
            {CONDITION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <TextInput style={styles.input} value={condition} onChangeText={setCondition} />
        )}
      </View>

      {/* Price */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>PRICE (USD, optional)</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          placeholder="0.00"
          placeholderTextColor="#aaa"
          keyboardType="decimal-pad"
        />
      </View>

      {/* Image URLs */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>PHOTO URLS (optional)</Text>
        {imageUrls.map((url, i) => (
          <View key={i} style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              value={url}
              onChangeText={(v) => updateImageUrl(i, v)}
              placeholder="https://..."
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity onPress={() => removeImageUrl(i)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addImageUrl} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add photo URL</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.submitButtonText}>Create Draft</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
};

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
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 12,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
  },
  field: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.6 },
  input: {
    fontSize: 13,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fafafa',
  },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  urlInput: {
    flex: 1,
    fontSize: 13,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fafafa',
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 11, color: '#c62828' },
  addBtn: { marginTop: 2 },
  addBtnText: { fontSize: 12, color: '#1976d2', fontWeight: '600' },
  errorText: { color: '#d32f2f', fontSize: 12 },
  buttonRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#bdbdbd',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelButtonText: { fontSize: 13, color: '#666', fontWeight: '600' },
  submitButton: {
    backgroundColor: '#1976d2',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
    minWidth: 110,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#90caf9' },
  submitButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
