/**
 * Realtime channel-status observer — brief §12.
 *
 * "`.subscribe()` is not proof." Measured against this repo 2026-09-03: ten
 * files call `.channel(...)...subscribe()`, and EVERY ONE calls `.subscribe()`
 * with no status callback at all — a channel that never connects, or drops
 * silently, looks identical to a healthy one today. This file is the
 * reusable primitive brief §12 asks for; it is wired into ONE call site in
 * this PR (`src/hooks/golf/use-qualifier-realtime.ts`, the certification
 * vehicle for brief §14) as proof it works end to end. The other nine are
 * NOT VERIFIED in this PR — see the measured-truth doc's coverage note, same
 * honesty precedent Phase 1 set for `checkZeroRowMutationIntegrity`.
 *
 * ISOMORPHIC, NOT SERVER-ONLY — the one file in this module family without
 * `import 'server-only'`. Every current `.channel()` call site in this repo
 * is a `'use client'` hook (browser runtime); `recordDbFailure`/`helmLog`
 * (this file's only side effects) both already run isomorphically elsewhere
 * (`golf-login-outcome.ts` calls them from a path Server Actions reach, and
 * `structured-log.ts`/`metrics.ts` route through `Sentry.logger`/Sentry
 * metrics, which work in the browser SDK too).
 *
 * NO DURABLE `db_error_event` ROW FROM THIS FILE — architectural scope, not
 * an oversight. `record-db-error.ts` is `'server-only'` and needs a
 * service-role secret; a browser channel-status callback cannot reach it
 * directly, and brief §61 is explicit that a new browser-to-server ingest
 * endpoint needs its own justification, auth, allow-list, and rate limit —
 * a bridge endpoint is NOT VERIFIED / future work here (measured-truth doc).
 * What this file DOES give Bridge: a Sentry breadcrumb-adjacent `helmLog`
 * line and the existing `helm.db.failure` metric (brief §36-39: reuse the
 * `helm.*` catalogue) for every CHANNEL_ERROR/TIMED_OUT/unexpected CLOSED —
 * real, immediate visibility where there was previously none.
 *
 * DISTINGUISHES connection failure from silent delivery failure (brief
 * §12): this file only ever sees CONNECTION states
 * (SUBSCRIBED/CHANNEL_ERROR/CLOSED/TIMED_OUT). "SUBSCRIBED but an expected
 * product signal never arrives" is a PRODUCT-LEVEL invariant
 * (`integrity.ts`'s family), not something a channel-status callback can
 * detect — brief §12 names this as the other half explicitly, not this
 * file's job.
 */
import { recordDbFailure } from '../metrics';
import { helmLog } from '../structured-log';

export type RealtimeChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';

export interface RealtimeObserverContext {
  /** A SAFE logical label — e.g. `qualifier_leaderboard`, `team_messages` —
   *  NEVER the raw channel string a caller builds with an embedded id
   *  (brief §12: "no unique user/channel ids as dimensions"). */
  channelName: string;
  feature: string;
  /** e.g. `postgres_changes`, `presence`, `broadcast`. */
  subscriptionType: string;
  sport?: string | null;
}

export interface RealtimeObserverState {
  reconnectCount: number;
  lastStatus: RealtimeChannelStatus | null;
  lastSuccessfulMessageAt: string | null;
}

export interface RealtimeStatusObserver {
  /** Pass directly as `channel.subscribe(observer.onStatus)`. */
  onStatus: (status: RealtimeChannelStatus, err?: Error) => void;
  /** Call from the channel's own message handler(s) to update
   *  `lastSuccessfulMessageAt` — optional; omitted callers simply don't get
   *  that field populated. */
  onMessage: () => void;
  getState: () => RealtimeObserverState;
}

const TERMINAL_FAILURE_STATES: ReadonlySet<RealtimeChannelStatus> = new Set(['CHANNEL_ERROR', 'TIMED_OUT']);

/**
 * Builds a stateful observer for ONE channel's lifetime. A caller creates a
 * fresh observer per `.channel()` call (typically inside the same
 * `useEffect` that creates the channel) — reconnect/connect-latency state
 * naturally resets on remount, matching the channel's own lifecycle.
 */
export function createRealtimeStatusObserver(ctx: RealtimeObserverContext): RealtimeStatusObserver {
  let reconnectCount = 0;
  let lastStatus: RealtimeChannelStatus | null = null;
  let lastSuccessfulMessageAt: string | null = null;
  let subscribeStartedAt = Date.now();

  const onStatus = (status: RealtimeChannelStatus, err?: Error): void => {
    try {
      const connectLatencyMs = status === 'SUBSCRIBED' ? Date.now() - subscribeStartedAt : null;

      if (lastStatus === 'CHANNEL_ERROR' || lastStatus === 'TIMED_OUT' || lastStatus === 'CLOSED') {
        if (status === 'SUBSCRIBED') reconnectCount += 1;
        // A fresh attempt after a drop starts a new latency clock.
        subscribeStartedAt = Date.now();
      }

      lastStatus = status;

      if (TERMINAL_FAILURE_STATES.has(status)) {
        recordDbFailure({
          feature: ctx.feature,
          action: 'realtime_subscribe',
          errorCode: status,
          sport: ctx.sport ?? undefined,
          operation: 'subscribe',
          runtime: 'browser',
        });
        helmLog.warn('supabase.realtime_channel_status', {
          feature: ctx.feature,
          action: 'realtime_subscribe',
          result: 'actionable_warning',
          error_code: status,
          runtime: 'browser',
          service: 'realtime',
          operation: 'subscribe',
          retry: reconnectCount,
        });
      } else if (status === 'CLOSED' && reconnectCount === 0) {
        // A CLOSED with no prior SUBSCRIBED in this observer's life is a
        // connection that never opened — actionable. A CLOSED that follows a
        // normal unmount-driven `channel.unsubscribe()` looks identical at
        // this layer (supabase-js does not distinguish "I asked to close"
        // from "it closed"), so this is a KNOWN over-report on unmount, not a
        // false negative — logged at `warn`, never escalated to an error
        // metric, to keep that cost low. Callers with a cleaner signal (e.g.
        // an explicit `unsubscribing` flag set right before
        // `channel.unsubscribe()`) can suppress this by simply not calling
        // `onStatus` after they initiate the intentional close.
        helmLog.warn('supabase.realtime_channel_status', {
          feature: ctx.feature,
          action: 'realtime_subscribe',
          result: 'actionable_warning',
          error_code: 'CLOSED_UNCONFIRMED',
          runtime: 'browser',
          service: 'realtime',
          operation: 'subscribe',
        });
      }

      void connectLatencyMs; // reserved for a future durable sample; logged nowhere yet — see file header on scope.
      void err;
    } catch {
      // Fail-open — an observability bug must never break the channel's own
      // status handling for the caller.
    }
  };

  const onMessage = (): void => {
    try {
      lastSuccessfulMessageAt = new Date().toISOString();
    } catch {
      // no-op
    }
  };

  const getState = (): RealtimeObserverState => ({ reconnectCount, lastStatus, lastSuccessfulMessageAt });

  return { onStatus, onMessage, getState };
}
