'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { groupLanes, sortLanes, type LiveGroups, type LiveLane, type LiveRoundType, type LiveSnapshot, type LiveSort } from '../../live/model';
import { laneMatchesScope, type LiveScope } from '../../live/scope';
import { useLiveRounds, type UseLiveRounds } from '../../live/use-live-rounds';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChClock } from '../../lib/use-clock';
import { useChPhone } from '../../lib/use-phone';
import { useNow } from '../../lib/use-now';

/**
 * The state both live views share (phone and desktop): the feed, the filter, the sort (remembered per device), which
 * lane is open, and the hold that keeps an update from landing under the pointer or the finger (5L.8.3).
 */

const SORT_KEY = 'ch.live.sort';
const ANNOUNCE_KEY = 'ch.live.announce';
const SORTS: readonly LiveSort[] = ['to_par', 'thru', 'name', 'tee'];

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // No storage (private mode, blocked): the choice holds for this visit only.
  }
}

/** The desktop panel gives way to a sheet below this width (4.3). */
export const PANEL_MIN_PX = 1080;
const NARROW_QUERY = `(max-width: ${PANEL_MIN_PX - 1}px)`;
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW_QUERY);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

export interface LiveViewState {
  live: UseLiveRounds;
  now: number | null;
  hours: '12' | '24';
  reduced: boolean;
  filter: 'all' | LiveRoundType;
  setFilter: (f: 'all' | LiveRoundType) => void;
  /** The filter segments that have lanes; the filter is hidden when this has fewer than two. */
  types: LiveRoundType[];
  sort: LiveSort;
  setSort: (s: LiveSort) => void;
  announce: boolean;
  setAnnounce: (v: boolean) => void;
  groups: LiveGroups;
  everyone: LiveLane[];
  selectedId: string | null;
  selected: LiveLane | null;
  select: (id: string | null) => void;
  /** Handlers for the list's container: the pointer and scrolling hold updates back. */
  holdProps: { onPointerEnter: (e: React.PointerEvent) => void; onPointerLeave: () => void; onScrollCapture: () => void };
}

export function useLiveView(initial: LiveSnapshot, scope?: LiveScope, frozen = false, frozenNow?: number): LiveViewState {
  const [filter, setFilter] = useState<'all' | LiveRoundType>('all');
  const [sort, setSortState] = useState<LiveSort>('to_par');
  const [announce, setAnnounceState] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pointer, setPointer] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<number | undefined>(undefined);
  // A sheet over the list holds updates back; the desktop panel beside it does not.
  const phoneSheet = useChPhone();
  const narrow = useNarrow();
  const sheet = phoneSheet || narrow;
  const live = useLiveRounds({ initial, role: 'coach', scope, hold: pointer || scrolling || (sheet && selectedId != null), frozen });
  const ticking = useNow();
  const now = frozenNow ?? ticking?.getTime() ?? null;
  const hours = useChClock();
  const reduced = useChReducedMotion();

  // The remembered choices are read after mount, so the server's paint and the first client paint agree.
  useEffect(() => {
    const s = readStore(SORT_KEY);
    if (s && (SORTS as readonly string[]).includes(s)) setSortState(s as LiveSort);
    if (readStore(ANNOUNCE_KEY) === 'off') setAnnounceState(false);
  }, []);
  const setSort = useCallback((s: LiveSort) => {
    setSortState(s);
    writeStore(SORT_KEY, s);
  }, []);
  const setAnnounce = useCallback((v: boolean) => {
    setAnnounceState(v);
    writeStore(ANNOUNCE_KEY, v ? 'on' : 'off');
  }, []);
  useEffect(() => () => window.clearTimeout(scrollTimer.current), []);

  const scoped = useMemo(() => (scope ? live.lanes.filter((l) => laneMatchesScope(l, scope)) : live.lanes), [live.lanes, scope]);
  const types = useMemo(() => (['qualifier', 'practice', 'tournament'] as const).filter((t) => scoped.some((l) => l.roundType === t)), [scoped]);
  const effective = filter !== 'all' && !types.includes(filter) ? 'all' : filter;
  const filtered = useMemo(() => (effective === 'all' ? scoped : scoped.filter((l) => l.roundType === effective)), [scoped, effective]);
  const groups = useMemo(() => groupLanes(filtered, now ?? Date.now(), sort), [filtered, now, sort]);
  const selected = useMemo(() => scoped.find((l) => l.roundId === selectedId) ?? null, [scoped, selectedId]);

  return {
    live,
    now,
    hours,
    reduced,
    filter: effective,
    setFilter,
    types,
    sort,
    setSort,
    announce,
    setAnnounce,
    groups,
    everyone: sortLanes(filtered.filter((l) => l.phase === 'on_course' || l.phase === 'finished'), 'to_par'),
    selectedId,
    selected,
    select: setSelectedId,
    holdProps: {
      // A mouse resting on the list holds updates back; a finger does not (it scrolls instead, below).
      onPointerEnter: (e) => setPointer(e.pointerType === 'mouse'),
      onPointerLeave: () => setPointer(false),
      onScrollCapture: () => {
        setScrolling(true);
        window.clearTimeout(scrollTimer.current);
        scrollTimer.current = window.setTimeout(() => setScrolling(false), 400);
      },
    },
  };
}
