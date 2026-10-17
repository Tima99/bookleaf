import type { NextConfig } from 'next';

/**
 * The web app is presentation-only: no API routes, route handlers or server actions.
 * All data comes from the Express API at NEXT_PUBLIC_API_URL.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@bookleaf/contracts', '@bookleaf/utils'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
