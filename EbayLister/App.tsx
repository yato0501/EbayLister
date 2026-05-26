import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Button, TouchableOpacity, Text } from 'react-native';
import { useState, useEffect } from 'react';
import { useListingDrafts } from './hooks/useListingDrafts';
import { Header, ErrorMessage, LoadingIndicator, DraftList, Login, NewDraftForm } from './components';
import { AuthService } from './services';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.ebay.who-is-tou.com';

export type DescTemplate = { name: string; text: string };
export type RateTable = { rateTableId: string; name: string; type: string };

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [descTemplates, setDescTemplates] = useState<DescTemplate[]>([]);
  const [rateTables, setRateTables] = useState<RateTable[]>([]);
  const [showNewDraftForm, setShowNewDraftForm] = useState(false);
  const { drafts, loading, error, fetchListingDrafts } = useListingDrafts();

  useEffect(() => {
    checkAuth();
    fetchDescTemplates();
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchRateTables();
  }, [isAuthenticated]);

  const fetchRateTables = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rate-tables`);
      const data = await res.json();
      setRateTables(data.rateTables || []);
    } catch (_) {}
  };

  const fetchDescTemplates = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/description-templates`);
      const data = await res.json();
      setDescTemplates(data.templates || []);
    } catch (_) {}
  };

  const handleTemplateAdded = (t: DescTemplate) => setDescTemplates(prev => [...prev, t]);
  const handleTemplateDeleted = (name: string) => setDescTemplates(prev => prev.filter(t => t.name !== name));

  const checkAuth = async () => {
    try {
      const authenticated = await AuthService.initialize();
      setIsAuthenticated(authenticated);
    } catch (error) {
      console.error('Auth initialization error:', error);
      setIsAuthenticated(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleSignOut = async () => {
    await AuthService.logout();
    await fetch(`${BACKEND_URL}/auth/logout`, { method: 'POST' }).catch(() => {});
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <LoadingIndicator />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Login onLoginSuccess={handleLoginSuccess} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header />

      <View style={styles.buttonContainer}>
        <View style={styles.fetchButton}>
          <Button
            title={loading ? 'Loading...' : 'Fetch Listing Drafts'}
            onPress={fetchListingDrafts}
            disabled={loading}
          />
        </View>
        <TouchableOpacity
          onPress={() => setShowNewDraftForm(v => !v)}
          style={[styles.newDraftButton, showNewDraftForm && styles.newDraftButtonActive]}
        >
          <Text style={[styles.newDraftButtonText, showNewDraftForm && styles.newDraftButtonTextActive]}>
            {showNewDraftForm ? '✕ Cancel' : '+ New Draft'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {showNewDraftForm && (
        <NewDraftForm
          onCreated={() => { setShowNewDraftForm(false); fetchListingDrafts(); }}
          onCancel={() => setShowNewDraftForm(false)}
        />
      )}

      {loading && <LoadingIndicator />}
      {error && <ErrorMessage message={error} />}
      <DraftList drafts={drafts} descTemplates={descTemplates} onTemplateAdded={handleTemplateAdded} onTemplateDeleted={handleTemplateDeleted} rateTables={rateTables} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  fetchButton: {
    flex: 1,
  },
  newDraftButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1976d2',
  },
  newDraftButtonActive: {
    borderColor: '#bdbdbd',
  },
  newDraftButtonText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '600',
  },
  newDraftButtonTextActive: {
    color: '#999',
  },
  signOutButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  signOutText: {
    fontSize: 13,
    color: '#999',
  },
});
