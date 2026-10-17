import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security/headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared package ships TypeScript source.
  transpilePackages: ['@healthhyr/shared'],
  async headers() {
    // On every path: pages, error pages, scripts and files. (The Content-Security-Policy is set per
    // request in src/proxy.ts because it carries a nonce.)
    return [{ source: '/(.*)', headers: STATIC_SECURITY_HEADERS }];
  },
};

export default nextConfig;
