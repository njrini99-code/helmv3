import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  environment: process.env.NODE_ENV,

  // Ignore certain errors
  ignoreErrors: [
    // Common non-actionable errors
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
  ],

  beforeSend(event, hint) {
    // Don't send events if DSN is not configured
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null;
    }

    // Filter sensitive data from request headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }

    return event;
  },
});
