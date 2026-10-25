'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { observeRealtimeChannel } from '@/lib/observability/supabase/realtime';
import { readMyClassDay, readTeamClassDay, type ChClassRead } from '../data/class-day';
import type { ChClassDay, ChMyClassDay } from '../data/class-day-shape';
import { instantAt } from '../data/class-status';
import { useNow } from './use-now';

/**
 * P-10 class awareness: the shared cache behind every class line.
 *
 * One store per team (and one for the signed-in player), module level, so Home, Roster, Messages and the sheets
 * share one fetch instead of each making their own. A store fetches when its first reader mounts, again on window
 * focus and when the tab becomes visible, every five minutes while visible, at midnight of the class zone (the
 * payload is for one date), and when `golf_class_exceptions` changes: an INSERT filtered to the team (a player's
 * "No class today", a team break) and a DELETE (an undo), which Realtime can't filter by team (the event carries only
 * the primary key), heard on an unfiltered listener and refetched after a 2 second debounce. Nothing is fetched per
 * minute: the status is recomputed from the cached payload on the minute tick (useNow).
 *
 * Fail open: a payload older than 15 minutes (offline) reads as no payload, an unavailable RPC (migrations not
 * applied) and a refused call read as nothing, and a failed refresh keeps the last good payload until it is stale.
 * Disabled (`enabled` false) means no fetch, no listener, no channel: with the flag off nothing here runs.
 */

/** A payload this old is not claimed (offline rule). */
export const CLASS_DAY_STALE_MS = 15 * 60_000;
/** The visible-tab refresh interval. */
export const CLASS_DAY_REFRESH_MS = 5 * 60_000;
/** Focus and visibility refreshes closer together than this are one. */
const FOCUS_COALESCE_MS = 15_000;
/** DELETE events carry no team, so they are heard unfiltered and refetched once after this pause. */
export const CLASS_DAY_DELETE_DEBOUNCE_MS = 2_000;
const MAX_TIMEOUT_MS = 2_147_000_000;

export type ChClassDayStatus = 'idle' | 'loading' | 'ready' | 'error';
type Snapshot<T> = { value: T | null; status: ChClassDayStatus };

type Store<T> = {
  key: string;
  snap: Snapshot<T>;
  listeners: Set<() => void>;
  readers: number;
  inflight: Promise<void> | null;
  lastStartedAt: number;
  teardown: (() => void) | null;
  read: () => Promise<ChClassRead<T>>;
  /** The instant after which the held payload is for yesterday. */
  rolloverAt: (value: T) => number | null;
  /** Subscribes the realtime channel; returns its cleanup. Team stores only. */
  live: ((refetch: () => void, refetchSoon: () => void) => () => void) | null;
};

const EMPTY: Snapshot<never> = { value: null, status: 'idle' };
const stores = new Map<string, Store<unknown>>();

function emit(store: Store<unknown>) {
  for (const l of store.listeners) l();
}

function set<T>(store: Store<T>, snap: Snapshot<T>) {
  if (store.snap.value === snap.value && store.snap.status === snap.status) return;
  store.snap = snap;
  emit(store as Store<unknown>);
}

function refetch<T>(store: Store<T>): Promise<void> {
  if (store.inflight) return store.inflight;
  store.lastStartedAt = Date.now();
  if (!store.snap.value) set(store, { value: null, status: 'loading' });
  const run = (async () => {
    const result = await store.read();
    if (result.kind === 'ok') set(store, { value: result.value, status: 'ready' });
    else if (result.kind === 'unavailable') set(store, { value: null, status: 'ready' });
    else set(store, { value: store.snap.value, status: 'error' });
  })()
    .catch(() => set(store, { value: store.snap.value, status: 'error' }))
    .finally(() => {
      store.inflight = null;
    });
  store.inflight = run;
  return run;
}

function acquire<T>(store: Store<T>): () => void {
  store.readers += 1;
  if (store.readers === 1) {
    let midnight: number | undefined;
    let deleteTimer: number | undefined;
    const scheduleMidnight = () => {
      window.clearTimeout(midnight);
      const at = store.snap.value ? store.rolloverAt(store.snap.value) : null;
      if (at == null) return;
      midnight = window.setTimeout(() => void refetch(store), Math.min(Math.max(at - Date.now(), 1_000), MAX_TIMEOUT_MS));
    };
    const refresh = async () => {
      await refetch(store);
      scheduleMidnight();
    };
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - store.lastStartedAt < FOCUS_COALESCE_MS) return;
      void refresh();
    };
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, CLASS_DAY_REFRESH_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const cleanupLive = store.live?.(
      () => void refresh(),
      () => {
        window.clearTimeout(deleteTimer);
        deleteTimer = window.setTimeout(() => void refresh(), CLASS_DAY_DELETE_DEBOUNCE_MS);
      },
    );
    store.teardown = () => {
      window.clearInterval(interval);
      window.clearTimeout(midnight);
      window.clearTimeout(deleteTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      cleanupLive?.();
    };
  }
  return () => {
    store.readers -= 1;
    if (store.readers === 0) {
      store.teardown?.();
      store.teardown = null;
    }
  };
}

const tomorrow = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

function teamStore(teamId: string): Store<ChClassDay> {
  const key = `team:${teamId}`;
  let store = stores.get(key) as Store<ChClassDay> | undefined;
  if (!store) {
    const sb = () => createClient() as unknown as SupabaseClient;
    store = {
      key,
      snap: EMPTY,
      listeners: new Set(),
      readers: 0,
      inflight: null,
      lastStartedAt: 0,
      teardown: null,
      read: () => readTeamClassDay(sb(), teamId),
      rolloverAt: (day) => instantAt(tomorrow(day.on), 0, day.classTimeZone),
      live: (again, againSoon) => {
        const supabase = createClient();
        const channel = observeRealtimeChannel(
          supabase
            .channel(`class-exceptions:${teamId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'golf_class_exceptions', filter: `team_id=eq.${teamId}` }, again)
            // A DELETE event carries only the primary key, so it can't be filtered by team: any delete refetches, debounced.
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'golf_class_exceptions' }, againSoon),
          { feature: 'golf.class_awareness', channelClass: 'golf_class_exceptions', subscriptionType: 'postgres_changes' },
        );
        return () => void supabase.removeChannel(channel);
      },
    };
    stores.set(key, store as Store<unknown>);
  }
  return store;
}

function myStore(): Store<ChMyClassDay> {
  const key = 'me';
  let store = stores.get(key) as Store<ChMyClassDay> | undefined;
  if (!store) {
    store = {
      key,
      snap: EMPTY,
      listeners: new Set(),
      readers: 0,
      inflight: null,
      lastStartedAt: 0,
      teardown: null,
      read: () => readMyClassDay(createClient() as unknown as SupabaseClient),
      rolloverAt: (day) => instantAt(tomorrow(day.on), 0, day.classTimeZone),
      live: null,
    };
    stores.set(key, store as Store<unknown>);
  }
  return store;
}

/** Refetch a team's payload now, whoever is reading it: after a term or a break is saved. A no-op when nothing reads it. */
export function refetchTeamClassDay(teamId: string): Promise<void> {
  const store = stores.get(`team:${teamId}`);
  return store && store.readers > 0 ? refetch(store) : Promise.resolve();
}

/** Refetch the signed-in player's payload now: after Mark no class, the sharing switch, Deliver now. */
export function refetchMyClassDay(): Promise<void> {
  const store = stores.get('me');
  return store && store.readers > 0 ? refetch(store) : Promise.resolve();
}

/** Test-only: forget every store. */
export function __resetClassDayStoresForTests(): void {
  for (const s of stores.values()) s.teardown?.();
  stores.clear();
}

function useStore<T>(store: Store<T> | null, stale: (value: T) => number) {
  useEffect(() => (store ? acquire(store) : undefined), [store]);
  const snap = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        if (!store) return () => undefined;
        store.listeners.add(onChange);
        return () => void store.listeners.delete(onChange);
      },
      [store],
    ),
    () => (store ? store.snap : (EMPTY as Snapshot<T>)),
    () => EMPTY as Snapshot<T>,
  );
  const date = useNow();
  const now = date ? date.getTime() : null;
  const fresh = snap.value != null && now != null && now - stale(snap.value) <= CLASS_DAY_STALE_MS ? snap.value : null;
  const again = useCallback(() => (store ? refetch(store) : Promise.resolve()), [store]);
  return { value: fresh, status: snap.status, now, refetch: again };
}

/**
 * A coach's class day for a team. `day` is null while loading, when nothing is available (migrations not applied, not
 * a coach of the team), and when the payload is older than 15 minutes. `now` is the minute-tick instant (null until
 * hydrated): status is computed from `day` and `now`, so a line changes without a fetch.
 */
export function useTeamClassDay(teamId: string | null, opts: { enabled?: boolean } = {}) {
  const enabled = (opts.enabled ?? true) && !!teamId;
  const store = enabled ? teamStore(teamId!) : null;
  const { value, status, now, refetch: again } = useStore(store, (d) => d.fetchedAt);
  return { day: value, status: enabled ? status : ('idle' as const), now, refetch: again };
}

/** The signed-in player's class day (their blocks, settings, and "Coaches see" object). */
export function useMyClassDay(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const store = enabled ? myStore() : null;
  const { value, status, now, refetch: again } = useStore(store, (d) => d.fetchedAt);
  return { day: value, status: enabled ? status : ('idle' as const), now, refetch: again };
}
