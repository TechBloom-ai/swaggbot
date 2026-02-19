/**
 * URL validation utilities for Swagger URL security
 * Prevents SSRF attacks by validating protocols and blocking dangerous URLs
 */

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a URL uses only allowed protocols (http:// or https://)
 * Blocks file://, ftp://, and other dangerous protocols
 */
export function validateSwaggerUrl(url: string): UrlValidationResult {
  try {
    const urlObj = new URL(url);

    // Only allow http and https protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return {
        valid: false,
        error: `Invalid protocol: ${urlObj.protocol}. Only HTTP and HTTPS URLs are allowed.`,
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
    };
  }
}

/**
 * Checks if a hostname is a private/internal IP address
 * Blocks access to internal network resources
 */
export function isPrivateIp(hostname: string): boolean {
  // Check for localhost variations (must be checked before port removal)
  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.localhost')
  ) {
    return false; // Allow localhost for development
  }

  // Handle IPv6 addresses in bracket notation [address]
  let cleanHostname = hostname;
  if (hostname.startsWith('[') && hostname.includes(']')) {
    // Extract IPv6 address from brackets, e.g., [fc00::1] -> fc00::1
    cleanHostname = hostname.substring(1, hostname.indexOf(']'));
  } else if (hostname.includes(':') && !hostname.includes('[')) {
    // IPv4 with port - remove the port
    cleanHostname = hostname.split(':')[0];
  }

  // Check for IPv4 private ranges
  const privateIpv4Ranges = [
    /^127\./, // Loopback (but we allow localhost specifically above)
    /^10\./, // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
    /^192\.168\./, // Private Class C
    /^169\.254\./, // Link-local
    /^0\./, // Current network
    /^255\./, // Broadcast
  ];

  for (const range of privateIpv4Ranges) {
    if (range.test(cleanHostname)) {
      // Allow 127.x.x.x for development (localhost IP range)
      if (cleanHostname.startsWith('127.')) {
        return false;
      }
      return true;
    }
  }

  // Check for IPv6 private ranges
  const privateIpv6Ranges = [
    /^fc00:/i, // Unique local addresses
    /^fd00:/i, // Unique local addresses
    /^fe80:/i, // Link-local addresses
    /^::1$/i, // Loopback
  ];

  for (const range of privateIpv6Ranges) {
    if (range.test(cleanHostname)) {
      // Allow ::1 for development
      if (/^::1$/i.test(cleanHostname)) {
        return false;
      }
      return true;
    }
  }

  return false;
}

/**
 * Full validation for Swagger URLs
 * Combines protocol validation and private IP checks
 * Allows localhost and development IPs
 */
export function validateSwaggerUrlFull(url: string): UrlValidationResult {
  // First check protocol
  const protocolResult = validateSwaggerUrl(url);
  if (!protocolResult.valid) {
    return protocolResult;
  }

  try {
    const urlObj = new URL(url);

    // Check for private/internal IPs (but allow localhost)
    if (isPrivateIp(urlObj.hostname)) {
      return {
        valid: false,
        error: `Access to internal network addresses (${urlObj.hostname}) is not allowed.`,
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
    };
  }
}

/**
 * List of dangerous protocols that should never be allowed
 */
export const DANGEROUS_PROTOCOLS = [
  'file:',
  'ftp:',
  'ftps:',
  'sftp:',
  'tftp:',
  'gopher:',
  'dict:',
  'ldap:',
  'ldaps:',
  'smtp:',
  'smtps:',
  'imap:',
  'imaps:',
  'pop3:',
  'pop3s:',
  'ssh:',
  'telnet:',
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'filesystem:',
  'chrome:',
  'chrome-extension:',
  'moz-extension:',
  'ms-appx:',
  'ms-appx-web:',
];
