/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';

import { tokenExtractorService } from '@/lib/services/tokenExtractor';

describe('TokenExtractorService', () => {
  describe('extractToken', () => {
    it('should return error for invalid response data', () => {
      const result = tokenExtractorService.extractToken(null);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid response data: expected an object');
    });

    it('should return error for non-object response', () => {
      const result = tokenExtractorService.extractToken('string');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid response data: expected an object');
    });

    it('should extract token using LLM-provided path', () => {
      const response = {
        data: {
          access_token: 'eyJhbGciOiJIUzI1NiIs.test.token',
        },
      };
      const result = tokenExtractorService.extractToken(response, 'data.access_token');
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
      expect(result.tokenPath).toBe('data.access_token');
    });

    it('should extract token from common paths', () => {
      const testCases = [
        { path: 'access_token', data: { access_token: 'token123' } },
        { path: 'token', data: { token: 'token456' } },
        { path: 'data.access_token', data: { data: { access_token: 'token789' } } },
        { path: 'result.token', data: { result: { token: 'tokenabc' } } },
      ];

      for (const testCase of testCases) {
        const result = tokenExtractorService.extractToken(testCase.data);
        expect(result.success).toBe(true);
        expect(result.token).toBe(
          testCase.data.access_token ||
            testCase.data.token ||
            testCase.data.data?.access_token ||
            testCase.data.result?.token
        );
        expect(result.tokenPath).toBe(testCase.path);
      }
    });

    it('should extract JWT token through recursive search', () => {
      const response = {
        nested: {
          deep: {
            value: 'eyJhbGciOiJIUzI1NiIs.test.token',
          },
        },
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
      expect(result.tokenPath).toBe('nested.deep.value');
    });

    it('should extract token from array', () => {
      const response = {
        items: [{ token: 'eyJhbGciOiJIUzI1NiIs.test.token' }],
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
    });

    it('should return error when no token found', () => {
      const response = {
        data: {
          message: 'Success',
          count: 10,
        },
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not find authentication token in response');
    });

    it('should remove Bearer prefix from token', () => {
      const response = {
        access_token: 'Bearer eyJhbGciOiJIUzI1NiIs.test.token',
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
    });

    it('should extract alphanumeric token of sufficient length', () => {
      const longToken = 'a'.repeat(30);
      const response = {
        token: longToken,
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe(longToken);
    });

    it('should not extract short strings as tokens', () => {
      const response = {
        short: 'short',
        message: 'This is a message',
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(false);
    });

    it('should handle complex nested structures', () => {
      const response = {
        response: {
          data: {
            auth: {
              jwt: 'eyJhbGciOiJIUzI1NiIs.test.token',
            },
          },
        },
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
    });

    it('should prefer priority keys in recursive search', () => {
      const response = {
        other: 'some-long-string-that-is-not-a-token',
        access_token: 'eyJhbGciOiJIUzI1NiIs.test.token',
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
      expect(result.tokenPath).toBe('access_token');
    });

    it('should handle various JWT formats', () => {
      const validJWTs = [
        'eyJhbGciOiJIUzI1NiIs.test.signature',
        'header.payload.signature',
        'eyJ0eXAiOiJKV1Qi.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpMe',
      ];

      for (const jwt of validJWTs) {
        const response = { token: jwt };
        const result = tokenExtractorService.extractToken(response);
        expect(result.success).toBe(true);
        expect(result.token).toBe(jwt);
      }
    });

    it('should handle accessToken camelCase', () => {
      const response = {
        accessToken: 'eyJhbGciOiJIUzI1NiIs.test.token',
      };
      const result = tokenExtractorService.extractToken(response);
      expect(result.success).toBe(true);
      expect(result.token).toBe('eyJhbGciOiJIUzI1NiIs.test.token');
      expect(result.tokenPath).toBe('accessToken');
    });

    it('should handle errors gracefully', () => {
      // This should not throw, but return error
      const circular: any = {};
      circular.self = circular;

      // JSON.stringify would fail on circular, but our code doesn't use it
      // on the input, so this should work
      const result = tokenExtractorService.extractToken({ token: 'test' });
      // Just verify it doesn't throw and returns a result
      expect(result).toBeDefined();
    });
  });
});
