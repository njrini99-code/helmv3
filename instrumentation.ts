import * as Sentry from '@sentry/nextjs';

export async function register() {
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
        ...(profilingIntegration ? [profilingIntegration] : []),
      ],

      // Only enable debug in development
      debug: process.env.NODE_ENV === 'development',

      // Tracing must be enabled for profiling to work
      tracesSampleRate: 1.0,

      // Set sampling rate for profiling
      profileSessionSampleRate: 1.0,

      // Trace lifecycle automatically enables profiling during active traces
      profileLifecycle: 'trace',

      environment: process.env.NODE_ENV || 'development',

      // Filter out noisy errors
      ignoreErrors: [
        'NEXT_NOT_FOUND',
        'NEXT_REDIRECT',
      ],
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry initialization
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      debug: process.env.NODE_ENV === 'development',
      tracesSampleRate: 1.0,
      environment: process.env.NODE_ENV || 'development',
    });
  }
}

// Capture errors from nested React Server Components
export const onRequestError = Sentry.captureRequestError;
