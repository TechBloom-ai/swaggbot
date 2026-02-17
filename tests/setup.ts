/* eslint-disable no-console */
import { vi } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL = 'file::memory:';
// @ts-expect-error NODE_ENV is read-only in TypeScript but writable at runtime
process.env.NODE_ENV = 'test';
process.env.MOONSHOT_API_KEY = 'test-api-key';
process.env.MOONSHOT_MODEL = 'kimi-k2.5';

// Mock console methods to reduce noise in tests
// But keep error logging
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

console.log = vi.fn();
console.info = vi.fn();
console.warn = vi.fn();

// Restore original methods after all tests
// @ts-expect-error afterAll is a global from Vitest
afterAll(() => {
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
});

// Clean up after each test
// @ts-expect-error afterEach is a global from Vitest
afterEach(() => {
  vi.clearAllMocks();
});
