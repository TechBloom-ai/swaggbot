/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';

import { parseSwagger, extractBaseUrl, formatSwaggerForLLM } from '@/lib/utils/swagger';

describe('Swagger Utilities', () => {
  describe('parseSwagger', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
      });
      const result = parseSwagger(json);
      expect(result).toEqual({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
      });
    });

    it('should parse valid YAML', () => {
      const yaml = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
`;
      const result = parseSwagger(yaml);
      expect(result.openapi).toBe('3.0.0');
      expect(result.info.title).toBe('Test API');
    });

    it('should throw error for invalid format', () => {
      const invalid = 'this is definitely not json or yaml ::: {{[';
      expect(() => parseSwagger(invalid)).toThrow(
        'Failed to parse Swagger document: invalid JSON or YAML format'
      );
    });

    it('should handle Swagger 2.0 JSON', () => {
      const swagger2 = JSON.stringify({
        swagger: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        host: 'api.example.com',
        basePath: '/v1',
      });
      const result = parseSwagger(swagger2);
      expect(result.swagger).toBe('2.0');
    });
  });

  describe('extractBaseUrl', () => {
    it('should extract URL from OpenAPI 3.x servers', () => {
      const doc = {
        openapi: '3.0.0',
        servers: [{ url: 'https://api.example.com/v1' }],
      };
      const result = extractBaseUrl(doc as any);
      expect(result).toBe('https://api.example.com/v1');
    });

    it('should extract URL from Swagger 2.x', () => {
      const doc = {
        swagger: '2.0',
        host: 'api.example.com',
        basePath: '/v1',
        schemes: ['https'],
      };
      const result = extractBaseUrl(doc as any);
      expect(result).toBe('https://api.example.com/v1');
    });

    it('should use https as default scheme for Swagger 2.x', () => {
      const doc = {
        swagger: '2.0',
        host: 'api.example.com',
      };
      const result = extractBaseUrl(doc as any);
      expect(result).toBe('https://api.example.com');
    });

    it('should return null when no URL can be extracted', () => {
      const doc = {
        openapi: '3.0.0',
      };
      const result = extractBaseUrl(doc as any);
      expect(result).toBeNull();
    });

    it('should use first server URL when multiple servers exist', () => {
      const doc = {
        openapi: '3.0.0',
        servers: [{ url: 'https://primary.example.com' }, { url: 'https://backup.example.com' }],
      };
      const result = extractBaseUrl(doc as any);
      expect(result).toBe('https://primary.example.com');
    });
  });

  describe('formatSwaggerForLLM', () => {
    it('should format basic API info', () => {
      const doc = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
          description: 'A test API',
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('# Test API v1.0.0');
      expect(result).toContain('A test API');
    });

    it('should include base URL when available', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('Base URL: https://api.example.com');
    });

    it('should format endpoints', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
              description: 'Returns a list of users',
            },
          },
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('### GET /users');
      expect(result).toContain('Summary: Get users');
      expect(result).toContain('Description: Returns a list of users');
    });

    it('should format parameters', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              summary: 'Get user by ID',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  type: 'string',
                  required: true,
                  description: 'User ID',
                },
              ],
            },
          },
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('Parameters:');
      expect(result).toContain('id (path): string');
      expect(result).toContain('(required)');
      expect(result).toContain('User ID');
    });

    it('should format request body with required fields', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              summary: 'Create user',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: {
                          type: 'string',
                          description: 'User name',
                        },
                        email: {
                          type: 'string',
                        },
                      },
                      required: ['name', 'email'],
                    },
                  },
                },
              },
            },
          },
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('Request Body:');
      expect(result).toContain('Required: Yes');
      expect(result).toContain('Fields:');
      expect(result).toContain('name: string (REQUIRED)');
      expect(result).toContain('email: string (REQUIRED)');
      expect(result).toContain('Description: User name');
    });

    it('should mark foreign key fields', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/orders': {
            post: {
              summary: 'Create order',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        customer_id: {
                          type: 'string',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('customer_id: string [FOREIGN KEY]');
    });

    it('should format responses', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
              responses: {
                '200': {
                  description: 'List of users',
                },
                '401': {
                  description: 'Unauthorized',
                },
              },
            },
          },
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('Responses:');
      expect(result).toContain('200: List of users');
      expect(result).toContain('401: Unauthorized');
    });

    it('should handle nested schema references', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                address: {
                  type: 'object',
                  properties: {
                    street: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/User',
                    },
                  },
                },
              },
            },
          },
        },
      };
      const result = formatSwaggerForLLM(doc as any);
      expect(result).toContain('Fields:');
      expect(result).toContain('name: string');
    });
  });
});
