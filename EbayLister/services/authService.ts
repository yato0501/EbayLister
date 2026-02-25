import axios from 'axios';
import { TokenStorage, StoredTokens } from './tokenStorage';

const BACKEND_URL = 'http://localhost:3001';

export class AuthService {
  /**
   * Initialize authentication - syncs stored tokens with backend
   * Returns true if user is authenticated, false otherwise
   */
  static async initialize(): Promise<boolean> {
    const tokens = await TokenStorage.getTokens();

    if (!tokens) {
      return false;
    }

    // Check if tokens are still valid
    const hasValid = await TokenStorage.hasValidTokens();

    // If tokens are expired but we have them, try to refresh
    if (!hasValid && tokens.refreshToken) {
      try {
        const newTokens = await this.refreshTokens(tokens.refreshToken);
        await TokenStorage.saveTokens(newTokens);
        await this.syncTokensWithBackend(newTokens);
        return true;
      } catch (error) {
        console.error('Failed to refresh tokens:', error);
        // Clear invalid tokens
        await TokenStorage.clearTokens();
        return false;
      }
    }

    // Sync valid tokens with backend
    if (hasValid) {
      await this.syncTokensWithBackend(tokens);
      return true;
    }

    return false;
  }

  /**
   * Sync tokens with backend server
   */
  static async syncTokensWithBackend(tokens: StoredTokens): Promise<void> {
    try {
      await axios.post(`${BACKEND_URL}/auth/tokens`, tokens, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log('✓ Tokens synced with backend');
    } catch (error) {
      console.error('Failed to sync tokens with backend:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshTokens(refreshToken: string): Promise<StoredTokens> {
    try {
      const response = await axios.post(`${BACKEND_URL}/auth/refresh`, {
        refreshToken,
      });

      return {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        expiresAt: response.data.expiresAt,
      };
    } catch (error) {
      console.error('Failed to refresh tokens:', error);
      throw error;
    }
  }

  /**
   * Logout - clear all tokens
   */
  static async logout(): Promise<void> {
    await TokenStorage.clearTokens();
    console.log('✓ Logged out successfully');
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    return await TokenStorage.hasValidTokens();
  }
}
