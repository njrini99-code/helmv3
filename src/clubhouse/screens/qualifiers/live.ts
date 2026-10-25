'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { chReport } from '../../lib/track';
import { joinLiveTopic, type LiveRealtime } from '../../live/channel';
import { parseBroadcast } from '../../live/live-rounds-adapter';

/**
 * What the Live chip may say (P009-B2): `live` only while the realtime feed is subscribed; `paused` when it errored,
 * timed out or closed, or the tab was hidden long enough that signed rounds may have been missed; `connecting` before
 * the first answer; `off` when the qualifier isn't live (or the page was drawn without a feed: the preview, a test).
 */
export type ChLiveFeed = 'off' | 'connecting' | 'live' | 'paused';

/** A tab hidden this long comes back paused: a phone asleep in a pocket on the course can miss signed rounds. */
export const HIDDEN_LONG_MS = 5 * 60_000;

export interface ChFeedState {
  channel: 'connecting' | 'subscribed' | 'down';
  hiddenAt: number | null;
  /** The tab came back after HIDDEN_LONG_MS: paused until a fresh read lands. */
  missed: boolean;
}

export type ChFeedEvent =
  | { type: 'channel'; status: string }
  | { type: 'hidden'; at: number }
  | { type: 'visible'; at: number }
  /** A fresh read of the page landed (the data on screen changed). */
  | { type: 'loaded' }
  /** The channel is being opened again (first subscribe, or Refresh after it dropped). */
  | { type: 'reset' };

export const FEED_START: ChFeedState = { channel: 'connecting', hiddenAt: null, missed: false };

/** The feed's state machine, pure so the tests can walk it. */
export function feedReduce(s: ChFeedState, e: ChFeedEvent): ChFeedState {
  switch (e.type) {
    case 'channel':
      if (e.status === 'SUBSCRIBED') return withChannel(s, 'subscribed');
      if (e.status === 'CHANNEL_ERROR' || e.status === 'TIMED_OUT' || e.status === 'CLOSED') return withChannel(s, 'down');
      return s;
    case 'hidden':
      return s.hiddenAt != null ? s : { ...s, hiddenAt: e.at };
    case 'visible': {
      const missed = s.missed || (s.hiddenAt != null && e.at - s.hiddenAt >= HIDDEN_LONG_MS);
      return s.hiddenAt == null && missed === s.missed ? s : { ...s, hiddenAt: null, missed };
    }
    case 'loaded':
      return s.missed ? { ...s, missed: false } : s;
    case 'reset':
      return withChannel(s, 'connecting');
  }
}

/** The same state when nothing changed, so a repeated event never draws the page again. */
const withChannel = (s: ChFeedState, channel: ChFeedState['channel']): ChFeedState => (s.channel === channel ? s : { ...s, channel });

export function feedOf(s: ChFeedState): Exclude<ChLiveFeed, 'off'> {
  if (s.channel === 'down' || s.missed) return 'paused';
  return s.channel === 'subscribed' ? 'live' : 'connecting';
}

/** What the board's Live chip shows (P009-B2, D3), on desktop and the phone. */
export interface LiveFeedView {
  feed: ChLiveFeed;
  /** The data on screen: when it changes, a fresh read landed (the chip stamps its time then). */
  version: unknown;
  /** A fixed read time (the preview); otherwise the chip stamps one after hydration. */
  updatedAt?: number;
  refresh: () => void;
  /** Still open after its last day (P009-D3): the chip says Ended instead of Live. */
  ended: { outstanding: number | null } | null;
}

/** The least time between two re-reads of the page while a qualifier is live (P-6, 8.14): five seconds. */
export const REFRESH_GAP_MS = 5_000;
const DEBOUNCE_MS = 800;

/**
 * How long to wait before the next re-read: the usual 800 ms debounce, stretched so two re-reads are never closer than
 * REFRESH_GAP_MS. Each autosave of each player updates their `golf_rounds` row about 37 times (recompute_golf_round_totals,
 * once per hole row), so without a gap every watching page refreshed on every autosave.
 */
export function refreshDelay(now: number, lastRefreshAt: number): number {
  return Math.max(DEBOUNCE_MS, lastRefreshAt + REFRESH_GAP_MS - now);
}

type RoundMark = { updated_at: string | null; status: string | null };

/**
 * Whether a change to a qualifier round is worth a re-read. The same `updated_at` and `status` as the last change seen
 * for that round carries nothing the page does not already have; a new round, a new `updated_at` or a new status does.
 * `seen` is the caller's memory and is updated here.
 */
export function changeMatters(payload: { new?: Record<string, unknown> | null } | undefined, seen: Map<string, RoundMark>): boolean {
  const row = payload?.new;
  const id = typeof row?.id === 'string' ? row.id : null;
  if (!id) return true;
  const mark: RoundMark = { updated_at: typeof row?.updated_at === 'string' ? row.updated_at : null, status: typeof row?.status === 'string' ? row.status : null };
  const before = seen.get(id);
  seen.set(id, mark);
  return !before || before.updated_at !== mark.updated_at || before.status !== mark.status;
}

/** The coach topic's team, and a test seam for the Realtime client. */
export interface LivePush {
  teamId: string | null;
  realtime?: () => LiveRealtime;
}

export interface ChLiveStandings {
  feed: ChLiveFeed;
  /** Re-read the page, and reopen the feed when it dropped. */
  refresh: () => void;
}

/**
 * "Updates as rounds are signed": while a qualifier is live, a signed round
 * re-reads the page on the server (router.refresh), so the standings stay the
 * loader's, never a second client copy. RLS scopes the realtime feed like
 * every other read. A burst of changes becomes one refresh. The feed's state
 * is returned, so a dropped feed is shown as Paused, not left under a Live
 * label (P009-B2); it is still reported. `version` is the data on screen: when
 * it changes, a fresh read landed.
 */
export function useLiveStandings(qualifierId: string, enabled: boolean, version?: unknown, push?: LivePush): ChLiveStandings {
  const router = useRouter();
  // One refresh gate for both feeds (the 800 ms debounce and the 5 s gap), and whether the push channel is carrying the news.
  const gate = useRef<{ timer: number | undefined; last: number }>({ timer: undefined, last: 0 });
  const pushUp = useRef(false);
  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(gate.current.timer);
    gate.current.timer = window.setTimeout(() => {
      gate.current.last = Date.now();
      router.refresh();
    }, refreshDelay(Date.now(), gate.current.last));
  }, [router]);
  const [state, dispatch] = useReducer(feedReduce, FEED_START);
  const [epoch, setEpoch] = useState(0);

  // A fresh read ends a pause that the tab's long sleep caused. Only then: a page-wide re-render for nothing would
  // disturb the sections still streaming in.
  const missed = state.missed;
  useEffect(() => {
    if (missed) dispatch({ type: 'loaded' });
    // Only a new read clears it, not the pause starting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    if (!enabled) return;
    // The cleanup's removeChannel answers CLOSED through this same callback: once torn down, nothing it says is shown.
    let alive = true;
    const seen = new Map<string, RoundMark>();
    dispatch({ type: 'reset' });
    const sb = createClient();
    const channel = sb
      .channel(`ch-qualifier-${qualifierId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_rounds', filter: `qualifier_id=eq.${qualifierId}` }, (payload) => {
        // With the push channel up the news comes from the live table's own broadcasts, one per real change: this feed only
        // keeps the page's Live label honest, and no longer re-reads the page for every autosave (the recompute storm).
        if (pushUp.current) return;
        if (!changeMatters(payload as { new?: Record<string, unknown> | null }, seen)) return;
        scheduleRefresh();
      })
      .subscribe((status) => {
        if (!alive) return;
        // A dropped feed is reported and shown: the chip says Paused, with the time of the standings it still has.
        if (status === 'CHANNEL_ERROR') chReport(new Error('qualifier realtime channel error'), { surface: 'qualifiers.live', severity: 'low' });
        dispatch({ type: 'channel', status });
      });
    return () => {
      alive = false;
      window.clearTimeout(gate.current.timer);
      void sb.removeChannel(channel);
    };
  }, [qualifierId, enabled, router, epoch, scheduleRefresh]);

  // The push channel (held migration 20261025050100): the team's coach topic carries a message when a live row really
  // changes. One about this qualifier re-reads the page through the same gate. Until the migration is applied the join
  // never reaches SUBSCRIBED and the postgres_changes feed above does the work, as before.
  const teamId = push?.teamId ?? null;
  const realtime = push?.realtime;
  useEffect(() => {
    if (!enabled || !teamId) return;
    return joinLiveTopic({
      topic: `golf-live:coach:${teamId}`,
      realtime,
      surface: 'qualifiers.push',
      onUp: (up) => {
        pushUp.current = up;
      },
      onMessage: (payload) => {
        const msg = parseBroadcast(payload);
        if (!msg) return;
        // A lane names its qualifier; hide and gone do not, and are rare enough to re-read for.
        if (msg.k === 'lane' && msg.q !== qualifierId) return;
        scheduleRefresh();
      },
    });
  }, [enabled, teamId, qualifierId, realtime, scheduleRefresh]);
  useEffect(() => () => void (pushUp.current = false), []);

  useEffect(() => {
    if (!enabled) return;
    const onVis = () => dispatch(document.visibilityState === 'hidden' ? { type: 'hidden', at: Date.now() } : { type: 'visible', at: Date.now() });
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);

  const down = state.channel === 'down';
  const refresh = useCallback(() => {
    router.refresh();
    if (down) setEpoch((n) => n + 1);
  }, [router, down]);

  return { feed: enabled ? feedOf(state) : 'off', refresh };
}
