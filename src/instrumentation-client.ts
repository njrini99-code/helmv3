import * as Sentry from '@sentry/nextjs';

const isDev = process.env.NODE_ENV === 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,

  // Never enable debug — it floods the console
  debug: false,

  // 20% in prod keeps trace cost sane while still surfacing slow paths.
  // 10% in dev to reduce overhead.
  tracesSampleRate: isDev ? 0.1 : 0.2,

  // Enable Sentry SDK structured logs (separate from error events).
  enableLogs: true,

  // Capture 100% of sessions with errors, 10% of all sessions (prod only)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: isDev ? 0 : 0.1,

  integrations: typeof window !== 'undefined' ? [
    // Skip replay in dev — it records DOM mutations and adds overhead
    ...(!isDev ? [Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    })] : []),
    Sentry.browserTracingIntegration(),
    // Forward client console.log/.warn/.error to Sentry → Explore → Logs
    // (separate stream from issues). Catches anything that goes through
    // console rather than Sentry.captureException.
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    // Capture console.error AS issues too — high-signal, picks up React
    // error boundary console.errors, hydration warnings, unhandled promise
    // rejections that get logged but not thrown.
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
    // Note: feedbackIntegration was moved out of @sentry/nextjs in v10.x —
    // it now lives in @sentry-internal/feedback. Calling
    // Sentry.feedbackIntegration({...}) at runtime evaluates to
    // undefined({...}) which crashes the entire client SDK init and
    // starves the project of events. Re-add by importing from
    // @sentry-internal/feedback directly if we want the widget back.
  ] : [],

  environment: process.env.NODE_ENV || 'development',

  // Scrub PII from error payloads + auto-tag every event with the sport
  // derived from URL path. Helm handles recruiting + roster data, so we drop
  // cookies, auth headers, and any URL query/fragment that may carry magic-
  // link tokens or OAuth codes — across BOTH event.request.url and the
  // duplicated event.contexts.location written by error-logging.ts.
  // Replay already masks DOM text.
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers['Cookie'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['authorization'];
      }
      if (event.request.url) {
        // Strip both query string (?...) and fragment (#...) — either may
        // carry magic-link tokens or OAuth codes.
        event.request.url = event.request.url.replace(/[?#].*$/, '');
      }
    }
    // error-logging.ts attaches a 'location' context with full href/search/
    // hash/referrer — strip those URL-bearing fields too. Keep pathname /
    // origin since they're useful for debugging and don't carry tokens.
    const locationCtx = event.contexts?.location as
      | { href?: string; search?: string; hash?: string; referrer?: string | null }
      | undefined;
    if (locationCtx) {
      delete locationCtx.href;
      delete locationCtx.search;
      delete locationCtx.hash;
      delete locationCtx.referrer;
    }
    // Auto-tag sport from current pathname — makes "errors in /golf vs
    // /baseball" a one-click filter in the Sentry UI.
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const sport = path.startsWith('/golf') ? 'golf'
        : path.startsWith('/baseball') ? 'baseball'
        : 'platform';
      event.tags = { ...event.tags, sport };
    }
    return event;
  },

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extensions
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // Network errors that aren't actionable (message varies by browser)
    'Network request failed',
    'Failed to fetch',
    'Load failed',
    /network\s*error/i,
    /NetworkError/i,
    'TypeError: cancelled',
    // User-initiated navigation
    'AbortError',
    // ResizeObserver — benign, fires when layout settles
    /ResizeObserver loop/,
    // Dev-only Next.js server-action hash mismatches.
    // These fire after any HMR rebuild that changes a server-action file:
    // the client bundle still references the old action ID and a polled
    // request 404s. Pure dev artifact — production action hashes are
    // baked at build time and never drift.
    'UnrecognizedActionError',
    /Server Action ".*" was not found on the server/,
    /Failed to find Server Action/,
    // Dev-only Turbopack HMR module-factory invalidation. Happens when a
    // dependency module gets replaced mid-flight; the next render has a
    // stale closure. Resolves on the following render — not actionable.
    /module factory is not available/,
    /It might have been deleted in an HMR update/,
    // 2026-05-17: CSP allowlist for va.vercel-scripts.com was added in
    // next.config.mjs (Plan 08 / audit Finding 9 + B-MED-1). Removing the
    // ignoreErrors mask so real CSP failures surface again.
  ],
});

// Required by @sentry/nextjs v8+ for App Router navigation tracing.
// Without this export, client-side route transitions aren't traced.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
