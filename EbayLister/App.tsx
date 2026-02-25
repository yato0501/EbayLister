import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Button, Text } from 'react-native';
import { useState, useEffect } from 'react';
import { useListingDrafts } from './hooks/useListingDrafts';
import { Header, ErrorMessage, LoadingIndicator, DraftList, Login } from './components';
import { AuthService } from './services';

const BACKEND_URL = 'http://localhost:3001';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const { drafts, loading, error, fetchListingDrafts } = useListingDrafts();

  // Check authentication on app startup
  useEffect(() => {
    checkAuth();
  }, []);

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

  const createSampleDraft = async () => {
    setCreatingDraft(true);
    setCreateMessage(null);

    try {
      const response = await fetch(`${BACKEND_URL}/test/create-sample-listing`);

      if (response.ok) {
        setCreateMessage('✅ Sample draft created successfully!');
        // Automatically fetch the updated drafts list
        setTimeout(() => {
          fetchListingDrafts();
          setCreateMessage(null);
        }, 2000);
      } else {
        setCreateMessage('❌ Failed to create sample draft');
      }
    } catch (err) {
      console.error('Error creating sample draft:', err);
      setCreateMessage('❌ Error creating sample draft');
    } finally {
      setCreatingDraft(false);
    }
  };

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <LoadingIndicator />
      </View>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Login onLoginSuccess={handleLoginSuccess} />
      </View>
    );
  }

  // Show main app if authenticated
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header />

      <View style={styles.buttonContainer}>
        <View style={styles.button}>
          <Button
            title={loading ? 'Loading...' : 'Fetch Listing Drafts'}
            onPress={fetchListingDrafts}
            disabled={loading}
          />
        </View>
        <View style={styles.button}>
          <Button
            title={creatingDraft ? 'Creating...' : 'Create Sample Draft'}
            onPress={createSampleDraft}
            disabled={creatingDraft}
            color="#4caf50"
          />
        </View>
      </View>

      {createMessage && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{createMessage}</Text>
        </View>
      )}

      {loading && <LoadingIndicator />}
      {error && <ErrorMessage message={error} />}
      <DraftList drafts={drafts} />
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
    gap: 10,
    marginBottom: 10,
  },
  button: {
    flex: 1,
  },
  messageContainer: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  messageText: {
    color: '#2e7d32',
    textAlign: 'center',
    fontSize: 14,
  },
});
