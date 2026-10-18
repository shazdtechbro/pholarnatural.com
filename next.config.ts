import type { NextConfig } from 'next'
import path from 'node:path'

const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').origin

const nextConfig: NextConfig = {
  /**
   * There are package-lock.json files in parent directories, so Next infers the workspace root
   * as the user's home directory and warns. Pin it to this project.
   */
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com" +
              (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com https://*.stripe.com; font-src 'self'; connect-src 'self' " +
              apiOrigin +
              " https://*.stripe.com https://m.stripe.network; frame-src https://*.stripe.com https://*.js.stripe.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com",
          },
        ],
      },
    ]
  },
  images: {
    /**
     * All imagery is now served locally from public/images (exported from Stitch and converted
     * to WebP), so no remote hosts are permitted. Re-add a pattern here only if a CDN is
     * introduced later.
     */
    remotePatterns: [
      {
        // Cloudinary — product/service images uploaded via the admin panel
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
}

export default nextConfig
