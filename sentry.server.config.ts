import * as Sentry from '@sentry/nextjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [
    nodeProfilingIntegration(),
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
