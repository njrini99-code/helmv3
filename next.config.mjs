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

  // Expose deployment target to the browser bundle (preview vs production).
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
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
    qualities: [72, 75, 95], // Next 16 requires every <Image quality> value to be listed
    minimumCacheTTL: 60, // Cache images for 60 seconds
  },

  // Experimental features
  experimental: {
    // Enable server actions.
    // bodySizeLimit must cover the largest Server Action payload. Recruit
    // document uploads pass the File as an action arg (see
    // src/app/golf/actions/recruit-documents.ts, MAX_FILE_BYTES = 25 MB), so a
    // 2 MB cap would reject 2–25 MB files *before* the action runs — making the
    // advertised 25 MB limit a lie. Keep a small margin above that cap for the
    // multipart/action envelope.
    serverActions: {
      bodySizeLimit: '26mb',
    },
    // Optimize package imports
    optimizePackageImports: [
      'recharts',
      'date-fns',
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

  // ==========================================================================
  // GOLF LEGACY SHIM ROUTES — React #310 "Rendered more hooks than during the
  // previous render" stability fix (2026-07-22).
  // ----------------------------------------------------------------------------
  // Reproduced live on prod: client-navigating (next/link, router.push) INTO a
  // bare Server Component page whose entire body is a redirect()/
  // permanentRedirect() call crashes Next's internal app-router Router
  // component. Root cause lives inside Next's RSC-transition reconciliation for
  // that specific shape of route (render-nothing-but-redirect), not app code.
  //
  // Fix: intercept these paths at the FRAMEWORK ROUTING LAYER (this function),
  // which Next resolves before any page ever renders — for BOTH hard
  // navigations (URL bar, bookmark, external link) AND soft/client navigations
  // (next/link, router.push). App Router "soft" transitions still issue a real
  // HTTP request for the RSC payload, and `redirects()` is evaluated at the
  // router-utils layer ahead of the filesystem/page match — see
  // node_modules/next/dist/server/lib/router-utils/resolve-routes.js (no
  // RSC-specific branch skips it) and node_modules/next/dist/docs/01-app/
  // 03-api-reference/05-config/01-next-config-js/redirects.md ("Redirects are
  // checked before the filesystem"). The affected page never renders, so the
  // crash class cannot occur for any of these routes again.
  //
  // The page.tsx shims themselves are LEFT IN PLACE (not deleted) as
  // belt-and-braces for anything this config layer misses — several server
  // actions still call revalidatePath() against these exact paths (e.g.
  // development.ts, drills.ts, alerts.ts, insight-management.ts), and the
  // shims are what keeps those calls meaningful.
  //
  // QUERY-STRING PASSTHROUGH — VERIFIED behavior (read directly from
  // prepareDestination() in next/dist/shared/lib/router/utils/
  // prepare-destination.js): for every redirects() entry, Next merges
  // `{ ...originalRequestQuery, ...destinationOwnQuery }` — every query param
  // on the ORIGINAL request is automatically carried over to the destination
  // UNLESS the destination string itself already sets that same key, in which
  // case the destination's own value wins (this is unconditional — it does not
  // depend on `appendParamsToQuery`, which only governs unmatched *path*
  // segment params, not the query string). This is exactly the manual
  // forwarding the patterns/alerts/insights/development shims below used to
  // hand-roll (see their page.tsx doc comments for the pre-existing behavior
  // this reproduces) — the destinations here rely on the automatic merge
  // instead of reimplementing it. Also documented in next/dist/docs/01-app/
  // 03-api-reference/05-config/01-next-config-js/redirects.md: "When a
  // redirect is applied, any query values provided in the request will be
  // passed through to the redirect destination."
  // ==========================================================================
  async redirects() {
    return [
      {
        source: '/golf/dashboard/hub',
        destination: '/golf/dashboard',
        permanent: false, // shim used redirect(), not permanentRedirect()
      },
      {
        source: '/golf/dashboard/my-insights',
        destination: '/golf/dashboard/coachhelm',
        permanent: false, // shim used redirect()
      },
      {
        source: '/golf/dashboard/my-development',
        destination: '/golf/dashboard/coachhelm?view=development',
        permanent: true, // shim used permanentRedirect()
      },
      {
        source: '/golf/dashboard/my-standing',
        destination: '/golf/dashboard/coachhelm?view=standing',
        permanent: true,
      },
      {
        source: '/golf/dashboard/my-game-profile',
        destination: '/golf/dashboard/coachhelm?view=profile',
        permanent: true,
      },
      {
        // Original shim always force-set `view`/`filter`, overriding a stray
        // incoming ?view=/?filter= on collision — the automatic query merge
        // above reproduces that exactly, since the destination's own query
        // values always win over the original request's.
        source: '/golf/dashboard/patterns',
        destination: '/golf/dashboard/intelligence?view=signals&filter=patterns',
        permanent: true,
      },
      {
        // Preserves e.g. FocusAreaCard's ?id=<insightId> deep-link automatically.
        source: '/golf/dashboard/alerts',
        destination: '/golf/dashboard/intelligence?view=signals&filter=alerts',
        permanent: true,
      },
      {
        // Preserves ?id=<insightId> deep-link automatically.
        source: '/golf/dashboard/insights',
        destination: '/golf/dashboard/intelligence?view=signals&filter=insights',
        permanent: true,
      },
      {
        // ?player=<id> (FingerprintHero, TeamStatsBoard "Prescribe drill",
        // FairwayPlayerInsight, GenomeDetailView, FairwayEffectiveness) passes
        // through automatically, landing on ?view=players&player=<id>; with no
        // ?player= it lands on the bare ?view=players list — matching both
        // branches of the original shim's conditional.
        source: '/golf/dashboard/development',
        destination: '/golf/dashboard/intelligence?view=players',
        permanent: true,
      },
      {
        source: '/golf/dashboard/analytics/coachhelm',
        destination: '/golf/dashboard/intelligence?view=effectiveness',
        permanent: true,
      },
      {
        // Dynamic segment. No literal sibling route exists under
        // /golf/dashboard/players/ besides the [playerId] dynamic segment
        // itself (players/[playerId]/game and .../genome are two segments
        // deeper, so "no nested paths" path matching can't collide with them)
        // — unlike the genome shim below, no exclusion is needed here.
        source: '/golf/dashboard/players/:playerId',
        destination: '/golf/dashboard/players/:playerId/game',
        permanent: false, // shim used redirect()
      },
      {
        // MUST exclude the literal sibling route
        // /golf/dashboard/coachhelm/genome/compare (a real static page) — path
        // matching without a wildcard treats "compare" as just another valid
        // :playerId value, so without this negative-lookahead the rule would
        // ALSO fire for `.../genome/compare`, sending it to the nonsensical
        // `/golf/dashboard/players/compare/genome` and breaking Genome Compare.
        source: '/golf/dashboard/coachhelm/genome/:playerId((?!compare$)[^/]+)',
        destination: '/golf/dashboard/players/:playerId/genome',
        permanent: false, // shim used redirect()
      },
    ];
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
