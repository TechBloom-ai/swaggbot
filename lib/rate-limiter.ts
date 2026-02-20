import { log } from '@/lib/logger';

interface RateLimitConfig {
  ip: string;
  path: string;
  method: string;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Rate limit configuration
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per IP

// In-memory store for rate limiting
// In a production environment with multiple instances, consider using Redis
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
}, WINDOW_MS);

export async function checkRateLimit({ ip, path }: RateLimitConfig): Promise<RateLimitResult> {
  // Create a unique key for this IP
  const key = `ip:${ip}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime <= now) {
    // First request or window has reset
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });

    return {
      allowed: true,
      limit: MAX_REQUESTS_PER_WINDOW,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
    };
  }

  // Increment request count
  entry.count++;

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    log.warn('Rate limit exceeded', {
      ip,
      path,
      count: entry.count,
      limit: MAX_REQUESTS_PER_WINDOW,
      retryAfter,
    });

    return {
      allowed: false,
      limit: MAX_REQUESTS_PER_WINDOW,
      remaining: 0,
      retryAfter,
    };
  }

  return {
    allowed: true,
    limit: MAX_REQUESTS_PER_WINDOW,
    remaining: MAX_REQUESTS_PER_WINDOW - entry.count,
  };
}

// Get current rate limit status for an IP
export function getRateLimitStatus(ip: string): RateLimitResult {
  const key = `ip:${ip}`;
  const entry = rateLimitStore.get(key);
  const now = Date.now();

  if (!entry || entry.resetTime <= now) {
    return {
      allowed: true,
      limit: MAX_REQUESTS_PER_WINDOW,
      remaining: MAX_REQUESTS_PER_WINDOW,
    };
  }

  return {
    allowed: entry.count <= MAX_REQUESTS_PER_WINDOW,
    limit: MAX_REQUESTS_PER_WINDOW,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count),
    retryAfter:
      entry.count > MAX_REQUESTS_PER_WINDOW ? Math.ceil((entry.resetTime - now) / 1000) : undefined,
  };
}
