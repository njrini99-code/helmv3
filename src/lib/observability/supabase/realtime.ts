/**
 * Realtime channel observability — brief §12.
 *
 * "`.subscribe()` is not proof." A channel can sit in `CHANNEL_ERROR` or
 * `TIMED_OUT` forever with nothing in the UI showing it — the hooks this
 * wraps just render whatever data they last fetched and never notice the
 * live feed died. `observeRealtimeChannel` is a drop-in replacement for the
 * bare `.subscribe()` call at the end of a channel builder chain: it
 * classifies every status transition (`SUBSCRIBED`, `CHANNEL_ERROR`,
 * `CLOSED`, `TIMED_OUT` — the exact four values `REALTIME_SUBSCRIBE_STATES`
 * in `@supabase/realtime-js` names, confirmed by reading
 * `node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.d.ts`
 * rather than assumed), tracks connect latency and reconnect count, and
 * reports through the CLIENT observability path — never the server one.
 *
 * CLIENT-SAFE, DELIBERATELY. No `server-only` import, no admin client, no
 * `@/lib/supabase/server`. Every one of this file's imports
 * (`client-breadcrumbs.ts`, `structured-log.ts`, `metrics.ts`,
 * `@sentry/nextjs`) was checked for a `server-only` marker in their own
 * import graphs before being used here — none carries one. This file is
 * imported directly into `'use client'` hooks; a single accidental
 * server-only import anywhere in its chain would break every one of them at
 * build time.
 *
 * WHY BOTH A METRIC AND A Sentry.captureMessage
 * -----------------------------------------------
 * `metrics.ts` turned out to be browser-safe (unlike the brief's own
 * fallback branch, which only applies "if metrics.ts is server-only") — so
 * this file uses BOTH signals, not one instead of the other, because they
 * answer different questions: `recordRealtimeChannelFailure` (a `helm.*`
 * count) gives Bridge a RATE nobody has to notice to see; `Sentry.captureMessage`
 * gives a human an actual issue to look at when a channel's transport is
 * failing AND DID NOT RECOVER (see REALTIME_RECOVERY_GRACE_MS), gated to
 * ONCE PER `channelClass` PER SESSION so a reconnect loop
 * cannot flood Sentry with duplicate issues (a metric increment has no such
 * cost; a captured message does). The tags on that message
 * (`helm.feature`, `supabase.service`, `supabase.operation`, `realtime.state`)
 * are Sentry TAGS on a captured event — a completely different surface from
 * `ALLOWED_METRIC_DIMENSIONS` (`metrics.ts`'s closed allow-list governs
 * metric attributes only) — so they are not constrained by that list.
 *
 * NEVER A CHANNEL ID OR TOPIC AS A DIMENSION/TAG. `channelClass` is a safe,
 * caller-supplied label (`'golf_task_assignments'`) — the same "safe class,
 * never the identity" discipline `bucketClass` uses in `observe-storage.ts`.
 */
import * as Sentry from '@sentry/nextjs';
import { recordHelmBreadcrumb } from '../client-breadcrumbs';
import { helmLog } from '../structured-log';
import { recordRealtimeChannelFailure } from '../metrics';

export const REALTIME_SUBSCRIBE_STATUSES = ['SUBSCRIBED', 'TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR'] as const;

export type RealtimeSubscriptionType = 'postgres_changes' | 'presence' | 'broadcast' | 'system' | 'mixed';

/** The minimal shape this file needs from a `RealtimeChannel` — duck-typed
 *  rather than importing `@supabase/supabase-js`'s class so a test can pass
 *  a plain fake without constructing a real channel. */
export interface RealtimeChannelLike {
  subscribe(callback?: (status: string, err?: Error) => void, timeout?: number): unknown;
}

export interface ObserveRealtimeChannelOptions {
  feature: string;
  /** Safe label ONLY — never a channel topic, filter value, or id. */
  channelClass: string;
  subscriptionType: RealtimeSubscriptionType;
  /** The call site's OWN status callback (existing product logic —
   *  `use-calendar-range-events.ts`'s "refetch on reconnect", `useAdminPresence.ts`'s
   *  `setIsConnected`, etc.). Called with the exact same `(status, err)` this
   *  wrapper receives, so existing behavior is fully preserved. A throw from
   *  this callback is swallowed (never breaks the channel's own subscribe
   *  plumbing) — a deliberate, small behavior change from a bare
   *  `.subscribe(cb)`, documented here rather than left implicit. */
  onStatus?: (status: string, err?: Error) => void;
}

const CAPTURED_ONCE_PER_SESSION = new Set<string>();

/**
 * How long a failed channel gets to come back before Sentry hears about it.
 *
 * A dropped socket that supabase-js re-joins on its own is ordinary on
 * mobile (backgrounding, a network handover, Low Power Mode), and the call
 * sites refetch on the reconnect, so nothing is lost. Capturing on the drop
 * itself filed JAVASCRIPT-NEXTJS-RJ at error level 143 times (2026-09-03 to
 * 09-22) for exactly that recovered case. The metric, breadcrumb and warn log
 * still record every drop immediately — Bridge keeps the rate — but only a
 * channel still down after this window becomes a Sentry issue.
 */
export const REALTIME_RECOVERY_GRACE_MS = 60_000;

/**
 * A backgrounded tab (iOS suspends timers) fires an overdue timer the moment
 * it wakes — before the socket has had any chance to re-join. A timer this
 * much later than scheduled means the page was asleep, so the window starts
 * again rather than reporting a failure the user never saw.
 */
const SUSPENDED_TIMER_SLACK_MS = 5_000;
const MAX_GRACE_RESTARTS = 3;

/** Test-only: forget which channelClasses already captured a Sentry message
 *  this session, so a test can assert the dedupe behavior from a clean state. */
export function __resetRealtimeCaptureDedupeForTests(): void {
  CAPTURED_ONCE_PER_SESSION.clear();
}

function classifyTransportSeverity(status: string): 'error' | 'warning' | null {
  if (status === 'CHANNEL_ERROR') return 'error';
  if (status === 'TIMED_OUT') return 'warning';
  return null; // SUBSCRIBED and CLOSED are not, on their own, transport failures.
}

/**
 * Wraps `channel.subscribe(...)` and returns the SAME channel `.subscribe()`
 * itself would have returned — existing cleanup (`supabase.removeChannel(channel)`)
 * keeps working unchanged. Never throws: if `channel.subscribe` itself is
 * missing or throws synchronously, the channel is returned unobserved rather
 * than breaking the caller's subscription entirely.
 */
export function observeRealtimeChannel<C extends RealtimeChannelLike>(
  channel: C,
  options: ObserveRealtimeChannelOptions,
): C {
  const subscribeStartedAt = Date.now();
  let subscribedOnce = false;
  let reconnectCount = 0;
  let pendingCapture: ReturnType<typeof setTimeout> | null = null;

  const cancelPendingCapture = () => {
    if (pendingCapture !== null) {
      clearTimeout(pendingCapture);
      pendingCapture = null;
    }
  };

  const captureIfStillDown = (status: string, severity: 'error' | 'warning', restarts = 0) => {
    const scheduledAt = Date.now();
    pendingCapture = setTimeout(() => {
      pendingCapture = null;
      try {
        const lateBy = Date.now() - scheduledAt - REALTIME_RECOVERY_GRACE_MS;
        if (lateBy > SUSPENDED_TIMER_SLACK_MS && restarts < MAX_GRACE_RESTARTS) {
          captureIfStillDown(status, severity, restarts + 1);
          return;
        }
        if (CAPTURED_ONCE_PER_SESSION.has(options.channelClass)) return;
        CAPTURED_ONCE_PER_SESSION.add(options.channelClass);
        Sentry.captureMessage(`Realtime channel transport failure: ${status}`, {
          level: severity,
          tags: {
            'helm.feature': options.feature,
            'supabase.service': 'realtime',
            'supabase.operation': 'subscribe',
            'realtime.state': status,
          },
          extra: { recoveryGraceMs: REALTIME_RECOVERY_GRACE_MS },
        });
      } catch {
        // Same fail-open contract as the subscribe callback below.
      }
    }, REALTIME_RECOVERY_GRACE_MS);
  };

  try {
    channel.subscribe((status: string, err?: Error) => {
      try {
        options.onStatus?.(status, err);
      } catch {
        // See ObserveRealtimeChannelOptions.onStatus doc — deliberate.
      }

      try {
        if (status === 'SUBSCRIBED') {
          // Recovered inside the grace window: the drop stays a metric and
          // a breadcrumb, never a Sentry issue.
          cancelPendingCapture();
          if (!subscribedOnce) {
            subscribedOnce = true;
            const latencyMs = Date.now() - subscribeStartedAt;
            recordHelmBreadcrumb('realtime', 'realtime.subscribed', {
              feature: options.feature,
              result: 'SUBSCRIBED',
              count: latencyMs,
            });
          } else {
            reconnectCount += 1;
            recordHelmBreadcrumb('realtime', 'realtime.reconnected', {
              feature: options.feature,
              result: 'SUBSCRIBED',
              count: reconnectCount,
            });
          }
          return;
        }

        const severity = classifyTransportSeverity(status);
        if (severity === null) {
          // CLOSED — ambiguous by design (an intentional unmount/teardown
          // triggers the same status a server-forced close does; this file
          // has no reliable way to tell them apart without every one of the
          // 11 call sites threading an "I'm unsubscribing on purpose" flag
          // through cleanup, which is out of scope for this pass — see
          // brief §12 doc note). Breadcrumb only, no metric, no capture.
          recordHelmBreadcrumb('realtime', 'realtime.closed', { feature: options.feature, result: 'CLOSED' });
          // A channel closed after a failure (usually the caller tearing it
          // down) has nobody left to report to.
          cancelPendingCapture();
          return;
        }

        recordHelmBreadcrumb('realtime', 'realtime.transport_failure', {
          feature: options.feature,
          result: status,
        });
        recordRealtimeChannelFailure({ feature: options.feature, result: status });
        helmLog.warn('supabase.realtime.transport_failure', {
      subscription_type: options.subscriptionType,
          feature: options.feature,
          result: status,
          service: 'realtime',
          operation: 'subscribe',
        });

        if (pendingCapture === null && !CAPTURED_ONCE_PER_SESSION.has(options.channelClass)) {
          captureIfStillDown(status, severity);
        }
      } catch {
        // This file's own observation logic must never break the caller's
        // subscription — same fail-open contract every file in this
        // directory holds to.
      }
    });
  } catch {
    // Never let observability prevent the channel from being returned.
  }

  return channel;
}

// ---------------------------------------------------------------------------
// Silent-propagation detection — brief §12's second failure mode
// ---------------------------------------------------------------------------

/**
 * A channel can be cleanly `SUBSCRIBED` (no transport failure at all) while
 * the product signal it exists to deliver never arrives — a Realtime
 * publication misconfigured after a migration, a filter that silently
 * matches nothing, RLS quietly excluding every row. `observeRealtimeChannel`
 * above cannot detect this on its own: from the transport's point of view,
 * everything is fine. Brief §12: "expose `lastMessageAt` and an optional
 * `expectedSignalWithinMs` so a caller can flag 'SUBSCRIBED but silent'" —
 * this is that exposure, as a small STANDALONE monitor a feature opts into
 * alongside `observeRealtimeChannel` (same `channelClass`), because deciding
 * WHAT counts as "the expected signal" and HOW LONG is too long is a
 * per-feature product judgment this file cannot make generically (brief
 * §12: "the product outcome/invariant layer detects the second [failure
 * mode]"). NOT wired into any of the 11 hooks in this pass — see the B7 doc
 * for the intended call-site list and why none of today's hooks have a
 * natural "no signal arrived" invariant to hang this off yet.
 */
export interface RealtimeActivityMonitor {
  /** Call from the channel's own `.on(...)` payload callback whenever a
   *  real product signal arrives. */
  recordMessage(): void;
  /** Epoch ms of the last `recordMessage()` call, or `null` if none yet. */
  lastMessageAt(): number | null;
  /** True only when `expectedSignalWithinMs` was given, that much time has
   *  elapsed since the monitor was created, and no message has ever arrived. */
  isSilentlyStalled(): boolean;
}

export function createRealtimeActivityMonitor(options: {
  expectedSignalWithinMs?: number;
}): RealtimeActivityMonitor {
  const createdAt = Date.now();
  let lastMessageAtMs: number | null = null;

  return {
    recordMessage(): void {
      try {
        lastMessageAtMs = Date.now();
      } catch {
        // Never let activity tracking throw into a payload callback.
      }
    },
    lastMessageAt(): number | null {
      return lastMessageAtMs;
    },
    isSilentlyStalled(): boolean {
      try {
        if (typeof options.expectedSignalWithinMs !== 'number') return false;
        if (lastMessageAtMs !== null) return false;
        return Date.now() - createdAt >= options.expectedSignalWithinMs;
      } catch {
        return false;
      }
    },
  };
}
