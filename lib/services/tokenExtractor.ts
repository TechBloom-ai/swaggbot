export interface TokenExtractionResult {
  success: boolean;
  token?: string;
  error?: string;
  tokenPath?: string;
}

/**
 * Service for extracting authentication tokens from API responses
 * Ported from Swaggbot v1 (Express) to v2 (Next.js)
 *
 * This service provides multiple extraction strategies:
 * 1. LLM-provided specific path (highest priority)
 * 2. Common token paths (access_token, token, jwt, etc.)
 * 3. Recursive search with JWT and token pattern detection
 */
export class TokenExtractorService {
  // Common paths where tokens are typically found in API responses
  private commonTokenPaths = [
    'access_token',
    'token',
    'jwt',
    'auth_token',
    'bearer_token',
    'id_token',
    'data.access_token',
    'data.token',
    'data.jwt',
    'data.auth_token',
    'result.access_token',
    'result.token',
    'result.jwt',
    'response.access_token',
    'response.token',
    'body.access_token',
    'body.token',
    'accessToken',
    'authToken',
  ];

  /**
   * Extract authentication token from API response
   * Uses multiple strategies in order of priority:
   * 1. LLM-provided specific path
   * 2. Common token paths
   * 3. Recursive search with pattern detection
   *
   * @param responseData - The API response data (parsed JSON object)
   * @param tokenPath - Optional specific JSON path from LLM (e.g., "data.access_token")
   * @returns TokenExtractionResult with extracted token, path used, and status
   */
  extractToken(responseData: unknown, tokenPath?: string): TokenExtractionResult {
    try {
      if (!responseData || typeof responseData !== 'object') {
        return {
          success: false,
          error: 'Invalid response data: expected an object',
        };
      }

      // Strategy 1: If LLM provided a specific path, try that first
      if (tokenPath) {
        const token = this.getValueByPath(responseData, tokenPath);
        if (token && typeof token === 'string') {
          console.log('[TokenExtractor] Token extracted using LLM-provided path:', tokenPath);
          return {
            success: true,
            token: this.formatToken(token),
            tokenPath,
          };
        }
      }

      // Strategy 2: Try common token paths
      for (const path of this.commonTokenPaths) {
        const token = this.getValueByPath(responseData, path);
        if (token && typeof token === 'string') {
          console.log('[TokenExtractor] Token extracted using common path:', path);
          return {
            success: true,
            token: this.formatToken(token),
            tokenPath: path,
          };
        }
      }

      // Strategy 3: Search recursively for token-like strings
      const foundToken = this.searchForToken(responseData);
      if (foundToken) {
        console.log('[TokenExtractor] Token found through recursive search');
        return {
          success: true,
          token: this.formatToken(foundToken.token),
          tokenPath: foundToken.path,
        };
      }

      return {
        success: false,
        error: 'Could not find authentication token in response',
      };
    } catch (error) {
      console.error(
        '[TokenExtractor] Error extracting token:',
        error instanceof Error ? error.message : String(error)
      );
      return {
        success: false,
        error: `Token extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get a value from an object using dot-notation path
   * @param obj - The object to search
   * @param path - Dot-notation path (e.g., "data.access_token")
   * @returns The value at the path or undefined
   */
  private getValueByPath(obj: unknown, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Recursively search for a token-like string in the response
   * Prioritizes common token field names, then searches all values
   * @param obj - The object to search
   * @param currentPath - Current path for tracking (internal use)
   * @returns Object with token and path if found, or undefined
   */
  private searchForToken(
    obj: unknown,
    currentPath = ''
  ): { token: string; path: string } | undefined {
    if (typeof obj === 'string') {
      // Check if it looks like a token (JWT or similar)
      if (this.isTokenLike(obj)) {
        return { token: obj, path: currentPath };
      }
      return undefined;
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const itemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
        const result = this.searchForToken(obj[i], itemPath);
        if (result) {
          return result;
        }
      }
      return undefined;
    }

    if (typeof obj === 'object' && obj !== null) {
      // First check common token field names (priority keys)
      const priorityKeys = [
        'access_token',
        'token',
        'jwt',
        'auth_token',
        'bearer_token',
        'id_token',
        'accessToken',
        'authToken',
      ];

      for (const key of priorityKeys) {
        if (key in obj) {
          const value = (obj as Record<string, unknown>)[key];
          if (typeof value === 'string' && this.isTokenLike(value)) {
            const fullPath = currentPath ? `${currentPath}.${key}` : key;
            return { token: value, path: fullPath };
          }
        }
      }

      // Then search all values recursively
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = (obj as Record<string, unknown>)[key];
          const fullPath = currentPath ? `${currentPath}.${key}` : key;
          const result = this.searchForToken(value, fullPath);
          if (result) {
            return result;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a string looks like an authentication token
   * Supports:
   * - JWT format (three base64url parts separated by dots)
   * - General tokens (alphanumeric with special chars, 20+ chars)
   * - Bearer token format (prefixed with "Bearer ")
   *
   * @param str - The string to check
   * @returns True if it looks like a token
   */
  private isTokenLike(str: string): boolean {
    if (!str || typeof str !== 'string') {
      return false;
    }

    // JWT format: three base64url parts separated by dots
    // Example: eyJhbGciOiJIUzI1NiIs...eyJzdWIiOiIxMjM0NTY3ODkw...SflKxwRJSMeKKF2QT4fwpMe
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(str)) {
      return true;
    }

    // General token: alphanumeric with some special chars, reasonable length (20+ chars)
    // Excludes obvious non-token strings like error messages
    if (/^[A-Za-z0-9_\-\.]+$/.test(str) && str.length >= 20) {
      return true;
    }

    // Bearer token format (e.g., "Bearer eyJhbGciOiJIUzI1NiIs...")
    if (str.toLowerCase().startsWith('bearer ') && str.length > 30) {
      return true;
    }

    return false;
  }

  /**
   * Format a token by removing Bearer prefix if present
   * The Bearer prefix will be added by the system when making requests
   * This ensures consistent storage without duplicate prefixes
   *
   * @param token - The raw token string
   * @returns Clean token without Bearer prefix
   */
  private formatToken(token: string): string {
    if (token.toLowerCase().startsWith('bearer ')) {
      return token.substring(7).trim();
    }
    return token;
  }
}

// Export singleton instance for convenience
export const tokenExtractorService = new TokenExtractorService();

// Also export as default
export default TokenExtractorService;
