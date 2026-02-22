import * as Sentry from '@sentry/nextjs';

const isDev = process.env.NODE_ENV === 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  debug: false,

  tracesSampleRate: isDev ? 0.1 : 1.0,

  environment: process.env.NODE_ENV || 'development',
});
