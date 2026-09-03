import * as Sentry from '@sentry/nextjs';
import '@supabase/supabase-js/tracing';
import { redactEventPii } from '@/lib/observability/redact-pii';
import { isAlreadyBridgeLogged } from '@/lib/bridge-logged-marker';
import { buildClientSentryOptions } from '@/lib/sentry-client-options';
import { classifyTraceSurface } from '@/lib/error-trace-classification';

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

// All the non-integration, non-beforeSend options (dsn, release, environment,
// sample rates, ignoreErrors, tracePropagationTargets) are computed by a pure
// function so they can be unit-tested without booting the SDK — see
// src/lib/sentry-client-options.ts / src/lib/__tests__/sentry-client-options.test.ts.
const clientOptions = buildClientSentryOptions(
  {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    // The browser cannot read `VERCEL` (Next only inlines NEXT_PUBLIC_*), and
    // next.config.mjs bakes NEXT_PUBLIC_VERCEL_ENV from VERCEL_ENV || NODE_ENV
    // at BUILD time — so a local `next build` ships the literal string
    // "production" in the bundle. `resolveClientEnvironment` (inside
    // buildClientSentryOptions) downgrades that using the hostname passed
    // below, which is the only signal that can still tell the truth at
    // runtime.
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE,
    NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE:
      process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE,
  },
  typeof window === 'undefined' ? undefined : window.location.hostname,
);

Sentry.init({
  ...clientOptions,

  integrations: typeof window !== 'undefined' ? [
    // Skip replay in dev — it records DOM mutations and adds overhead.
    // Privacy: mask every text node and every input value (never capture
    // request/response bodies or auth headers — `networkDetailAllowUrls` is
    // deliberately left unset, so Replay's network tab stays empty rather
    // than risking a captured header). `blockAllMedia: false` is a kept,
    // deliberate choice; `mask` additionally covers roster/recruiting
    // containers by a stable `data-sentry-mask` attribute as defense in
    // depth if `maskAllText` is ever narrowed later.
    ...(!isDev ? [Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: false,
      mask: ['[data-sentry-mask]'],
    })] : []),
    Sentry.browserTracingIntegration(),
    // Browser UI (JS Self-Profiling) — sampled at
    // clientOptions.profileSessionSampleRate / profileLifecycle: 'trace'
    // (see src/lib/sentry-client-options.ts for why `profilesSampleRate`
    // itself is never set). Requires the `Document-Policy: js-profiling`
    // response header, already present for every route in next.config.mjs
    // `headers()`. Chromium-only API — Safari/iOS sessions never profile
    // regardless of sample rate; that is a platform limit, not a bug here.
    Sentry.browserProfilingIntegration(),
    // Release health (crash-free session rate) — a session starts on load
    // and on every navigation (`lifecycle: 'route'`, the default).
    Sentry.browserSessionIntegration(),
    // Auto-captures failed fetch/XHR calls (default: 5xx only, see
    // node_modules/@sentry/browser/build/npm/types/integrations/
    // httpclient.d.ts) as breadcrumbs/events. No request/response body or
    // header capture exists on this integration's option surface, so
    // defaults cannot leak auth headers or bodies.
    Sentry.httpClientIntegration(),
    // Browser Reporting API — surfaces crash/deprecation/intervention
    // reports the browser itself generates (distinct from CSP violation
    // reports, which this app does not currently route through a
    // report-to/report-uri endpoint).
    Sentry.reportingObserverIntegration(),
    // Forward client console.log/.warn/.error to Sentry → Explore → Logs
    // (separate stream from issues). Catches anything that goes through
    // console rather than Sentry.captureException.
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    // Capture console.error AS issues too — high-signal, picks up React
    // error boundary console.errors, hydration warnings, unhandled promise
    // rejections that get logged but not thrown.
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
    // Drops (or tags) events whose stack is entirely third-party script.
    // `applicationKey: 'helm-web'` in next.config.mjs's withSentryConfig
    // marks first-party modules at build time — PRODUCTION BUILDS ONLY:
    // withSentryConfig itself is skipped in dev (next.config.mjs `isDev`
    // branch), so in dev no frame ever carries the marker and every frame
    // would read as third-party — this integration is gated the same way
    // replay is gated above, for the same reason.
    ...(!isDev ? [Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ['helm-web'],
      behaviour: 'drop-error-if-contains-third-party-frames',
    })] : []),
    // Programmatic feedback form only — `autoInject: false` means NO
    // floating widget is injected. Opened via the `ReportProblemButton`
    // component (src/components/fairway/feedback/ReportProblemButton.tsx)
    // calling `Sentry.getFeedback()?.createForm()`.
    //
    // A comment here previously said `Sentry.feedbackIntegration` "moved out
    // of @sentry/nextjs in v10.x" into `@sentry-internal/feedback` and would
    // crash the SDK if called. Re-verified at RUNTIME (not just against
    // .d.ts files, which is what missed it the first time) against the
    // installed @sentry/nextjs 10.71.0: `node -e "import('@sentry/nextjs')..."`
    // resolves `feedbackIntegration` as a real function all the way through
    // the actual export chain this file uses — @sentry/nextjs's
    // `index.client.js` (`export * from '@sentry/react'`) -> @sentry/react's
    // `index.js` (`export * from '@sentry/browser'`) -> @sentry/browser's
    // prod bundle, which exports `feedbackSyncIntegration as feedbackIntegration`
    // from `@sentry/feedback` directly. That crash was real for an older
    // @sentry/nextjs v10.x minor; it does not describe this one.
    Sentry.feedbackIntegration({
      autoInject: false,
      showBranding: false,
      colorScheme: 'system',
      isEmailRequired: false,
      isNameRequired: false,
    }),
  ] : [],

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
    //
    // This is a DIFFERENT, coarser axis than error-trace-classification.ts's
    // `classifyTraceSurface` (golf | baseball | shared | null) — it has no
    // admin/lifting/marketing buckets of its own — and Sentry alert rules /
    // saved searches key on these exact `sport` tag values. Do not replace
    // this with classifyTraceSurface; that would silently re-bucket events
    // under saved searches built against the values below.
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const sport = path.startsWith('/admin') ? 'admin'
        : path.startsWith('/lifting') ? 'lifting'
        : path.startsWith('/baseball') ? 'baseball'
        : path.startsWith('/golf') ? 'golf'
        : 'marketing';
      event.tags = { ...event.tags, sport };

      // `feature` is the finer-grained tag error-logging.ts's `logError()`
      // already attaches (via this SAME `classifyTraceSurface`, promoted to
      // a real Sentry tag by its `Sentry.withScope` "remaining keys become
      // tags" loop) for errors routed through the ~140 boundary components.
      // Events that reach Sentry WITHOUT going through `logError` — a raw
      // uncaught exception, a console.error not already bridge-logged and
      // picked up by captureConsoleIntegration above — never got a `feature`
      // tag at all. Reusing the existing classifier here closes that gap
      // instead of building a second one.
      const { feature } = classifyTraceSurface(path);
      if (feature) {
        event.tags.feature = feature;
      }
    }
    // Mask email addresses in message / extra / contexts / exception values.
    // The scrubbing above covers only the request envelope; the free-text fields
    // are where addresses actually appear.
    return redactEventPii(event);
  },
});

// Required by @sentry/nextjs v8+ for App Router navigation tracing.
// Without this export, client-side route transitions aren't traced.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
