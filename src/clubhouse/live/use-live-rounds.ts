'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { chReport } from '../lib/track';
import { joinLiveTopic, type LiveRealtime } from './channel';
import { applyBroadcast } from './live-rounds-adapter';
import { fetchLiveSnapshot, type LiveClient } from './live-queries';
import { laneMatchesScope, type LiveScope } from './scope';
import { isLate, momentsFrom, washOf, type LiveLane, type LiveMoment, type LiveSnapshot, type LiveWash } from './model';

/**
 * The live rounds a screen draws, kept current (8.15, 6). Server data first: nothing moves on first paint, only values
 * that change after mount. While the page is visible it polls the same reads the server made, every 20 seconds
 * (`POLL_MS`); hidden, it stops, and on return it reads at once. An update does not land under the pointer: while `hold`
 * is true (pointer over the list, a scroll, a sheet open) it waits, `pending` counts what is waiting and `applyPending`
 * lets it in. A change rides a one second queue so a burst becomes one pass (5L.8.3).
 *
 * With the push migration applied (20261025050100) a screen that listens also joins a private broadcast topic
 * (`golf-live:coach:<team>`, or `golf-live:team:<team>` for a player who is not on the course) and applies `lane`, `hide`
 * and `gone` messages through the same queue, by `seq`. While the channel is down the 20 second poll keeps the screen
 * current; once it is up the poll slows to a 60 second snapshot. A channel that drops is rejoined with a backoff of 1, 2,
 * 4, 8, 16 and 30 seconds; a hidden tab leaves it after five minutes and rejoins on return.
 *
 * `frozen` (the preview and the tests) turns the polling and the channel off and leaves the snapshot as given.
 */

export const POLL_MS = 20_000;
/** While the channel is up the poll is only a safety net. */
export const SNAPSHOT_MS = 60_000;
export const QUEUE_MS = 1_000;
export { BACKOFF_MS, HIDDEN_LEAVE_MS, type LiveChannel, type LiveRealtime } from './channel';
/** The moments list keeps this many, newest first. */
const MOMENT_CAP = 50;

export type LiveFeed = 'connecting' | 'live' | 'paused' | 'offline';

/** What a commit changed in one lane: the holes that arrived, the wash to show on its to-par, and whether it was a late sync. */
export interface LaneChange {
  /** Bumps on every change, so a repeated change to the same hole animates again. */
  n: number;
  holes: number[];
  wash: LiveWash | null;
  late: boolean;
}

export interface UseLiveRounds {
  lanes: LiveLane[];
  snapshot: LiveSnapshot;
  moments: LiveMoment[];
  changes: ReadonlyMap<string, LaneChange>;
  feed: LiveFeed;
  /** When the lanes on screen were read, for the freshness chip. */
  updatedAt: number | null;
  pending: number;
  applyPending: () => void;
  refresh: () => Promise<void>;
}

export interface UseLiveRoundsOptions {
  initial: LiveSnapshot;
  role: 'coach' | 'player';
  playerId?: string | null;
  scope?: LiveScope;
  hold?: boolean;
  frozen?: boolean;
  /**
   * Join the broadcast topic. Default: a coach does, a player does not (their own card polls); the Teammates card passes
   * true, and a player who is on the course leaves the team topic whatever this says.
   */
  listen?: boolean;
  /** Test seam: the client the polls read with. */
  client?: () => LiveClient;
  /** Test seam: the Realtime client the channel is made with. */
  realtime?: () => LiveRealtime;
}

/** What differs between two reads of a lane: enough to say the screen has something new to show. */
function laneSignature(l: LiveLane): string {
  return JSON.stringify([l.phase, l.thru, l.toPar, l.share, l.currentHole, l.holes.map((h) => [h.n, h.score]), l.heardAt, l.name]);
}

function sameLanes(a: readonly LiveLane[], b: readonly LiveLane[]): boolean {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((l) => [l.roundId, laneSignature(l)]));
  return b.every((l) => m.get(l.roundId) === laneSignature(l));
}

export function useLiveRounds(opts: UseLiveRoundsOptions): UseLiveRounds {
  const { role, playerId = null, scope, hold = false, frozen = false, listen = role === 'coach' } = opts;
  const zone = opts.initial.zone;
  const [snapshot, setSnapshot] = useState<LiveSnapshot>(opts.initial);
  const [moments, setMoments] = useState<LiveMoment[]>([]);
  const [changes, setChanges] = useState<ReadonlyMap<string, LaneChange>>(new Map());
  const [feed, setFeed] = useState<LiveFeed>(frozen ? 'live' : 'connecting');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [queued, setQueued] = useState<LiveSnapshot | null>(null);
  const shown = useRef(snapshot);
  const counter = useRef(0);
  const seen = useRef(new Set<string>());
  const queuedRef = useRef<LiveSnapshot | null>(null);
  const channelUp = useRef(false);
  const reschedule = useRef<() => void>(() => {});
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  // A new server snapshot (router.refresh) replaces what is on screen; it is data, not news.
  useEffect(() => {
    shown.current = opts.initial;
    queuedRef.current = null;
    setSnapshot(opts.initial);
    setQueued(null);
    setChanges(new Map());
  }, [opts.initial]);

  const commit = useCallback((next: LiveSnapshot) => {
    const prev = shown.current;
    const prevById = new Map(prev.lanes.map((l) => [l.roundId, l]));
    const nowIso = new Date().toISOString();
    const fresh = new Map<string, LaneChange>();
    const news: LiveMoment[] = [];
    for (const lane of next.lanes) {
      const before = prevById.get(lane.roundId);
      if (!before) continue;
      const late = isLate(before, lane);
      const gained = lane.holes.filter((h) => h.score != null && before.holes.find((p) => p.n === h.n)?.score !== h.score).map((h) => h.n);
      if (gained.length) fresh.set(lane.roundId, { n: ++counter.current, holes: gained, wash: washOf(before, lane), late });
      for (const m of momentsFrom(before, lane, nowIso, late)) {
        if (seen.current.has(m.id)) continue;
        seen.current.add(m.id);
        news.push(m);
      }
    }
    shown.current = next;
    queuedRef.current = null;
    setSnapshot(next);
    setChanges(fresh);
    if (news.length) setMoments((cur) => [...news, ...cur].slice(0, MOMENT_CAP));
    setQueued(null);
  }, []);

  const incoming = useCallback(
    (next: LiveSnapshot) => {
      setUpdatedAt(Date.now());
      if (next.error) {
        // A failed read keeps what is on screen and says so.
        setFeed('paused');
        return;
      }
      setFeed('live');
      const view = scopeRef.current;
      const scoped = view ? { ...next, lanes: next.lanes.filter((l) => laneMatchesScope(l, view)) } : next;
      if (sameLanes(shown.current.lanes, scoped.lanes) && shown.current.events.length === scoped.events.length && shown.current.viewerOnCourse === scoped.viewerOnCourse) {
        // Nothing new: only the clock of the read moves (and an update still waiting that this undoes is dropped).
        shown.current = { ...shown.current, fetchedAt: scoped.fetchedAt, roster: scoped.roster };
        if (queuedRef.current) {
          queuedRef.current = null;
          setQueued(null);
        }
        return;
      }
      queuedRef.current = scoped;
      setQueued(scoped);
    },
    [],
  );

  const read = useCallback(async () => {
    try {
      const client = opts.client ? opts.client() : (createClient() as LiveClient);
      const next = await fetchLiveSnapshot(client, { teamId: shown.current.teamId, role, playerId, now: new Date(), zone, roster: shown.current.roster, prev: shown.current.lanes });
      incoming(next);
    } catch (error) {
      chReport(error, { surface: 'live.poll', severity: 'low' });
      setFeed('paused');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, playerId, zone, incoming]);

  // Poll while visible; stop while hidden; read at once on return and when the connection comes back.
  useEffect(() => {
    if (frozen) return;
    let alive = true;
    let timer: number | undefined;
    const hidden = () => document.visibilityState === 'hidden';
    const tick = async () => {
      if (!alive) return;
      if (hidden()) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) setFeed('offline');
      else await read();
      if (alive && !hidden()) timer = window.setTimeout(tick, channelUp.current ? SNAPSHOT_MS : POLL_MS);
    };
    const onVis = () => {
      window.clearTimeout(timer);
      if (!hidden()) void tick();
    };
    const onOnline = () => {
      window.clearTimeout(timer);
      void tick();
    };
    const onOffline = () => setFeed('offline');
    timer = window.setTimeout(tick, channelUp.current ? SNAPSHOT_MS : POLL_MS);
    // The channel going up or down changes how long the next wait is.
    reschedule.current = () => {
      window.clearTimeout(timer);
      if (!hidden()) timer = window.setTimeout(tick, channelUp.current ? SNAPSHOT_MS : POLL_MS);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      reschedule.current = () => {};
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [frozen, read]);

  // A broadcast applies to what is queued if something is, else to what is shown, so a burst of them composes.
  const onMessage = useCallback(
    (payload: unknown) => {
      const base = queuedRef.current ?? shown.current;
      const res = applyBroadcast(base.lanes, payload, base.roster);
      if (res.needsSnapshot) void read();
      // A lane whose player's name is not known yet waits for the snapshot that brings it.
      if (res.changed) incoming({ ...base, lanes: res.lanes.filter((l) => l.name), fetchedAt: new Date().toISOString(), error: false });
    },
    [read, incoming],
  );
  const readRef = useRef(read);
  readRef.current = read;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // The channel. Coach: the team's coach topic. Player: the team topic, and only while not on the course themselves.
  const teamId = snapshot.teamId;
  const topic = frozen || !listen || !teamId ? null : role === 'coach' ? `golf-live:coach:${teamId}` : snapshot.viewerOnCourse ? null : `golf-live:team:${teamId}`;
  useEffect(() => {
    if (!topic) return;
    return joinLiveTopic({
      topic,
      realtime: opts.realtime,
      onMessage: (payload) => onMessageRef.current(payload),
      onUp: (up) => {
        channelUp.current = up;
        reschedule.current();
        // Anything sent before the join is in the table: catch up once.
        if (up) void readRef.current();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  // The queue: an update lands one second after it arrived, unless the person is holding the list.
  useEffect(() => {
    if (!queued || hold) return;
    const t = window.setTimeout(() => {
      if (!holdRef.current) commit(queued);
    }, QUEUE_MS);
    return () => window.clearTimeout(t);
  }, [queued, hold, commit]);

  const applyPending = useCallback(() => {
    if (queued) commit(queued);
  }, [queued, commit]);

  const pending = useMemo(() => {
    if (!queued) return 0;
    const before = new Map(snapshot.lanes.map((l) => [l.roundId, laneSignature(l)]));
    return queued.lanes.filter((l) => before.get(l.roundId) !== laneSignature(l)).length + snapshot.lanes.filter((l) => !queued.lanes.some((q) => q.roundId === l.roundId)).length;
  }, [queued, snapshot.lanes]);

  const refresh = useCallback(async () => {
    setFeed((f) => (f === 'live' ? f : 'connecting'));
    await read();
  }, [read]);

  return { lanes: snapshot.lanes, snapshot, moments, changes, feed, updatedAt, pending, applyPending, refresh };
}
