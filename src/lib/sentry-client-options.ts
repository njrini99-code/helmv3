/**
 * The non-integration, non-`beforeSend` half of the client `Sentry.init()`
 * options object, built as a pure function of env + hostname.
 *
 * WHY THIS EXISTS. `instrumentation-client.ts` calls `Sentry.init()` at
 * module load time — importing it in a test boots the real SDK. Extracting
 * everything that is genuinely just DATA (sample rates, ignoreErrors,
 * tracePropagationTargets, dsn/release/environment) into a pure function
 * lets a test assert on the computed object without ever touching the SDK.
 * Mirrors the same move `sentry-environment.ts` already made for `environment`
 * alone — this covers the rest of the static options.
 *
 * `integrations` and `beforeSend` stay in `instrumentation-client.ts`: they
 * either construct real Integration instances (needs the SDK) or close over
 * request-scrubbing logic that isn't config data. Spread this function's
 * result into `Sentry.init({ ...buildClientSentryOptions(...), integrations,
 * beforeSend })`.
 */

import { resolveClientEnvironment, type EnvironmentInput } from '@/lib/sentry-environment';

export interface ClientSentryOptionsEnv extends EnvironmentInput {
  NEXT_PUBLIC_SENTRY_DSN?: string | undefined;
  SENTRY_DSN?: string | undefined;
  NEXT_PUBLIC_SENTRY_RELEASE?: string | undefined;
  VERCEL_GIT_COMMIT_SHA?: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  /**
   * UI (browser) profiling session sample rate override, 0..1. Unset/blank/
   * non-numeric falls back to the per-environment default (0.05 production,
   * 0 development). Out-of-range values clamp into [0, 1].
   */
  NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE?: string | undefined;
  /**
   * Session Replay `replaysSessionSampleRate` override, 0..1. Same parsing
   * rule as the profiling rate above. `replaysOnErrorSampleRate` is NOT
   * configurable via env — it stays pinned at 1.0 (see below).
   */
  NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE?: string | undefined;
}

export interface ClientSentryOptions {
  dsn: string | undefined;
  release: string | undefined;
  environment: string;
  debug: false;
  propagateTraceparent: true;
  tracePropagationTargets: (string | RegExp)[];
  /**
   * UNCHANGED from the pre-existing behavior — do not edit without updating
   * `src/lib/__tests__/sentry-client-options.test.ts`'s pinning assertion.
   * 20% production / 10% development.
   */
  tracesSampleRate: number;
  enableLogs: true;
  /** UNCHANGED — 100% of sessions with an error are always captured. */
  replaysOnErrorSampleRate: number;
  replaysSessionSampleRate: number;
  /**
   * Browser UI profiling. `profilesSampleRate` is DEPRECATED in the
   * installed SDK (@sentry/nextjs 10.71.0 / @sentry/browser's
   * `BrowserClientProfilingOptions`,
   * node_modules/@sentry/core/build/types/types/browseroptions.d.ts) AND,
   * confirmed by reading the shipped `UIProfiler`/`shouldProfileSession`
   * implementation (node_modules/@sentry/browser/build/npm/cjs/prod/profiling/
   * UIProfiler.js, utils.js), is never read at runtime — only
   * `profileSessionSampleRate` + `profileLifecycle` gate whether the profiler
   * ever starts. Setting the deprecated field alone would silently ship a
   * profiling "feature" that never profiles anything, so this module never
   * sets it.
   */
  profileSessionSampleRate: number;
  /**
   * 'trace': the profiler starts automatically whenever a sampled root span
   * is active (tied to `tracesSampleRate`) and stops when it ends — no manual
   * `startProfiler()`/`stopProfiler()` wiring needed. 'manual' (the SDK
   * default) would profile nothing without that wiring, which this build
   * does not add.
   */
  profileLifecycle: 'trace';
  ignoreErrors: (string | RegExp)[];
}

/** Blank/undefined/non-finite -> fallback. Otherwise clamped into [0, 1]. */
export function parseSampleRateEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

/**
 * Filtered out because they are not actionable in Helm (browser extensions,
 * benign layout noise, self-recovering deployment/HMR artifacts). Each
 * pattern is documented — what it is, where the equivalent health signal
 * lives today, and how a real outage still surfaces despite the filter — in
 * `docs/observability/SENTRY_IGNORE_ERRORS.md`. Keep the two in sync.
 */
export const CLIENT_IGNORE_ERRORS: (string | RegExp)[] = [
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
  // @supabase/auth-js's own "commit guard" (GoTrueClient `_callRefreshToken`):
  // a token refresh completed, but storage changed under it mid-flight — a
  // concurrent `signOut`, or another tab that rotated the refresh token first.
  // auth-js DISCARDS the rotated tokens deliberately, RETURNS this as an
  // `error` VALUE (it is never thrown), exports `isAuthRefreshDiscardedError`
  // for callers to branch on, and handles it internally in `__loadSession`.
  // Nothing in Helm has to react to it.
  //
  // It reaches Sentry anyway because @sentry/core's Supabase auto-
  // instrumentation (`instrumentAuthOperation`, integrations/supabase.js)
  // captures ANY returned `{ error }` from an instrumented auth call as
  // `mechanism: { handled: false, type: 'auto.db.supabase.auth' }` — so a
  // value auth-js deliberately handles arrives as an UNHANDLED error on
  // /golf/dashboard. First seen 2026-09-04 (JAVASCRIPT-NEXTJS-RR): 1 event,
  // 0 users impacted, over 7 days.
  //
  // Matches as a substring against both `value` and `${type}: ${value}` —
  // see @sentry/core's `getPossibleEventMessages` (utils/eventUtils.js),
  // which pushes both — so the bare type name hits the rendered title
  // "AuthRefreshDiscardedError: Refresh result discarded: …".
  //
  // KNOWN GAP this filter does NOT fix, recorded here so the next person does
  // not re-derive it: in the another-tab-rotated-first case, `__loadSession`'s
  // `stillStored.refresh_token === currentSession.refresh_token` guard fails
  // (the other tab already wrote a NEW refresh token), so `getUser()` returns
  // `user: null` for someone who is still signed in. If spurious multi-tab
  // sign-outs on golf are ever reported, start there — not at n=1.
  'AuthRefreshDiscardedError',
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
];

export function buildClientSentryOptions(
  env: ClientSentryOptionsEnv,
  hostname?: string,
): ClientSentryOptions {
  const isDev = env.NODE_ENV === 'development';
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim() || env.SENTRY_DSN?.trim();
  const release = env.NEXT_PUBLIC_SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA;
  const environment = resolveClientEnvironment(env, hostname);

  const supabaseTraceTarget = (() => {
    try {
      return new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
    } catch {
      return null;
    }
  })();

  return {
    dsn,
    release,
    environment,
    debug: false,
    propagateTraceparent: true,
    tracePropagationTargets: [
      'localhost',
      /^\//,
      ...(supabaseTraceTarget ? [supabaseTraceTarget] : []),
    ],
    tracesSampleRate: isDev ? 0.1 : 0.2,
    enableLogs: true,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: parseSampleRateEnv(
      env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE,
      isDev ? 0 : 0.1,
    ),
    profileSessionSampleRate: parseSampleRateEnv(
      env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE,
      isDev ? 0 : 0.05,
    ),
    profileLifecycle: 'trace',
    ignoreErrors: CLIENT_IGNORE_ERRORS,
  };
}
