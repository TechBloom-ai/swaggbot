import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@libsql/client'],
  env: {
    CUSTOM_PROMPTS_PATH: process.env.CUSTOM_PROMPTS_PATH,
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    // CSP for production - strict but allows inline scripts for Next.js
    const prodCsp = `
      default-src 'self';
      script-src 'self' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      font-src 'self' fonts.gstatic.com;
      connect-src 'self';
      img-src 'self' data: blob:;
      frame-ancestors 'none';
      upgrade-insecure-requests;
    `;

    // CSP for development - allows Next.js HMR and inline scripts
    const devCsp = `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval';
      style-src 'self' 'unsafe-inline';
      font-src 'self' fonts.gstatic.com;
      connect-src 'self' ws: wss:;
      img-src 'self' data: blob:;
      frame-ancestors 'none';
    `;

    const cspHeader = (isDev ? devCsp : prodCsp).replace(/\s+/g, ' ').trim();

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
