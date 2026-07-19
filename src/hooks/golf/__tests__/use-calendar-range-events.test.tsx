/**
 * useCalendarRangeEvents — range-driven calendar fetching.
 *
 * Covers the audit's P1 #9 (fixed ±3-month window never refetched on
 * navigation) and P2 #20 (fetch errors must surface as a retryable error
 * state, not an empty calendar):
 *  - visible range inside the server-loaded window → NO client fetch
 *  - navigating outside the loaded window → fetches that range and merges
 *  - fetch failure → rangeError set; retryRange refetches and recovers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import {
  useCalendarRangeEvents,
  mergeIntervals,
  isRangeCovered,
  mapGolfEventRow,
} from '../use-calendar-range-events';

// ── Supabase client mock — chainable query builder, thenable at the end ─────
interface QueryRecord {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

const queryLog: QueryRecord[] = [];
let nextResults: Array<{ data: unknown[] | null; error: { message: string } | null }> = [];

function makeChain(record: QueryRecord) {
  const result = nextResults.shift() ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'neq',
    'gte',
    'lte',
    'order',
    'limit',
    'range',
    'abortSignal',
  ]) {
    chain[method] = (...args: unknown[]) => {
      record.calls.push({ method, args });
      return chain;
    };
  }
  (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => {
    resolve(result);
  };
  return chain;
}

/**
 * Deferred query — a chain whose `.then()` doesn't settle until the test
 * explicitly calls `resolve(...)`. Used to prove two overlapping fetches
 * resolve OUT OF ORDER without the result the test doesn't want winning.
 */
function deferredChain(record: QueryRecord) {
  let resolveFn!: (v: { data: unknown[] | null; error: { message: string } | null }) => void;
  const promise = new Promise<{ data: unknown[] | null; error: { message: string } | null }>(
    (res) => {
      resolveFn = res;
    },
  );
  const chain: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'neq',
    'gte',
    'lte',
    'order',
    'limit',
    'range',
    'abortSignal',
  ]) {
    chain[method] = (...args: unknown[]) => {
      record.calls.push({ method, args });
      return chain;
    };
  }
  (chain as { then: (resolve: (v: unknown) => void) => Promise<unknown> }).then = (resolve) =>
    promise.then(resolve);
  return { chain, resolve: resolveFn };
}

/**
 * Queue of pending "resolve" callbacks captured as each deferred query is
 * built, in the order `from().select()...` is actually called (FIFO) — a
 * test enqueues a slot, waits for the dispatch it cares about to happen, then
 * resolves in whatever order it wants to prove is safe.
 */
let deferredResolvers: Array<(v: { data: unknown[] | null; error: { message: string } | null }) => void> = [];
let useDeferredForNextN = 0;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const record: QueryRecord = { table, calls: [] };
      queryLog.push(record);
      if (useDeferredForNextN > 0) {
        useDeferredForNextN -= 1;
        const { chain, resolve } = deferredChain(record);
        deferredResolvers.push(resolve);
        return chain;
      }
      return makeChain(record);
    },
    channel: () => {
      const channelStub = {
        on: () => channelStub,
        subscribe: () => channelStub,
      };
      return channelStub;
    },
    removeChannel: () => undefined,
  }),
}));

function makeEvent(id: string, startIso: string): CalendarEvent {
  return {
    id,
    team_id: 'team-1',
    title: `Event ${id}`,
    event_type: 'practice',
    start_date: startIso,
    end_date: startIso,
    start_time: startIso,
    end_time: startIso,
    location: null,
    description: null,
  };
}

function makeRow(id: string, startIso: string) {
  return {
    id,
    team_id: 'team-1',
    title: `Event ${id}`,
    event_type: 'practice',
    start_time: startIso,
    end_time: null,
    location: null,
    description: null,
    status: null,
    all_day: false,
    created_by: null,
    requires_rsvp: false,
    rsvp_deadline: null,
    max_attendees: null,
    parent_event_id: null,
    recurrence_rule: null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('useCalendarRangeEvents', () => {
  beforeEach(() => {
    queryLog.length = 0;
    nextResults = [];
    deferredResolvers = [];
    useDeferredForNextN = 0;
  });

  it('does NOT fetch when the visible range is inside the server-loaded window', async () => {
    const now = Date.now();
    const initialEvents = [makeEvent('a', new Date(now).toISOString())];

    const { result } = renderHook(() =>
      useCalendarRangeEvents({
        teamId: 'team-1',
        initialEvents,
        visibleStart: new Date(now),
        visibleEnd: new Date(now + 6 * DAY_MS),
        loadedStart: new Date(now - 90 * DAY_MS).toISOString(),
        loadedEnd: new Date(now + 90 * DAY_MS).toISOString(),
      }),
    );

    // Give effects a tick to (not) run.
    await act(async () => {});
    expect(queryLog).toHaveLength(0);
    expect(result.current.events).toEqual(initialEvents);
    expect(result.current.isLoadingRange).toBe(false);
    expect(result.current.rangeError).toBeNull();
  });

  it('fetches the range when navigation leaves the loaded window, and merges results', async () => {
    const now = Date.now();
    const farFuture = now + 150 * DAY_MS; // ~5 months ahead — outside ±90d
    const fetchedIso = new Date(farFuture + DAY_MS).toISOString();
    nextResults = [{ data: [makeRow('remote-1', fetchedIso)], error: null }];

    const initialEvents = [makeEvent('a', new Date(now).toISOString())];
    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useCalendarRangeEvents({
          teamId: 'team-1',
          initialEvents,
          visibleStart: start,
          visibleEnd: end,
          loadedStart: new Date(now - 90 * DAY_MS).toISOString(),
          loadedEnd: new Date(now + 90 * DAY_MS).toISOString(),
        }),
      { initialProps: { start: new Date(now), end: new Date(now + 6 * DAY_MS) } },
    );

    await act(async () => {});
    expect(queryLog).toHaveLength(0);

    // Navigate ~5 months ahead — outside the loaded window.
    rerender({ start: new Date(farFuture), end: new Date(farFuture + 6 * DAY_MS) });

    await waitFor(() => {
      expect(result.current.events.some((e) => e.id === 'remote-1')).toBe(true);
    });

    // The query targeted golf_events for the right team with a windowed range.
    expect(queryLog).toHaveLength(1);
    const record = queryLog[0]!;
    expect(record.table).toBe('golf_events');
    const select = record.calls.find((c) => c.method === 'select');
    expect(String(select?.args[0])).toContain('parent_event_id');
    expect(String(select?.args[0])).toContain('recurrence_rule');
    const eq = record.calls.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['team_id', 'team-1']);
    const gte = record.calls.find((c) => c.method === 'gte');
    const lte = record.calls.find((c) => c.method === 'lte');
    // Buffered window must cover the visible range.
    expect(new Date(String(gte?.args[1])).getTime()).toBeLessThanOrEqual(farFuture);
    expect(new Date(String(lte?.args[1])).getTime()).toBeGreaterThanOrEqual(farFuture + 6 * DAY_MS);
    // Cancelled events are NOT excluded — they render distinctly instead.
    expect(record.calls.some((c) => c.method === 'neq')).toBe(false);

    // Both the server payload and the fetched row are present, sorted.
    expect(result.current.events.map((e) => e.id)).toEqual(['a', 'remote-1']);
    expect(result.current.rangeError).toBeNull();

    // Navigating back into the (now-extended) loaded window does not refetch.
    rerender({ start: new Date(farFuture), end: new Date(farFuture + 6 * DAY_MS) });
    await act(async () => {});
    expect(queryLog).toHaveLength(1);
  });

  it('surfaces a retryable error on fetch failure, and retryRange recovers', async () => {
    const now = Date.now();
    const farFuture = now + 150 * DAY_MS;
    nextResults = [
      { data: null, error: { message: 'network down' } },
      { data: [makeRow('recovered', new Date(farFuture).toISOString())], error: null },
    ];

    const { result } = renderHook(() =>
      useCalendarRangeEvents({
        teamId: 'team-1',
        initialEvents: [],
        visibleStart: new Date(farFuture),
        visibleEnd: new Date(farFuture + 6 * DAY_MS),
        loadedStart: new Date(now - 90 * DAY_MS).toISOString(),
        loadedEnd: new Date(now + 90 * DAY_MS).toISOString(),
      }),
    );

    await waitFor(() => {
      expect(result.current.rangeError).not.toBeNull();
    });
    expect(result.current.isLoadingRange).toBe(false);
    expect(result.current.events).toEqual([]);

    act(() => {
      result.current.retryRange();
    });

    await waitFor(() => {
      expect(result.current.events.map((e) => e.id)).toEqual(['recovered']);
    });
    expect(result.current.rangeError).toBeNull();
    expect(queryLog).toHaveLength(2);
  });

  it('disables fetching entirely without a teamId', async () => {
    const now = Date.now();
    const { result } = renderHook(() =>
      useCalendarRangeEvents({
        teamId: null,
        initialEvents: [],
        visibleStart: new Date(now + 200 * DAY_MS),
        visibleEnd: new Date(now + 206 * DAY_MS),
      }),
    );
    await act(async () => {});
    expect(queryLog).toHaveLength(0);
    expect(result.current.events).toEqual([]);
  });

  // ── mustFix #1: root-cause the times/counts flip ──────────────────────────
  it('never lets a fresh client-fetched row be discarded in favor of an unchanged, stale server payload (#37/#166/#185/#83)', async () => {
    // Reproduces the exact reported symptom: `initialEvents` is a page render
    // that can be up to 30s stale, while this hook's own range fetch reads
    // golf_events live. The OLD "server payload always wins on id ties" rule
    // meant a just-edited event's time could flip back to the stale value on
    // every render as long as `initialEvents` hadn't ALSO been refreshed —
    // even though the fresher client fetch already landed.
    const now = Date.now();
    const staleIso = new Date(now).toISOString(); // what the page rendered
    const freshIso = new Date(now + 3 * 60 * 60 * 1000).toISOString(); // rescheduled +3h, per a live DB read
    const farFuture = now + 150 * DAY_MS;

    // The client fetch's buffered window covers 'a' too (±1 month buffer
    // around the visible range easily reaches back to `now`+3h in this test;
    // what matters is the row for id 'a' the fetch itself returns).
    nextResults = [{ data: [makeRow('a', freshIso)], error: null }];

    const initialEvents = [makeEvent('a', staleIso)];
    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useCalendarRangeEvents({
          teamId: 'team-1',
          initialEvents, // SAME reference for the whole test — no router.refresh() happens
          visibleStart: start,
          visibleEnd: end,
          loadedStart: new Date(now - 90 * DAY_MS).toISOString(),
          loadedEnd: new Date(now + 90 * DAY_MS).toISOString(),
        }),
      { initialProps: { start: new Date(now), end: new Date(now + 6 * DAY_MS) } },
    );

    expect(result.current.events.find((e) => e.id === 'a')?.start_time).toBe(staleIso);

    // Navigate outside the loaded window — dispatches the live client fetch.
    rerender({ start: new Date(farFuture), end: new Date(farFuture + 6 * DAY_MS) });

    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === 'a')?.start_time).toBe(freshIso);
    });
    // `initialEvents` never changed — the fresh fetch's value must stick,
    // not get silently reset back to the stale prop on the next render.
    rerender({ start: new Date(farFuture), end: new Date(farFuture + 6 * DAY_MS) });
    expect(result.current.events.find((e) => e.id === 'a')?.start_time).toBe(freshIso);
  });

  it('an older in-flight fetch response can never overwrite a newer one (request-epoch guard)', async () => {
    const now = Date.now();
    const rangeAStart = now + 150 * DAY_MS;
    const rangeBStart = now + 300 * DAY_MS;

    useDeferredForNextN = 2;

    const { result, rerender } = renderHook(
      ({ start, end }: { start: Date; end: Date }) =>
        useCalendarRangeEvents({
          teamId: 'team-1',
          initialEvents: [],
          visibleStart: start,
          visibleEnd: end,
          loadedStart: new Date(now - 90 * DAY_MS).toISOString(),
          loadedEnd: new Date(now + 90 * DAY_MS).toISOString(),
        }),
      { initialProps: { start: new Date(rangeAStart), end: new Date(rangeAStart + 6 * DAY_MS) } },
    );

    await waitFor(() => expect(deferredResolvers).toHaveLength(1)); // fetch A dispatched

    // Navigate to a second, non-overlapping range BEFORE fetch A resolves —
    // this is the "two overlapping range fetches" scenario: A is still
    // in-flight when B is dispatched.
    rerender({ start: new Date(rangeBStart), end: new Date(rangeBStart + 6 * DAY_MS) });
    await waitFor(() => expect(deferredResolvers).toHaveLength(2)); // fetch B dispatched

    const resolveA = deferredResolvers[0]!;
    const resolveB = deferredResolvers[1]!;

    // Resolve OUT OF ORDER: the NEWER request (B) lands first, then the
    // OLDER, now-superseded request (A) finally resolves with conflicting
    // data for the same id.
    await act(async () => {
      resolveB({ data: [makeRow('x', new Date(rangeBStart).toISOString())], error: null });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.events.some((e) => e.id === 'x')).toBe(true);
    });

    await act(async () => {
      resolveA({ data: [makeRow('x', new Date(rangeAStart).toISOString())], error: null });
      await Promise.resolve();
    });

    // B's result must still be what's rendered — A's late arrival (for a
    // range the user has already navigated away from) must never win.
    expect(result.current.events.find((e) => e.id === 'x')?.start_time).toBe(
      new Date(rangeBStart).toISOString(),
    );
    expect(result.current.isLoadingRange).toBe(false);
    expect(result.current.rangeError).toBeNull();
  });
});

describe('interval helpers', () => {
  it('mergeIntervals collapses overlapping spans', () => {
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 5, end: 20 },
        { start: 30, end: 40 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it('isRangeCovered requires a single covering interval', () => {
    const intervals = [
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ];
    expect(isRangeCovered(intervals, 5, 15)).toBe(true);
    expect(isRangeCovered(intervals, 15, 35)).toBe(false);
  });
});

describe('mapGolfEventRow', () => {
  it('normalizes all-day events to local midnight and carries series fields', () => {
    const mapped = mapGolfEventRow({
      id: 'x',
      team_id: 't',
      title: 'Camp',
      event_type: 'practice',
      start_time: '2026-03-07T00:00:00+00:00',
      end_time: null,
      location: null,
      description: null,
      status: 'cancelled',
      all_day: true,
      created_by: null,
      requires_rsvp: null,
      rsvp_deadline: null,
      max_attendees: null,
      parent_event_id: 'root-1',
      recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10',
    });
    expect(mapped.start_date).toBe('2026-03-07T00:00:00');
    expect(mapped.status).toBe('cancelled');
    expect(mapped.parent_event_id).toBe('root-1');
    expect(mapped.recurrence_rule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10');
    expect(mapped.requires_rsvp).toBe(false);
  });
});
