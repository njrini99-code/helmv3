import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://17657b44b4ba82cae5ccd7d08669fd48@o4510780033794048.ingest.us.sentry.io/4510825486548992",

  integrations: [Sentry.browserTracingIntegration()],

  // Trace propagation targets - adjust for your API endpoints
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/.*\.vercel\.app\/api/,
    /^https:\/\/.*\.helmsportslabs\.com\/api/,
  ],

  // Performance monitoring sample rate
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay for errors
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

  environment: process.env.NODE_ENV,

  // Filter out noise
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    /chrome-extension:/,
    /moz-extension:/,
  ],
});
