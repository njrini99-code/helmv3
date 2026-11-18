'use client';

import { createClient } from '@/lib/supabase/client';
import { chReport } from '../lib/track';

/**
 * A private broadcast topic of held migration 20261025050100, joined and kept joined (8.10, 6): `golf-live:coach:<team>` for a
 * coach, `golf-live:team:<team>` for a player who is not on the course. Joining authorises with the session's token, a
 * channel that drops is rejoined after 1, 2, 4, 8, 16 and then 30 seconds, and a hidden tab leaves after five minutes and
 * rejoins on return. `onUp(true)` is the first SUBSCRIBED of a join (the caller catches up once); `onUp(false)` is a drop.
 * Everything here is a no-op until the push migration is applied: the join simply never reaches SUBSCRIBED.
 */

/** The part of a Realtime channel this uses (a test seam; the browser's client satisfies it). */
export interface LiveChannel {
  on: (type: 'broadcast', filter: { event: string }, callback: (message: { payload?: unknown }) => void) => LiveChannel;
  subscribe: (callback: (status: string) => void) => LiveChannel;
}
export interface LiveRealtime {
  channel: (topic: string, options: { config: { private: boolean } }) => LiveChannel;
  removeChannel: (channel: LiveChannel) => unknown;
  /** Private channels authorise with the session's token. */
  setAuth?: () => unknown;
}

/** Rejoin delays after the channel drops; the last one repeats. */
export const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
/** A hidden tab leaves the channel after this long. */
export const HIDDEN_LEAVE_MS = 5 * 60_000;
/**
 * Failed joins in a row before a drop is reported. A channel that drops and rejoins is the network (a phone changing
 * towers, a laptop waking, a token refresh), not a defect, and reporting every drop filled the Bridge with low-severity
 * noise. Four failures is about 7 seconds of backoff without one SUBSCRIBED; one report per outage.
 */
export const REPORT_AFTER_FAILURES = 4;

export const LIVE_EVENTS = ['lane', 'hide', 'gone'] as const;

export function joinLiveTopic(args: {
  topic: string;
  /** Test seam; the browser's client otherwise. */
  realtime?: () => LiveRealtime;
  onMessage: (payload: unknown) => void;
  onUp: (up: boolean) => void;
  surface?: string;
}): () => void {
  const { topic, onMessage, onUp, surface = 'live.channel' } = args;
  let alive = true;
  let rt: LiveRealtime | null = null;
  let channel: LiveChannel | null = null;
  let attempt = 0;
  let retry: number | undefined;
  let leave: number | undefined;
  let up = false;
  let failures = 0;
  let reported = false;
  const failed = (error: unknown, status: string) => {
    failures += 1;
    if (reported || failures < REPORT_AFTER_FAILURES) return;
    reported = true;
    chReport(error, { surface, severity: 'low', extra: { status, failures } });
  };
  const hidden = () => document.visibilityState === 'hidden';
  const setUp = (value: boolean) => {
    if (up === value) return;
    up = value;
    onUp(value);
  };
  const drop = () => {
    const ch = channel;
    channel = null;
    setUp(false);
    if (ch && rt) {
      try {
        rt.removeChannel(ch);
      } catch {
        /* already gone */
      }
    }
  };
  const rejoinLater = () => {
    window.clearTimeout(retry);
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
    attempt += 1;
    retry = window.setTimeout(() => void join(), wait);
  };
  const join = async () => {
    window.clearTimeout(retry);
    if (!alive || hidden() || channel) return;
    try {
      rt = args.realtime ? args.realtime() : (createClient() as unknown as LiveRealtime);
      // A failed setAuth surfaces as the join's CHANNEL_ERROR, which counts as a failed join below.
      await Promise.resolve(rt.setAuth?.()).catch(() => undefined);
      if (!alive || channel) return;
      const ch = rt.channel(topic, { config: { private: true } });
      channel = ch;
      for (const event of LIVE_EVENTS) ch.on('broadcast', { event }, (m) => onMessage(m.payload));
      ch.subscribe((status) => {
        if (!alive || channel !== ch) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          failures = 0;
          reported = false;
          setUp(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          failed(new Error(`live channel ${status}`), status);
          drop();
          rejoinLater();
        }
      });
    } catch (error) {
      failed(error, 'THROWN');
      drop();
      rejoinLater();
    }
  };
  const onVis = () => {
    window.clearTimeout(leave);
    if (hidden()) {
      leave = window.setTimeout(() => {
        window.clearTimeout(retry);
        drop();
      }, HIDDEN_LEAVE_MS);
    } else if (!channel) {
      attempt = 0;
      void join();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  void join();
  return () => {
    alive = false;
    window.clearTimeout(retry);
    window.clearTimeout(leave);
    document.removeEventListener('visibilitychange', onVis);
    drop();
  };
}
