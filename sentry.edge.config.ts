import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable debug in development
  debug: process.env.NODE_ENV === 'development',

  // Sample 100% of transactions for performance monitoring
  tracesSampleRate: 1.0,

  environment: process.env.NODE_ENV || 'development',
});
