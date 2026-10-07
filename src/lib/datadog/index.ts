import { describeError } from '@/lib/utils/describe-error';
// Datadog RUM (Real User Monitoring) and Browser Logs initialization
// This runs on the client side to track user sessions, errors, and performance
// SDKs are lazy-loaded to avoid blocking initial page render (~150KB savings)

let isInitialized = false;

export function initDatadog() {
  if (isInitialized || typeof window === 'undefined') {
    return;
  }

  const applicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID;
  const clientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN;

  // Bail early before loading any SDK code if credentials are missing
  if (!applicationId || !clientToken || applicationId === 'YOUR_APPLICATION_ID') {
    return;
  }

  // Skip in development — no need for RUM locally
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  isInitialized = true;

  // This module only ever runs in the browser (see the typeof window guard
  // above), so these MUST be NEXT_PUBLIC_-prefixed — un-prefixed vars are
  // stripped at build time and would always read as undefined here, silently
  // falling back to the defaults in every deployed env. Reuse the
  // NEXT_PUBLIC_VERCEL_ENV Next.js already inlines (see next.config.mjs)
  // for env detection instead of requiring a separate var.
  const site = process.env.NEXT_PUBLIC_DD_SITE || 'datadoghq.com';
  const service = process.env.NEXT_PUBLIC_DD_SERVICE || 'helm-sports-labs';
  const env = process.env.NEXT_PUBLIC_DD_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || 'development';

  // Lazy-load SDKs after initial page render to avoid blocking
  requestIdleCallback(async () => {
    try {
      const [{ datadogRum }, { datadogLogs }] = await Promise.all([
        import('@datadog/browser-rum'),
        import('@datadog/browser-logs'),
      ]);

      datadogRum.init({
        applicationId,
        clientToken,
        site,
        service,
        env,
        version: '1.0.0',
        sessionSampleRate: 100,
        sessionReplaySampleRate: 20,
        trackUserInteractions: true,
        trackingConsent: 'granted',
        enableExperimentalFeatures: [],
        trackResources: true,
        trackLongTasks: true,
        defaultPrivacyLevel: 'mask-user-input',
        // Browser SDK v7 flipped these two defaults. Pin the v6 values so the
        // upgrade does not change what we collect or send:
        // - v7 defaults propagateTraceBaggage to true, adding a `baggage`
        //   header to traced requests (Supabase is cross-origin, so that is a
        //   new CORS-preflighted header). v6 never sent it.
        // - v7 defaults enablePrivacyForActionName to true, masking click
        //   action names per defaultPrivacyLevel. v6 collected them as-is.
        propagateTraceBaggage: false,
        enablePrivacyForActionName: false,
        allowedTracingUrls: [
          { match: /https:\/\/.*\.supabase\.co/, propagatorTypes: ['tracecontext'] },
          { match: window.location.origin, propagatorTypes: ['tracecontext'] },
        ],
      });

      datadogLogs.init({
        clientToken,
        site,
        service,
        env,
        forwardErrorsToLogs: true,
        // Logs v7 decoupled forwardErrorsToLogs from console.error capture;
        // v6 forwarded console.error as part of forwardErrorsToLogs.
        forwardConsoleLogs: ['error'],
        sessionSampleRate: 100,
      });
    } catch (error) {
      console.error('[Datadog] Failed to initialize:', describeError(error));
    }
  });
}
