import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared package ships TypeScript source.
  transpilePackages: ['@healthhyr/shared'],
};

export default nextConfig;
