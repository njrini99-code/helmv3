'use client';

/**
 * useCalendarRangeEvents — range-driven calendar event fetching + realtime.
 *
 * The calendar page server-fetches a ±3-month window of golf_events. Before
 * this hook, navigating outside that window rendered an EMPTY calendar that
 * was indistinguishable from data loss (audit GOLFHELM_CALENDAR_AUDIT
 * 2026-06-10, finding #9), and the realtime channel was torn down/rebuilt on
 * every navigation with no refetch on (re)subscribe, silently dropping events
 * that landed in the gap (finding #25).
 *
 * This hook:
 *  - tracks which date intervals are loaded (server window + client fetches),
 *  - fetches any visible range that isn't covered yet (with a ±1 month buffer),
 *  - merges fetched rows with the server payload by RECENCY, not by source: a
 *    shared generation counter is bumped and stamped on whichever side (the
 *    `initialEvents` prop or a client range fetch) most recently observed a
 *    given event id, so a page render that's up to 30s stale (`revalidate =
 *    30`) can never permanently overwrite a fresher client-fetched row — the
 *    root cause of a real data-layer race (times/counts flipping across
 *    identical reloads, findings #37/#166/#185/#83),
 *  - guards every in-flight fetch with an explicit request epoch + an
 *    AbortController so an older response can never land after (and
 *    overwrite) a newer one,
 *  - exposes loading/error state so callers can render a real loading
 *    affordance and a retryable error state (finding #20),
 *  - optionally owns ONE stable realtime channel per team (deps: teamId only —
 *    no leave/join per navigation) and refetches the visible range whenever the
 *    channel (re)subscribes so gap events are recovered.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

/** Columns fetched for calendar rendering — keep in sync with the page select. */
const CALENDAR_EVENT_COLUMNS =
  'id, team_id, title, event_type, start_time, end_time, location, description, status, all_day, created_by, requires_rsvp, rsvp_deadline, max_attendees, parent_event_id, recurrence_rule';

interface GolfEventRangeRow {
  id: string;
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  description: string | null;
  status: string | null;
  all_day: boolean | null;
  created_by: string | null;
  requires_rsvp: boolean | null;
  rsvp_deadline: string | null;
  max_attendees: number | null;
  parent_event_id: string | null;
  recurrence_rule: string | null;
}

/**
 * Map a golf_events row to the CalendarEvent shape, normalizing all-day
 * dates to local midnight (same convention as the calendar page).
 */
export function mapGolfEventRow(event: GolfEventRangeRow): CalendarEvent {
  let startDate = event.start_time;
  let endDate = event.end_time || event.start_time;

  if (event.all_day) {
    const normalizeAllDayDate = (d: string) => `${d.slice(0, 10)}T00:00:00`;
    startDate = normalizeAllDayDate(startDate);
    endDate = normalizeAllDayDate(endDate);
  }

  return {
    id: event.id,
    team_id: event.team_id || '',
    title: event.title,
    event_type: event.event_type,
    start_date: startDate,
    end_date: endDate,
    start_time: event.start_time,
    end_time: event.end_time,
    location: event.location,
    description: event.description,
    status: event.status ?? undefined,
    all_day: event.all_day ?? undefined,
    created_by: event.created_by,
    requires_rsvp: event.requires_rsvp ?? false,
    rsvp_deadline: event.rsvp_deadline,
    max_attendees: event.max_attendees,
    parent_event_id: event.parent_event_id,
    recurrence_rule: event.recurrence_rule,
  };
}

interface LoadedInterval {
  start: number;
  end: number;
}

/** Merge overlapping/adjacent intervals into a canonical sorted list. */
export function mergeIntervals(intervals: LoadedInterval[]): LoadedInterval[] {
  if (intervals.length <= 1) return [...intervals];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: LoadedInterval[] = [];
  let current = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
    } else {
      out.push(current);
      current = { ...next };
    }
  }
  out.push(current);
  return out;
}

/** True when [start, end] is fully covered by one merged interval. */
export function isRangeCovered(intervals: LoadedInterval[], start: number, end: number): boolean {
  return intervals.some((iv) => iv.start <= start && iv.end >= end);
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Safety margin subtracted from the assumed server-loaded window. The page
 * fetched ±3 months from ITS render time; we anchor on client mount time,
 * so shave a day on each side to avoid assuming coverage we don't have.
 */
const SERVER_WINDOW_MARGIN_MS = 24 * 60 * 60 * 1000;
/** Fetch buffer around the visible range so adjacent navigation is free. */
const FETCH_BUFFER_MS = MONTH_MS;

export interface UseCalendarRangeEventsOptions {
  /** Team whose events we fetch. Null/undefined disables fetching. */
  teamId: string | null | undefined;
  /** Server-fetched payload (±3-month window around server render time). */
  initialEvents: CalendarEvent[];
  /** Start of the range the user can currently see. */
  visibleStart: Date;
  /** End (inclusive day) of the range the user can currently see. */
  visibleEnd: Date;
  /** ISO bound of the server-loaded window, when the caller knows it. */
  loadedStart?: string;
  /** ISO bound of the server-loaded window, when the caller knows it. */
  loadedEnd?: string;
  /** Own a stable realtime channel on golf_events for this team. */
  realtime?: boolean;
  /** Called on every realtime event (e.g. router.refresh). */
  onRealtimeEvent?: () => void;
}

export interface UseCalendarRangeEventsResult {
  /** Server payload merged with every client-fetched range, sorted by start. */
  events: CalendarEvent[];
  /** True while a not-yet-loaded range is being fetched. */
  isLoadingRange: boolean;
  /** Human-readable fetch error — render a retryable error state, not an empty calendar. */
  rangeError: string | null;
  /** Retry the failed range fetch. */
  retryRange: () => void;
  /** Force-refetch the currently visible range (used on realtime resubscribe). */
  refetchVisibleRange: () => void;
}

/** A merged-map entry tagged with the generation it was last observed at. */
interface VersionedEvent {
  event: CalendarEvent;
  gen: number;
}

/**
 * Cheap content fingerprint for an `initialEvents` payload — used instead of
 * reference equality to detect "the server actually sent new data" (a real
 * router.refresh()). A caller that reconstructs an array with IDENTICAL
 * content on every render (a fresh `[]` inline, or a `.map()` producing an
 * equivalent list) is extremely common and must NOT be treated as a new
 * observation — comparing by reference alone would bump the generation on
 * every single render and defeat the point of the recency merge entirely.
 */
function signatureOfEvents(events: readonly CalendarEvent[]): string {
  return events
    .map((e) => `${e.id}:${e.start_time ?? e.start_date}:${e.end_time ?? ''}:${e.status ?? ''}`)
    .join('|');
}

export function useCalendarRangeEvents({
  teamId,
  initialEvents,
  visibleStart,
  visibleEnd,
  loadedStart,
  loadedEnd,
  realtime = false,
  onRealtimeEvent,
}: UseCalendarRangeEventsOptions): UseCalendarRangeEventsResult {
  // Shared monotonic "which observation happened most recently" counter.
  // BOTH the server-supplied `initialEvents` prop (refreshed via
  // router.refresh()) and this hook's own client-side range fetches stamp
  // whatever they write with the CURRENT generation. Merging by generation
  // (not "server always wins") fixes a real data-layer race (#37/#166/#185/
  // #83): `initialEvents` is a page render that can be up to 30s stale
  // (`export const revalidate = 30` on the calendar page), while this hook's
  // own range fetch reads golf_events live. The previous rule let that STALE
  // server payload permanently overwrite a FRESHER client-fetched row on
  // every id tie, so a just-edited event's time/attendance could silently
  // revert until the next full reload happened to land past the 30s window —
  // exactly the "identical reload flips" and "stale client cache racing a
  // fresh fetch" symptom reported.
  const genRef = useRef(0);
  const [eventVersions, setEventVersions] = useState<ReadonlyMap<string, VersionedEvent>>(() => {
    const gen = genRef.current;
    const m = new Map<string, VersionedEvent>();
    for (const ev of initialEvents) m.set(ev.id, { event: ev, gen });
    return m;
  });
  // The initialEvents CONTENT signature we last folded into `eventVersions`
  // (not the array reference — see `signatureOfEvents`) — guards the effect
  // below so a same-content re-render (no new server data) never spuriously
  // bumps the generation counter. This also protects against an infinite
  // render loop: a caller that passes a fresh-but-empty/equivalent array
  // literal on every render (a common pattern, including in this hook's own
  // tests) would otherwise look like "new data" on every single render.
  const appliedInitialEventsSignatureRef = useRef(signatureOfEvents(initialEvents));

  useEffect(() => {
    const signature = signatureOfEvents(initialEvents);
    if (appliedInitialEventsSignatureRef.current === signature) return;
    appliedInitialEventsSignatureRef.current = signature;
    genRef.current += 1;
    const gen = genRef.current;
    setEventVersions((prev) => {
      const next = new Map(prev);
      for (const ev of initialEvents) next.set(ev.id, { event: ev, gen });
      return next;
    });
  }, [initialEvents]);

  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  // Bumping forces the fetch effect to re-run (retry / forced refetch).
  const [fetchNonce, setFetchNonce] = useState(0);
  const forceRefetchRef = useRef(false);
  // Explicit request-epoch guard: bumped once per DISPATCHED fetch (not once
  // per effect run — a forced refetch inside the SAME effect execution still
  // gets its own epoch). An in-flight fetch only applies its result if it is
  // still the most-recently-dispatched one when it resolves, so an older
  // response can never land after (and overwrite) a newer one's — independent
  // of the effect-cleanup `cancelled` flag below, which guards the same thing
  // via a different mechanism (defense in depth, not redundant no-ops: the
  // epoch check also protects a same-effect-instance forced re-dispatch that
  // cleanup alone wouldn't distinguish).
  const fetchEpochRef = useRef(0);

  // Loaded interval bookkeeping lives in a ref — it never drives rendering
  // directly, only whether the next navigation needs a fetch.
  const loadedRef = useRef<LoadedInterval[] | null>(null);
  if (loadedRef.current === null) {
    const now = Date.now();
    const start = loadedStart
      ? new Date(loadedStart).getTime()
      : now - 3 * MONTH_MS + SERVER_WINDOW_MARGIN_MS;
    const end = loadedEnd
      ? new Date(loadedEnd).getTime()
      : now + 3 * MONTH_MS - SERVER_WINDOW_MARGIN_MS;
    loadedRef.current = [{ start, end }];
  }

  const visibleStartMs = visibleStart.getTime();
  const visibleEndMs = visibleEnd.getTime() + 24 * 60 * 60 * 1000 - 1; // inclusive day

  // Keep latest visible range in a ref so the realtime channel can refetch
  // it without being torn down on navigation.
  const visibleRangeRef = useRef({ start: visibleStartMs, end: visibleEndMs });
  visibleRangeRef.current = { start: visibleStartMs, end: visibleEndMs };

  useEffect(() => {
    if (!teamId) return;
    const loaded = loadedRef.current ?? [];
    const force = forceRefetchRef.current;
    forceRefetchRef.current = false;
    if (!force && isRangeCovered(loaded, visibleStartMs, visibleEndMs)) return;

    const fetchStart = new Date(visibleStartMs - FETCH_BUFFER_MS);
    const fetchEnd = new Date(visibleEndMs + FETCH_BUFFER_MS);

    let cancelled = false;
    const abortController = new AbortController();
    fetchEpochRef.current += 1;
    const myEpoch = fetchEpochRef.current;
    const isStale = () => cancelled || fetchEpochRef.current !== myEpoch;

    setIsLoadingRange(true);
    setRangeError(null);

    void (async () => {
      try {
        const supabase = createClient();
        // Paginate past the PostgREST 1000-row server cap (audit F102): a busy
        // team's ±1-month buffered window can exceed a single page, and a bare
        // `.limit(500)` silently dropped the overflow. A secondary `.order('id')`
        // gives a STABLE page boundary so rows can't drift or repeat across pages.
        const { data, error } = await fetchAllRowsResult<GolfEventRangeRow>((from, to) =>
          supabase
            .from('golf_events')
            .select(CALENDAR_EVENT_COLUMNS)
            .abortSignal(abortController.signal)
            .eq('team_id', teamId)
            .gte('start_time', fetchStart.toISOString())
            .lte('start_time', fetchEnd.toISOString())
            .order('start_time', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        );

        // Request-epoch guard (#37/#166/#185/#83 mustFix #1): an older
        // in-flight fetch resolving AFTER a newer one was dispatched must
        // never win — check before touching any state.
        if (isStale()) return;
        if (error) {
          setRangeError('Could not load events for this date range.');
          return;
        }

        const rows = data ?? [];
        genRef.current += 1;
        const gen = genRef.current;
        setEventVersions((prev) => {
          const next = new Map(prev);
          for (const row of rows) {
            next.set(row.id, { event: mapGolfEventRow(row), gen });
          }
          return next;
        });
        loadedRef.current = mergeIntervals([
          ...(loadedRef.current ?? []),
          { start: fetchStart.getTime(), end: fetchEnd.getTime() },
        ]);
      } catch {
        if (!isStale()) {
          setRangeError('Could not load events for this date range.');
        }
      } finally {
        if (!isStale()) setIsLoadingRange(false);
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [teamId, visibleStartMs, visibleEndMs, fetchNonce]);

  const retryRange = useCallback(() => {
    forceRefetchRef.current = true;
    setFetchNonce((n) => n + 1);
  }, []);

  const refetchVisibleRange = useCallback(() => {
    forceRefetchRef.current = true;
    setFetchNonce((n) => n + 1);
  }, []);

  // ── Stable realtime channel — deps are [teamId, realtime] ONLY. ───────────
  const onRealtimeEventRef = useRef(onRealtimeEvent);
  onRealtimeEventRef.current = onRealtimeEvent;
  const refetchVisibleRangeRef = useRef(refetchVisibleRange);
  refetchVisibleRangeRef.current = refetchVisibleRange;

  // Unique per-mount suffix: two calendar surfaces can be mounted at once
  // (e.g. the Fairway shell hosting the legacy grid) — identical topic names
  // on the same client would double-join one topic.
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    if (!realtime || !teamId) return;

    const supabase = createClient();
    let hasSubscribedBefore = false;
    const channel = supabase
      .channel(`calendar-events-${teamId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_events',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          onRealtimeEventRef.current?.();
          // Keep client-fetched (outside-window) ranges fresh too.
          refetchVisibleRangeRef.current();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedBefore) {
            // Reconnected after a gap — events may have been missed while the
            // socket was down. Refresh the server payload AND the visible range.
            onRealtimeEventRef.current?.();
            refetchVisibleRangeRef.current();
          }
          hasSubscribedBefore = true;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtime, teamId, instanceId]);

  const events = useMemo(() => {
    // Whichever source (server payload or client range fetch) most recently
    // observed a given event id wins — see the `eventVersions` doc comment
    // above for why "server always wins" was itself the bug.
    return Array.from(eventVersions.values())
      .map((v) => v.event)
      .sort((a, b) => {
        const aT = new Date(a.start_time || a.start_date).getTime();
        const bT = new Date(b.start_time || b.start_date).getTime();
        return aT - bT;
      });
  }, [eventVersions]);

  return { events, isLoadingRange, rangeError, retryRange, refetchVisibleRange };
}
