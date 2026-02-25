import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

const TOKEN_STORAGE_KEY = '@ebay_tokens';

export class TokenStorage {
  /**
   * Save tokens to storage
   */
  static async saveTokens(tokens: StoredTokens): Promise<void> {
    try {
      const jsonValue = JSON.stringify(tokens);
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, jsonValue);
    } catch (error) {
      console.error('Error saving tokens:', error);
      throw error;
    }
  }

  /**
   * Get tokens from storage
   */
  static async getTokens(): Promise<StoredTokens | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (error) {
      console.error('Error getting tokens:', error);
      return null;
    }
  }

  /**
   * Check if stored tokens are valid (not expired)
   */
  static async hasValidTokens(): Promise<boolean> {
    const tokens = await this.getTokens();
    if (!tokens) {
      return false;
    }

    // Add 5 minute buffer to refresh before actual expiry
    const bufferMs = 5 * 60 * 1000;
    return Date.now() < (tokens.expiresAt - bufferMs);
  }

  /**
   * Clear all stored tokens
   */
  static async clearTokens(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing tokens:', error);
      throw error;
    }
  }

  /**
   * Check if we need to refresh the token
   */
  static async needsRefresh(): Promise<boolean> {
    const tokens = await this.getTokens();
    if (!tokens) {
      return false;
    }

    // Refresh if less than 30 minutes remaining
    const refreshBufferMs = 30 * 60 * 1000;
    return Date.now() >= (tokens.expiresAt - refreshBufferMs);
  }
}
