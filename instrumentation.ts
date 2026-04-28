import * as Sentry from '@sentry/nextjs';

export async function register() {
  const isDev = process.env.NODE_ENV === 'development';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Sentry initialization
    let profilingIntegration: ReturnType<typeof import('@sentry/profiling-node').nodeProfilingIntegration> | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');
      profilingIntegration = nodeProfilingIntegration();
    } catch {
      // Profiling native module not available - skip
    }

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

      integrations: [
        // Only load profiling in production — it adds significant CPU overhead
        ...(!isDev && profilingIntegration ? [profilingIntegration] : []),
      ],

      // Never enable debug — it floods the console and slows down the server
      debug: false,

      // 100% in prod for full visibility, 10% in dev to reduce overhead
      tracesSampleRate: isDev ? 0.1 : 1.0,

      // Profiling is expensive — disable in dev, sample in prod
      profileSessionSampleRate: isDev ? 0 : 0.3,

      // Trace lifecycle automatically enables profiling during active traces
      profileLifecycle: 'trace',

      environment: process.env.NODE_ENV || 'development',

      // Filter out noisy errors
      ignoreErrors: [
        'NEXT_NOT_FOUND',
        'NEXT_REDIRECT',
        // Supabase emits these for stale refresh-token cookies (logged-out
        // users, long-idle tabs). Middleware already swallows them — don't
        // page the team for normal session expiry.
        'Invalid Refresh Token: Refresh Token Not Found',
        'Refresh Token Not Found',
        'AuthApiError',
      ],
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry initialization
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      debug: false,
      tracesSampleRate: isDev ? 0.1 : 1.0,
      environment: process.env.NODE_ENV || 'development',
      ignoreErrors: [
        'NEXT_NOT_FOUND',
        'NEXT_REDIRECT',
        'Invalid Refresh Token: Refresh Token Not Found',
        'Refresh Token Not Found',
        'AuthApiError',
      ],
    });
  }
}

// Capture errors from nested React Server Components
export const onRequestError = Sentry.captureRequestError;
