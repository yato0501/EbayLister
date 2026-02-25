import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { TokenStorage, StoredTokens } from '../services/tokenStorage';

interface LoginProps {
  onLoginSuccess: () => void;
}

const BACKEND_URL = 'http://localhost:3001';

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for auth callback (from web redirect)
    const handleUrl = async (event: { url: string }) => {
      const url = event.url;

      // Check if this is an auth success callback
      if (url.includes('#auth-success')) {
        try {
          // Extract tokens from URL fragment
          const fragment = url.split('#auth-success?')[1];
          if (fragment) {
            const tokensData = JSON.parse(decodeURIComponent(fragment)) as StoredTokens;
            await handleAuthSuccess(tokensData);
          }
        } catch (err) {
          console.error('Error parsing auth callback:', err);
          setError('Failed to process authentication');
          setLoading(false);
        }
      }
    };

    // Web-specific: Check hash on mount and listen for hash changes
    const checkWebHash = async () => {
      if (typeof window !== 'undefined' && window.location.hash.includes('#auth-success')) {
        try {
          const fragment = window.location.hash.split('#auth-success?')[1];
          if (fragment) {
            const tokensData = JSON.parse(decodeURIComponent(fragment)) as StoredTokens;
            await handleAuthSuccess(tokensData);
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (err) {
          console.error('Error parsing auth callback from hash:', err);
          setError('Failed to process authentication');
          setLoading(false);
        }
      }
    };

    // Check hash immediately on mount
    checkWebHash();

    // Listen for hash changes (web)
    const handleHashChange = () => {
      checkWebHash();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleHashChange);
    }

    // Add URL event listener (React Native)
    const subscription = Linking.addEventListener('url', handleUrl);

    return () => {
      subscription.remove();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', handleHashChange);
      }
    };
  }, []);

  const handleAuthSuccess = async (tokens: StoredTokens) => {
    try {
      // Save tokens to storage
      await TokenStorage.saveTokens(tokens);

      // Send tokens to backend server so it can use them for API calls
      await fetch(`${BACKEND_URL}/auth/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokens),
      });

      console.log('✅ Login successful, tokens saved');
      setLoading(false);
      onLoginSuccess();
    } catch (err) {
      console.error('Error saving tokens:', err);
      setError('Failed to save authentication tokens');
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // Open eBay OAuth page
      const authUrl = `${BACKEND_URL}/auth/ebay`;
      const canOpen = await Linking.canOpenURL(authUrl);

      if (canOpen) {
        await Linking.openURL(authUrl);
      } else {
        throw new Error('Cannot open authorization URL');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start login process');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>eBay Lister</Text>
        <Text style={styles.subtitle}>
          Connect your eBay account to manage your listings
        </Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.loginButton, loading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.loginButtonText}>Login with eBay</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.helpText}>
          You'll be redirected to eBay to authorize this app
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    color: '#c62828',
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#1976d2',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonDisabled: {
    backgroundColor: '#90caf9',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
