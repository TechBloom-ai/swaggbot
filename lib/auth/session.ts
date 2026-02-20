/**
 * Session Management using Web Crypto API
 * Compatible with both Node.js and Edge Runtime
 */

const SESSION_SECRET_ENV = process.env.SESSION_SECRET;
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '86400', 10); // 24 hours default

if (!SESSION_SECRET_ENV) {
  throw new Error('SESSION_SECRET environment variable is required');
}

const SESSION_SECRET = SESSION_SECRET_ENV;

interface SessionData {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Convert string to Uint8Array
 */
function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to base64url string
 */
function bufferToBase64Url(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Timing-safe comparison of two Uint8Arrays
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Create HMAC-SHA256 signature using Web Crypto API
 */
async function createHmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return bufferToBase64Url(new Uint8Array(signature));
}

/**
 * Create a signed session token
 */
export async function createSession(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    userId: 'user',
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE,
  };

  const payload = btoa(JSON.stringify(sessionData))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const signature = await createHmac(payload, SESSION_SECRET);

  return `${payload}.${signature}`;
}

/**
 * Validate a session token
 */
export async function validateSession(token: string): Promise<boolean> {
  try {
    const [payload, signature] = token.split('.');

    if (!payload || !signature) {
      return false;
    }

    // Verify signature
    const expectedSignature = await createHmac(payload, SESSION_SECRET);

    const signatureBuf = stringToBuffer(signature);
    const expectedBuf = stringToBuffer(expectedSignature);

    if (!timingSafeEqual(signatureBuf, expectedBuf)) {
      return false;
    }

    // Parse and validate session data
    const jsonStr = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sessionData: SessionData = JSON.parse(jsonStr);

    if (sessionData.expiresAt < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get session data from token
 */
export function getSessionData(token: string): SessionData | null {
  try {
    const [payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const jsonStr = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Verify password against APP_PASSWORD env var
 */
export function verifyPassword(password: string): boolean {
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    throw new Error('APP_PASSWORD environment variable is not set');
  }

  // Use timing-safe comparison to prevent timing attacks
  const passwordBuf = stringToBuffer(password);
  const appPasswordBuf = stringToBuffer(appPassword);

  if (passwordBuf.length !== appPasswordBuf.length) {
    return false;
  }

  return timingSafeEqual(passwordBuf, appPasswordBuf);
}
