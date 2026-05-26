import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// `--localstorage-file` is a Node 22+ flag (experimental webstorage).
// Node 20 — which the GitHub Actions `build` job currently uses — exits
// with "is not allowed in NODE_OPTIONS" the moment Next spawns a worker
// that inherits this env. Skip the setup on older Node so the build
// goes through; SSR localStorage shims aren't required for the
// production bundle to compile.
const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (nodeMajor >= 22) {
  const localStorageOption = `--localstorage-file=${path.join(os.tmpdir(), 'helmv3-localstorage')}`;
  const existingNodeOptions = process.env.NODE_OPTIONS ?? '';
  const hasLocalStorageOption = existingNodeOptions.includes('--localstorage-file');
  const hasLocalStorageValue = /--localstorage-file=\S+/.test(existingNodeOptions);

  if (hasLocalStorageOption && !hasLocalStorageValue) {
    process.env.NODE_OPTIONS = existingNodeOptions
      .replace(/--localstorage-file(=\S+)?/, localStorageOption)
      .trim();
  } else if (!hasLocalStorageOption) {
    process.env.NODE_OPTIONS = `${existingNodeOptions} ${localStorageOption}`.trim();
  }
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // Enable to catch potential issues

  // Type errors block the build. Keep this honest.
  typescript: {
    ignoreBuildErrors: false,
  },

  turbopack: {
    root: projectRoot,
  },

  compiler: {
    // Remove console logs in production for cleaner logs
    // Keep error and warn for debugging production issues
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Allow images from Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'], // Enable modern image formats
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840], // Responsive image sizes
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Smaller image sizes
    minimumCacheTTL: 60, // Cache images for 60 seconds
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Optimize package imports
    optimizePackageImports: [
      'recharts',
      'date-fns',
      'date-fns-tz',
      'framer-motion',
      '@supabase/supabase-js',
      'lucide-react',
      'zod',
      '@radix-ui/react-dialog',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
    ],
  },

  // Webpack optimizations
  // Let Next.js handle splitChunks — its default strategy creates granular,
  // route-specific chunks instead of one monolithic vendor bundle.
  // The previous custom config forced ALL node_modules into a single ~3MB
  // "vendor" chunk, causing render-blocking on mobile devices.

  // Redirects (if needed)
  async redirects() {
    return [];
  },

  // Headers for caching and security
  async headers() {
    return [
      // Security headers for all routes
      {
        source: '/:path*',
        headers: [
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Enable XSS protection
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Referrer policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions policy
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Enable JS profiling for Sentry
          {
            key: 'Document-Policy',
            value: 'js-profiling',
          },
          // HTTP Strict Transport Security (HSTS)
          // Forces HTTPS connections and prevents SSL stripping attacks
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Content Security Policy
          // SECURITY: In development, we need 'unsafe-inline' and 'unsafe-eval' for Next.js hot reload
          // TODO: Use nonce-based CSP in production
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://va.vercel-scripts.com blob:;
              style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
              img-src 'self' data: https: blob:;
              font-src 'self' data: https://fonts.gstatic.com;
              connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://cdnjs.cloudflare.com https://va.vercel-scripts.com https://vitals.vercel-analytics.com ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:*;
              media-src 'self' data:;
              worker-src 'self' blob:;
              frame-src 'self' https://*.supabase.co blob: data:;
              frame-ancestors 'none';
            `.replace(/\s{2,}/g, ' ').trim(),
          },
        ],
      },
      // Never cache the service worker — browsers must always fetch the latest
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      // Cache headers for static assets
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

// Skip Sentry webpack plugin in dev — it adds build overhead without benefit
// Sentry still works in dev via instrumentation.ts, just without source map uploads
const isDev = process.env.NODE_ENV === 'development';

export default isDev
  ? withBundleAnalyzer(nextConfig)
  : withSentryConfig(
      withBundleAnalyzer(nextConfig),
      {
        // https://github.com/getsentry/sentry-webpack-plugin#options
        silent: true,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // Release name + commits — falls back to Vercel's git SHA so each
        // deploy is a distinct release. setCommits with auto:true lets Sentry
        // associate the commits in this build with the release, which powers
        // Suspect Commits ("this error was introduced by commit abc123") and
        // the per-release commit list in the UI.
        release: {
          name: process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
          setCommits: {
            auto: true,
            // Don't fail the build if no GitHub integration is wired up yet —
            // commits will populate once that integration is installed.
            ignoreMissing: true,
            ignoreEmpty: true,
          },
          // Notify Sentry when a deployment to a given environment finishes
          // so release adoption metrics work.
          deploy: {
            env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
          },
        },
        // Don't phone home about build telemetry
        telemetry: false,
      },
      {
        // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

        // Upload a larger set of source maps for prettier stack traces (increases build time)
        widenClientFileUpload: true,

        // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
        tunnelRoute: '/monitoring',

        // Hides source maps from generated client bundles
        hideSourceMaps: true,

        // Tree-shake Sentry logger statements
        disableLogger: true,

        // Auto-instrument Vercel Cron Monitors
        automaticVercelMonitors: true,

        // React component annotations make stack traces show JSX component names
        reactComponentAnnotation: { enabled: true },
      }
    );
