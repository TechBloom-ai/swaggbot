import { vi } from 'vitest';

export const mockLLMProvider = {
  generateCurl: vi.fn(),
  classifyIntent: vi.fn(),
  planWorkflow: vi.fn(),
  chat: vi.fn(),
};

export const mockSession = {
  id: 'test-session-id',
  name: 'Test Session',
  swaggerUrl: 'https://example.com/swagger.json',
  swaggerDoc: JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/users': {
        get: { summary: 'Get users' },
        post: { summary: 'Create user' },
      },
    },
  }),
  baseUrl: 'https://api.example.com',
  authToken: 'Bearer test-token',
  lastAccessedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockWorkflowSteps = [
  {
    stepNumber: 1,
    description: 'Get all users',
    action: {
      method: 'GET',
      endpoint: '/users',
      body: {},
    },
    extractFields: ['id'],
  },
  {
    stepNumber: 2,
    description: 'Create a user',
    action: {
      method: 'POST',
      endpoint: '/users',
      body: { name: 'Test User' },
    },
    extractFields: [],
  },
];
