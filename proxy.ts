import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { validateSession } from '@/lib/auth/session';
import { log } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limiter';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/health'];

// Static assets that should be accessible
const STATIC_PATHS = ['/_next', '/favicon.ico', '/robots.txt'];

export async function proxy(request: NextRequest) {
  const startTime = Date.now();
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  // Allow static assets
  if (STATIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'))) {
    logRequest({ method, pathname, ip, userAgent, startTime, status: 'public' });
    return NextResponse.next();
  }

  // Check rate limiting
  try {
    const rateLimitResult = await checkRateLimit({
      ip,
      path: pathname,
      method,
    });

    if (!rateLimitResult.allowed) {
      const windowMinutes = Math.ceil(rateLimitResult.windowMs / 60000);
      const endpointName = getEndpointFriendlyName(pathname, method);

      log.warn('Rate limit exceeded', {
        ip,
        path: pathname,
        method,
        retryAfter: rateLimitResult.retryAfter,
        limit: rateLimitResult.limit,
        windowMinutes,
      });

      const message = endpointName
        ? `Rate limit exceeded for ${endpointName}. You can make ${rateLimitResult.limit} requests per ${windowMinutes} minute(s). Please try again in ${rateLimitResult.retryAfter} seconds.`
        : `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
            details: {
              endpoint: endpointName || 'default',
              limit: rateLimitResult.limit,
              windowMinutes,
              retryAfter: rateLimitResult.retryAfter,
            },
          },
          retry: {
            allowed: false,
            after: rateLimitResult.retryAfter,
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Window': String(windowMinutes),
          },
        }
      );
    }
  } catch (error) {
    log.error('Rate limiting check failed', error, { ip, path: pathname, method });
    // Continue with the request even if rate limiting fails (fail open)
  }

  // Check authentication
  const sessionToken = request.cookies.get('session')?.value;

  if (!sessionToken) {
    log.warn('Unauthorized access attempt - no session', {
      ip,
      path: pathname,
      method,
      userAgent,
    });

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Validate session token
  const isValid = await validateSession(sessionToken);

  if (!isValid) {
    log.warn('Unauthorized access attempt - invalid session', {
      ip,
      path: pathname,
      method,
      userAgent,
    });

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session',
          },
        },
        { status: 401 }
      );
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session');
    return response;
  }

  // Session is valid - allow request
  logRequest({ method, pathname, ip, userAgent, startTime, status: 'authenticated' });

  const response = NextResponse.next();

  return response;
}

function getEndpointFriendlyName(path: string, method: string): string | null {
  if (path.startsWith('/api/chat') && method === 'POST') {
    return 'chat';
  }
  if (path === '/api/workflow' && method === 'POST') {
    return 'workflow creation';
  }
  if (path.match(/^\/api\/workflow\/[^/]+\/execute/) && method === 'POST') {
    return 'workflow execution';
  }
  if (path.startsWith('/api/session') && ['POST', 'PATCH', 'DELETE'].includes(method)) {
    return 'session management';
  }
  return null;
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return 'unknown';
}

interface LogRequestParams {
  method: string;
  pathname: string;
  ip: string;
  userAgent: string;
  startTime: number;
  status: 'public' | 'authenticated' | 'error';
}

function logRequest({ method, pathname, ip, userAgent, startTime, status }: LogRequestParams) {
  const duration = Date.now() - startTime;

  log.info(`Request: ${method} ${pathname}`, {
    method,
    path: pathname,
    ip,
    userAgent,
    duration,
    status,
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
