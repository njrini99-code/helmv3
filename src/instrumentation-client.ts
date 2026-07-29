import * as Sentry from '@sentry/nextjs';
import { isAlreadyBridgeLogged } from '@/lib/bridge-logged-marker';

/**
 * True when this event came from `captureConsoleIntegration` rather than an
 * explicit capture call. Sentry tags console captures both ways depending on
 * version/path — `event.logger === 'console'` and/or a
 * `mechanism.type === 'console'` on the exception — so check both rather
 * than betting on one.
 */
function isConsoleOriginEvent(event: Sentry.ErrorEvent): boolean {
  if (event.logger === 'console') return true;
  return Boolean(
    event.exception?.values?.some((value) => value.mechanism?.type === 'console'),
  );
}

const isDev = process.env.NODE_ENV === 'development';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();
const environment = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

Sentry.init({
  dsn,

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

  environment,

  // Scrub PII from error payloads + auto-tag every event with the sport
  // derived from URL path. Helm handles recruiting + roster data, so we drop
  // cookies, auth headers, and any URL query/fragment that may carry magic-
  // link tokens or OAuth codes — across BOTH event.request.url and the
  // duplicated event.contexts.location written by error-logging.ts.
  // Replay already masks DOM text.
  beforeSend(event, hint) {
    // Drop the console-origin ECHO of an error the Bridge pipeline already
    // captured. React's default onCaughtError console.error's every error a
    // boundary catches, and captureConsoleIntegration({levels:['error']})
    // above turns that into a SECOND Sentry issue for the same crash — one
    // from error-logging.ts's own captureException, one from the console.
    //
    // Scoped strictly to console-origin events on purpose: the deliberate
    // captureException is never console-origin, so it survives regardless of
    // whether React logs before or after the boundary's handler runs. That
    // ordering is not something this file should have to depend on.
    //
    // Only ever suppresses a strict duplicate — an error nothing bridge-logged
    // still reaches Sentry through the console path exactly as before.
    if (isConsoleOriginEvent(event) && isAlreadyBridgeLogged(hint?.originalException)) {
      return null;
    }

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
    // /baseball" a one-click filter in the Sentry UI. /admin and /lifting
    // get their own buckets (rather than falling into 'marketing') since
    // both carry meaningfully different error populations than the public
    // marketing/landing surfaces.
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const sport = path.startsWith('/admin') ? 'admin'
        : path.startsWith('/lifting') ? 'lifting'
        : path.startsWith('/baseball') ? 'baseball'
        : path.startsWith('/golf') ? 'golf'
        : 'marketing';
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
    // CefSharp's JavaScript bridge emits this when an embedded-browser host
    // tears down a bound object before a queued callback runs. It originates
    // outside our application bundle and is not actionable in Helm.
    /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
    // Stale deployment assets are already handled by the global one-shot
    // ChunkLoadError recovery mounted in app/layout.tsx. Keep the recovered
    // exception from becoming an issue while preserving all other errors.
    /ChunkLoadError/i,
    /Loading (?:CSS )?chunk \d+ failed/i,
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
