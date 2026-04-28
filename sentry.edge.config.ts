import * as Sentry from '@sentry/nextjs';

const isDev = process.env.NODE_ENV === 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Match server config — capture IP/headers on edge errors too.
  sendDefaultPii: true,

  debug: false,

  tracesSampleRate: isDev ? 0.1 : 1.0,

  environment: process.env.NODE_ENV || 'development',
});
