import * as Sentry from '@sentry/nextjs';

const isDev = process.env.NODE_ENV === 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Never enable debug — it floods the console
  debug: false,

  // 100% in prod, 10% in dev to reduce overhead
  tracesSampleRate: isDev ? 0.1 : 1.0,

  // Capture 100% of sessions with errors, 10% of all sessions (prod only)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: isDev ? 0 : 0.1,

  integrations: typeof window !== 'undefined' ? [
    // Skip replay in dev — it records DOM mutations and adds overhead
    ...(!isDev ? [Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    })] : []),
    Sentry.browserTracingIntegration(),
  ] : [],

  environment: process.env.NODE_ENV || 'development',

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extensions
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // Network errors that aren't actionable
    'Network request failed',
    'Failed to fetch',
    'Load failed',
    // User-initiated navigation
    'AbortError',
  ],
});
