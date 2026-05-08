import * as Sentry from '@sentry/nextjs';

const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;

const sharedIgnoreErrors = [
  'NEXT_NOT_FOUND',
  'NEXT_REDIRECT',
  // Supabase emits these for stale refresh-token cookies (logged-out users,
  // long-idle tabs, just-rotated tokens). Middleware already swallows them —
  // don't page the team for normal session expiry.
  'Invalid Refresh Token: Refresh Token Not Found',
  'Refresh Token Not Found',
  'AuthApiError',
];

const scrubPii: Sentry.NodeOptions['beforeSend'] = (event) => {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers['Cookie'];
      delete event.request.headers['cookie'];
      delete event.request.headers['Authorization'];
      delete event.request.headers['authorization'];
    }
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
  }
  return event;
};

export async function register() {
  const isDev = process.env.NODE_ENV === 'development';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    let profilingIntegration: ReturnType<typeof import('@sentry/profiling-node').nodeProfilingIntegration> | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');
      profilingIntegration = nodeProfilingIntegration();
    } catch {
      // Profiling native module not available — skip
    }

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      release,
      environment: process.env.NODE_ENV || 'development',
      debug: false,

      integrations: [
        ...(!isDev && profilingIntegration ? [profilingIntegration] : []),
        // Auto-instruments Vercel AI SDK calls (generateText/streamText/
        // generateObject). Captures model, latency, errors, and — when the
        // call sets experimental_telemetry — token usage and prompt/output
        // bodies. CoachHelm and round-recap go through the AI SDK.
        Sentry.vercelAIIntegration({
          recordInputs: true,
          recordOutputs: true,
        }),
      ],

      // 20% in prod controls span volume on hot endpoints; 10% in dev for speed.
      tracesSampleRate: isDev ? 0.1 : 0.2,
      profileSessionSampleRate: isDev ? 0 : 0.3,
      profileLifecycle: 'trace',

      beforeSend: scrubPii,
      ignoreErrors: sharedIgnoreErrors,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      release,
      environment: process.env.NODE_ENV || 'development',
      debug: false,
      tracesSampleRate: isDev ? 0.1 : 0.2,
      beforeSend: scrubPii,
      ignoreErrors: sharedIgnoreErrors,
    });
  }
}

// Capture errors from nested React Server Components
export const onRequestError = Sentry.captureRequestError;
