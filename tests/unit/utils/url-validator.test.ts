import { describe, it, expect } from 'vitest';

import {
  validateSwaggerUrl,
  isPrivateIp,
  validateSwaggerUrlFull,
  DANGEROUS_PROTOCOLS,
} from '@/lib/utils/url-validator';

describe('URL Validator', () => {
  describe('validateSwaggerUrl', () => {
    it('should allow http:// URLs', () => {
      const result = validateSwaggerUrl('http://example.com/swagger.json');
      expect(result.valid).toBe(true);
    });

    it('should allow https:// URLs', () => {
      const result = validateSwaggerUrl('https://example.com/swagger.json');
      expect(result.valid).toBe(true);
    });

    it('should allow localhost URLs', () => {
      const result = validateSwaggerUrl('http://localhost:3000/swagger.json');
      expect(result.valid).toBe(true);
    });

    it('should allow IP address URLs', () => {
      const result = validateSwaggerUrl('http://192.168.1.100:8080/api-docs');
      expect(result.valid).toBe(true);
    });

    it('should block file:// protocol', () => {
      const result = validateSwaggerUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('file:');
      expect(result.error).toContain('Only HTTP and HTTPS URLs are allowed');
    });

    it('should block ftp:// protocol', () => {
      const result = validateSwaggerUrl('ftp://example.com/swagger.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ftp:');
    });

    it('should block gopher:// protocol', () => {
      const result = validateSwaggerUrl('gopher://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('gopher:');
    });

    it('should block dict:// protocol', () => {
      const result = validateSwaggerUrl('dict://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dict:');
    });

    it('should block javascript:// protocol', () => {
      const result = validateSwaggerUrl('javascript://alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('javascript:');
    });

    it('should block data:// protocol', () => {
      const result = validateSwaggerUrl('data:text/html,<script>alert(1)</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('data:');
    });

    it('should handle invalid URL format', () => {
      const result = validateSwaggerUrl('not-a-valid-url');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });

    it('should handle empty string', () => {
      const result = validateSwaggerUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });
  });

  describe('isPrivateIp', () => {
    it('should allow localhost', () => {
      expect(isPrivateIp('localhost')).toBe(false);
    });

    it('should allow localhost with port', () => {
      expect(isPrivateIp('localhost:3000')).toBe(false);
    });

    it('should allow 127.0.0.1 (loopback)', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(false);
    });

    it('should allow 127.x.x.x (loopback range)', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(false);
      expect(isPrivateIp('127.1.2.3')).toBe(false);
      expect(isPrivateIp('127.255.255.255')).toBe(false);
    });

    it('should block 10.x.x.x (Class A private)', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.255.255.255')).toBe(true);
    });

    it('should block 172.16-31.x.x (Class B private)', () => {
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.20.100.50')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
    });

    it('should allow 172.15.x.x (outside private range)', () => {
      expect(isPrivateIp('172.15.0.1')).toBe(false);
    });

    it('should allow 172.32.x.x (outside private range)', () => {
      expect(isPrivateIp('172.32.0.1')).toBe(false);
    });

    it('should block 192.168.x.x (Class C private)', () => {
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('192.168.1.100')).toBe(true);
      expect(isPrivateIp('192.168.255.255')).toBe(true);
    });

    it('should block 169.254.x.x (link-local)', () => {
      expect(isPrivateIp('169.254.0.1')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS metadata
    });

    it('should block 0.x.x.x (current network)', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      expect(isPrivateIp('0.255.255.255')).toBe(true);
    });

    it('should block fc00::/7 (IPv6 unique local)', () => {
      expect(isPrivateIp('[fc00::1]')).toBe(true);
      expect(isPrivateIp('[fc00:1234::1]')).toBe(true);
    });

    it('should block fd00::/8 (IPv6 unique local)', () => {
      expect(isPrivateIp('[fd00::1]')).toBe(true);
      expect(isPrivateIp('[fd00:1234::1]')).toBe(true);
    });

    it('should block fe80::/10 (IPv6 link-local)', () => {
      expect(isPrivateIp('[fe80::1]')).toBe(true);
      expect(isPrivateIp('[fe80::1234:5678:90ab]')).toBe(true);
    });

    it('should allow ::1 (IPv6 loopback)', () => {
      expect(isPrivateIp('[::1]')).toBe(false);
    });

    it('should handle hostname with port', () => {
      expect(isPrivateIp('192.168.1.1:8080')).toBe(true);
      expect(isPrivateIp('localhost:3000')).toBe(false);
      expect(isPrivateIp('127.0.0.1:8080')).toBe(false);
    });

    it('should handle localhost.localdomain', () => {
      expect(isPrivateIp('localhost.localdomain')).toBe(false);
    });

    it('should handle subdomains of localhost', () => {
      expect(isPrivateIp('app.localhost')).toBe(false);
    });
  });

  describe('validateSwaggerUrlFull', () => {
    it('should allow public HTTP URLs', () => {
      const result = validateSwaggerUrlFull('http://api.example.com/swagger.json');
      expect(result.valid).toBe(true);
    });

    it('should allow public HTTPS URLs', () => {
      const result = validateSwaggerUrlFull('https://api.example.com/v1/docs');
      expect(result.valid).toBe(true);
    });

    it('should allow localhost URLs', () => {
      const result = validateSwaggerUrlFull('http://localhost:3000/api-docs');
      expect(result.valid).toBe(true);
    });

    it('should allow 127.0.0.1 URLs', () => {
      const result = validateSwaggerUrlFull('http://127.0.0.1:8080/swagger.json');
      expect(result.valid).toBe(true);
    });

    it('should block file:// URLs', () => {
      const result = validateSwaggerUrlFull('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('file:');
    });

    it('should block private Class A IPs', () => {
      const result = validateSwaggerUrlFull('http://10.0.0.1/swagger.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal network');
    });

    it('should block private Class B IPs', () => {
      const result = validateSwaggerUrlFull('http://172.16.5.10/api/docs');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal network');
    });

    it('should block private Class C IPs', () => {
      const result = validateSwaggerUrlFull('http://192.168.1.100/openapi.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal network');
    });

    it('should block link-local IPs', () => {
      const result = validateSwaggerUrlFull('http://169.254.169.254/latest/meta-data/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal network');
    });

    it('should block ftp:// protocol', () => {
      const result = validateSwaggerUrlFull('ftp://10.0.0.1/swagger.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Only HTTP and HTTPS URLs are allowed');
    });

    it('should handle invalid URL format', () => {
      const result = validateSwaggerUrlFull('not-a-valid-url');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });
  });

  describe('DANGEROUS_PROTOCOLS', () => {
    it('should include file protocol', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('file:');
    });

    it('should include ftp protocols', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('ftp:');
      expect(DANGEROUS_PROTOCOLS).toContain('ftps:');
      expect(DANGEROUS_PROTOCOLS).toContain('sftp:');
    });

    it('should include gopher protocol', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('gopher:');
    });

    it('should include dict protocol', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('dict:');
    });

    it('should include ldap protocols', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('ldap:');
      expect(DANGEROUS_PROTOCOLS).toContain('ldaps:');
    });

    it('should include javascript protocol', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('javascript:');
    });

    it('should include data protocol', () => {
      expect(DANGEROUS_PROTOCOLS).toContain('data:');
    });
  });
});
