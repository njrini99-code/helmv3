import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: "https://17657b44b4ba82cae5ccd7d08669fd48@o4510780033794048.ingest.us.sentry.io/4510825486548992",

  // Enable debug mode to see what's happening
  debug: true,

  tracesSampleRate: 1.0,

  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,

  integrations: typeof window !== 'undefined' ? [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ] : [],

  environment: process.env.NODE_ENV || 'development',
});
