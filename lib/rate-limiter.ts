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
  windowMs: number;
}

// Rate limit configuration from environment variables
// Format: RATE_LIMIT_<ENDPOINT>=<requests>:<window_minutes>
// Example: RATE_LIMIT_CHAT=10:1 means 10 requests per minute for chat endpoint

const DEFAULT_WINDOW_MINUTES = 1;

// Parse rate limit from env var (format: "requests:window_minutes")
function parseRateLimit(
  envValue: string | undefined,
  defaultRequests: number
): { max: number; windowMs: number } {
  if (!envValue) {
    return { max: defaultRequests, windowMs: DEFAULT_WINDOW_MINUTES * 60 * 1000 };
  }

  const parts = envValue.split(':');
  const max = parseInt(parts[0], 10) || defaultRequests;
  const windowMinutes = parseInt(parts[1], 10) || DEFAULT_WINDOW_MINUTES;

  return { max, windowMs: windowMinutes * 60 * 1000 };
}

// Define endpoint-specific rate limits
interface EndpointLimit {
  pattern: RegExp;
  methods: string[];
  config: { max: number; windowMs: number };
  name: string;
}

const ENDPOINT_LIMITS: EndpointLimit[] = [
  {
    pattern: /^\/api\/chat/,
    methods: ['POST'],
    config: parseRateLimit(process.env.RATE_LIMIT_CHAT, 30), // 30 requests per minute default
    name: 'chat',
  },
  {
    pattern: /^\/api\/workflow$/,
    methods: ['POST'],
    config: parseRateLimit(process.env.RATE_LIMIT_WORKFLOW_CREATE, 10), // 10 workflow creations per minute
    name: 'workflow_create',
  },
  {
    pattern: /^\/api\/workflow\/[^/]+\/execute/,
    methods: ['POST'],
    config: parseRateLimit(process.env.RATE_LIMIT_WORKFLOW_EXECUTE, 20), // 20 workflow executions per minute
    name: 'workflow_execute',
  },
  {
    pattern: /^\/api\/session/,
    methods: ['POST', 'PATCH', 'DELETE'],
    config: parseRateLimit(process.env.RATE_LIMIT_SESSION, 60), // 60 session mutations per minute
    name: 'session_mutation',
  },
];

const DEFAULT_LIMIT = parseRateLimit(process.env.RATE_LIMIT_DEFAULT, 100);

// Get rate limit config for a specific endpoint
function getEndpointLimit(
  path: string,
  method: string
): { max: number; windowMs: number; name: string } {
  for (const endpoint of ENDPOINT_LIMITS) {
    if (endpoint.pattern.test(path) && endpoint.methods.includes(method)) {
      return { ...endpoint.config, name: endpoint.name };
    }
  }

  return { ...DEFAULT_LIMIT, name: 'default' };
}

// In-memory store for rate limiting
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically (every minute)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime <= now) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.debug('Rate limit cleanup completed', { cleaned, remaining: rateLimitStore.size });
  }
}, 60 * 1000);

export async function checkRateLimit({
  ip,
  path,
  method,
}: RateLimitConfig): Promise<RateLimitResult> {
  const limitConfig = getEndpointLimit(path, method);

  // Create a unique key for this IP + endpoint combination
  const key = `ip:${ip}:endpoint:${limitConfig.name}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime <= now) {
    // First request or window has reset
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + limitConfig.windowMs,
    });

    log.debug('Rate limit window started', {
      ip,
      path,
      endpoint: limitConfig.name,
      limit: limitConfig.max,
      windowMs: limitConfig.windowMs,
    });

    return {
      allowed: true,
      limit: limitConfig.max,
      remaining: limitConfig.max - 1,
      windowMs: limitConfig.windowMs,
    };
  }

  // Increment request count
  entry.count++;

  if (entry.count > limitConfig.max) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    log.warn('Rate limit exceeded', {
      ip,
      path,
      method,
      endpoint: limitConfig.name,
      count: entry.count,
      limit: limitConfig.max,
      retryAfter,
    });

    return {
      allowed: false,
      limit: limitConfig.max,
      remaining: 0,
      retryAfter,
      windowMs: limitConfig.windowMs,
    };
  }

  return {
    allowed: true,
    limit: limitConfig.max,
    remaining: limitConfig.max - entry.count,
    windowMs: limitConfig.windowMs,
  };
}

// Get current rate limit status for an IP and endpoint
export function getRateLimitStatus(ip: string, path: string, method: string): RateLimitResult {
  const limitConfig = getEndpointLimit(path, method);
  const key = `ip:${ip}:endpoint:${limitConfig.name}`;
  const entry = rateLimitStore.get(key);
  const now = Date.now();

  if (!entry || entry.resetTime <= now) {
    return {
      allowed: true,
      limit: limitConfig.max,
      remaining: limitConfig.max,
      windowMs: limitConfig.windowMs,
    };
  }

  return {
    allowed: entry.count <= limitConfig.max,
    limit: limitConfig.max,
    remaining: Math.max(0, limitConfig.max - entry.count),
    retryAfter:
      entry.count > limitConfig.max ? Math.ceil((entry.resetTime - now) / 1000) : undefined,
    windowMs: limitConfig.windowMs,
  };
}

// Get all rate limit configurations (for debugging/monitoring)
export function getRateLimitConfigs(): Array<{ name: string; max: number; windowMinutes: number }> {
  return [
    ...ENDPOINT_LIMITS.map(e => ({
      name: e.name,
      max: e.config.max,
      windowMinutes: e.config.windowMs / 60000,
    })),
    { name: 'default', max: DEFAULT_LIMIT.max, windowMinutes: DEFAULT_LIMIT.windowMs / 60000 },
  ];
}
