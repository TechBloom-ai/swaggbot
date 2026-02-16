import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@libsql/client'],
  env: {
    CUSTOM_PROMPTS_PATH: process.env.CUSTOM_PROMPTS_PATH,
  },
};

export default nextConfig;
