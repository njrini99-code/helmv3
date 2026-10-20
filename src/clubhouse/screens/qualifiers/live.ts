'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { chReport } from '../../lib/track';

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
export function useLiveStandings(qualifierId: string, enabled: boolean, version?: unknown): ChLiveStandings {
  const router = useRouter();
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
    let timer: number | undefined;
    dispatch({ type: 'reset' });
    const sb = createClient();
    const channel = sb
      .channel(`ch-qualifier-${qualifierId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_rounds', filter: `qualifier_id=eq.${qualifierId}` }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => router.refresh(), 800);
      })
      .subscribe((status) => {
        if (!alive) return;
        // A dropped feed is reported and shown: the chip says Paused, with the time of the standings it still has.
        if (status === 'CHANNEL_ERROR') chReport(new Error('qualifier realtime channel error'), { surface: 'qualifiers.live', severity: 'low' });
        dispatch({ type: 'channel', status });
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [qualifierId, enabled, router, epoch]);

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
