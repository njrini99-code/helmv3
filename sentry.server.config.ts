import * as Sentry from '@sentry/nextjs';

let profilingIntegration: ReturnType<typeof import('@sentry/profiling-node').nodeProfilingIntegration> | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nodeProfilingIntegration } = require('@sentry/profiling-node');
  profilingIntegration = nodeProfilingIntegration();
} catch {
  // Profiling native module not available - skip
}

const isDev = process.env.NODE_ENV === 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [
    ...(!isDev && profilingIntegration ? [profilingIntegration] : []),
  ],

  debug: false,

  tracesSampleRate: isDev ? 0.1 : 1.0,

  // Profiling is expensive — disable in dev, sample in prod
  profileSessionSampleRate: isDev ? 0 : 0.3,

  profileLifecycle: 'trace',

  environment: process.env.NODE_ENV || 'development',

  // Filter out noisy errors
  ignoreErrors: [
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
  ],
});
