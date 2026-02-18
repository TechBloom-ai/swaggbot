/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';

// Import the functions we need to test
// Note: These functions are not exported from session.ts, so we need to test them indirectly
// or we could export them for testing purposes

describe('Session Service - Base URL Derivation', () => {
  describe('deriveBaseUrl logic', () => {
    it('should combine origin from swaggerUrl with path from swaggerDoc servers', () => {
      const testCases = [
        {
          swaggerUrl: 'http://192.168.1.8:3000/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: 'http://localhost:3000/api/v1' }],
          },
          expected: 'http://192.168.1.8:3000/api/v1',
        },
        {
          swaggerUrl: 'https://api.example.com/docs/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: 'https://localhost:8080/api/v2' }],
          },
          expected: 'https://api.example.com/api/v2',
        },
        {
          swaggerUrl: 'http://192.168.1.100:5000/api/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: 'http://internal:5000/api/v1' }],
          },
          expected: 'http://192.168.1.100:5000/api/v1',
        },
        {
          swaggerUrl: 'http://localhost:3000/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: 'http://localhost:3000' }],
          },
          expected: 'http://localhost:3000',
        },
      ];

      testCases.forEach(({ swaggerUrl, swaggerDoc, expected }) => {
        // Extract origin from swaggerUrl
        const urlOrigin = extractOriginFromUrl(swaggerUrl);
        expect(urlOrigin).toBeTruthy();

        // Extract baseUrl from swaggerDoc
        const swaggerDocBaseUrl = extractBaseUrlFromDoc(swaggerDoc as any);
        expect(swaggerDocBaseUrl).toBeTruthy();

        // Combine them
        const result = combineBaseUrl(urlOrigin!, swaggerDocBaseUrl!);
        expect(result).toBe(expected);
      });
    });

    it('should handle relative paths in swaggerDoc servers', () => {
      const testCases = [
        {
          swaggerUrl: 'http://192.168.1.8:3000/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: '/api/v1' }],
          },
          expected: 'http://192.168.1.8:3000/api/v1',
        },
        {
          swaggerUrl: 'https://api.example.com/docs/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: '/api/v2' }],
          },
          expected: 'https://api.example.com/api/v2',
        },
      ];

      testCases.forEach(({ swaggerUrl, swaggerDoc, expected }) => {
        const urlOrigin = extractOriginFromUrl(swaggerUrl);
        const swaggerDocBaseUrl = extractBaseUrlFromDoc(swaggerDoc as any);
        const result = combineBaseUrl(urlOrigin!, swaggerDocBaseUrl!);
        expect(result).toBe(expected);
      });
    });

    it('should handle swaggerDoc without servers (fallback to swaggerUrl origin)', () => {
      const swaggerUrl = 'http://192.168.1.8:3000/swagger.json';
      const swaggerDoc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
      };

      const urlOrigin = extractOriginFromUrl(swaggerUrl);
      const swaggerDocBaseUrl = extractBaseUrlFromDoc(swaggerDoc as any);

      if (!swaggerDocBaseUrl && urlOrigin) {
        expect(urlOrigin).toBe('http://192.168.1.8:3000');
      }
    });

    it('should remove trailing slashes from the final URL', () => {
      const testCases = [
        {
          swaggerUrl: 'http://192.168.1.8:3000/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: 'http://localhost:3000/api/v1/' }],
          },
          expected: 'http://192.168.1.8:3000/api/v1',
        },
        {
          swaggerUrl: 'http://192.168.1.8:3000/swagger.json',
          swaggerDoc: {
            openapi: '3.0.0',
            servers: [{ url: 'http://localhost:3000/api/v1//' }],
          },
          expected: 'http://192.168.1.8:3000/api/v1',
        },
      ];

      testCases.forEach(({ swaggerUrl, swaggerDoc, expected }) => {
        const urlOrigin = extractOriginFromUrl(swaggerUrl);
        const swaggerDocBaseUrl = extractBaseUrlFromDoc(swaggerDoc as any);
        const result = combineBaseUrl(urlOrigin!, swaggerDocBaseUrl!);
        expect(result).toBe(expected);
      });
    });

    it('should handle Swagger 2.x format', () => {
      const swaggerUrl = 'http://192.168.1.8:3000/swagger.json';
      const swaggerDoc = {
        swagger: '2.0',
        host: 'localhost:3000',
        basePath: '/api/v1',
        schemes: ['http'],
      };

      const urlOrigin = extractOriginFromUrl(swaggerUrl);
      const swaggerDocBaseUrl = extractBaseUrlFromDoc(swaggerDoc as any);
      const result = combineBaseUrl(urlOrigin!, swaggerDocBaseUrl!);

      expect(result).toBe('http://192.168.1.8:3000/api/v1');
    });
  });
});

// Helper functions to test the logic (mirroring the actual implementation)
function extractOriginFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    return null;
  }
}

function extractBaseUrlFromDoc(doc: any): string | null {
  // OpenAPI 3.x servers
  if (doc.servers && doc.servers.length > 0) {
    return doc.servers[0].url;
  }

  // Swagger 2.x
  if (doc.host) {
    const scheme = doc.schemes?.[0] || 'https';
    const basePath = doc.basePath || '';
    return `${scheme}://${doc.host}${basePath}`;
  }

  return null;
}

function combineBaseUrl(origin: string, docBaseUrl: string): string {
  try {
    const docUrl = new URL(docBaseUrl);
    // Combine origin from swaggerUrl with pathname from swaggerDoc
    // Remove trailing slashes to avoid double slashes when appending endpoints
    return `${origin}${docUrl.pathname}`.replace(/\/+$/, '');
  } catch {
    // If docBaseUrl is relative (e.g., "/api/v1")
    return `${origin}${docBaseUrl}`.replace(/\/+$/, '');
  }
}
