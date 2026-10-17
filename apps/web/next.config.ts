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
  // Zoho Catalyst Slate returns 500 for the /_next/image optimizer, so images are served
  // as-is. Keep them pre-compressed (e.g. WebP) in src/assets.
  images: { unoptimized: true },
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
