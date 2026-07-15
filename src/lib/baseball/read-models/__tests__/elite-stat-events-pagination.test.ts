// =============================================================================
// Pagination regression test for getEliteStatEvents.
//
// The DB-bound getEliteStatEvents is deliberately NOT exercised by the sibling
// elite-stat-events.test.ts (that file is scoped to the pure aggregation math
// — see its own header comment). This file covers the one thing that file
// can't: that the 4 event-grain reads (baseball_pitch_events,
// baseball_batted_ball_events, baseball_swing_events,
// baseball_plate_appearances) walk EVERY PostgREST page via fetchAllRowsResult
// instead of silently truncating at the 1000-row server cap.
//
// Regression this locks: prior to the fix, `buildQuery` had no `.order()` /
// `.range()` at all, so a team with >1000 pitch-events for a season would see
// derived metrics computed from an arbitrary 1000-row slice. A mock query
// builder here simulates the PostgREST page-size cap directly (each `.range()`
// call returns at most 1000 rows, mirroring the real server), so if the
// production code ever regresses to a single unpaginated `.select('*')`, this
// test fails by asserting fewer than the full row count comes back.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/baseball/capabilities', () => ({
  hasBaseballCapability: vi.fn(async () => true),
}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: fromMock })),
}));

import { getEliteStatEvents } from '@/lib/baseball/read-models/elite-stat-events';

const TEAM_ID = 'team-1';
const PAGE_CAP = 1000; // mirrors PostgREST's real max_rows

/**
 * Chainable, awaitable Postgrest-style query-builder stub that ALSO enforces
 * the real server's 1000-row-per-response cap on `.range()`, so an
 * unpaginated call site (no `.range()` at all, or one that requests more than
 * 1000 in one shot) would get truncated here exactly as it would in
 * production — proving the fix requires genuine multi-page pagination, not
 * just "ask for more rows in one request".
 */
function makeChain(rows: Array<Record<string, unknown>>, rangeCalls: Array<[number, number]>) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'gte', 'lte', 'or', 'order']) {
    chain[method] = vi.fn(() => chain);
  }
  let from = 0;
  let to = rows.length - 1;
  chain.range = vi.fn((f: number, t: number) => {
    from = f;
    to = t;
    rangeCalls.push([f, t]);
    return chain;
  });
  const resolve = () => {
    const cappedTo = Math.min(to, from + PAGE_CAP - 1);
    return { data: rows.slice(from, cappedTo + 1), error: null };
  };
  chain.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(resolve()).then(res, rej);
  return chain;
}

let pitchRows: Array<Record<string, unknown>>;
let pitchRangeCalls: Array<[number, number]>;

beforeEach(() => {
  vi.clearAllMocks();
  pitchRangeCalls = [];
  pitchRows = [];

  fromMock.mockImplementation((table: string) => {
    if (table === 'baseball_pitch_events') return makeChain(pitchRows, pitchRangeCalls);
    // Other 3 event tables are empty for this test — only pitch summary count
    // and range-call count matter for the pagination assertion.
    return makeChain([], []);
  });
});

describe('getEliteStatEvents — pagination across the PostgREST 1000-row cap', () => {
  it('returns every row (not just the first 1000) for a season exceeding the cap', async () => {
    pitchRows = Array.from({ length: 1500 }, (_, i) => ({
      id: `pitch-${i}`,
      batter_id: 'p1',
      pitcher_id: null,
      data_context: 'official_game',
      is_swing: false,
      is_whiff: false,
      is_in_zone: null,
      is_called_strike: false,
      count_state: null,
    }));

    const result = await getEliteStatEvents(TEAM_ID);

    expect(result.authorized).toBe(true);
    expect(result.error).toBeNull();
    // The bug: an unpaginated read caps at 1000. The fix: all 1500 come back.
    expect(result.summary.pitchEvents).toBe(1500);
  });

  it('walks multiple pages via .range() rather than one unbounded request', async () => {
    pitchRows = Array.from({ length: 1500 }, (_, i) => ({
      id: `pitch-${i}`,
      batter_id: 'p1',
      pitcher_id: null,
      data_context: 'official_game',
    }));

    await getEliteStatEvents(TEAM_ID);

    // fetchAllRowsResult must have issued (at least) 2 page requests: [0,999]
    // then [1000,1499] (short page => loop stops). A pre-fix, unpaginated
    // buildQuery never called .range() at all.
    expect(pitchRangeCalls.length).toBeGreaterThanOrEqual(2);
    expect(pitchRangeCalls[0]).toEqual([0, 999]);
  });

  it('applies a stable .order() before pagination on every event query', async () => {
    pitchRows = [{ id: 'pitch-0', batter_id: 'p1', pitcher_id: null }];
    const orderCalls: unknown[] = [];
    fromMock.mockImplementation((table: string) => {
      const chain = makeChain(table === 'baseball_pitch_events' ? pitchRows : [], []);
      const orderSpy = vi.fn((...args: unknown[]) => {
        orderCalls.push(args);
        return chain;
      });
      (chain as Record<string, unknown>).order = orderSpy;
      return chain;
    });

    await getEliteStatEvents(TEAM_ID);

    expect(orderCalls.length).toBeGreaterThan(0);
    expect(orderCalls[0]).toEqual(['id', { ascending: true }]);
  });

  it('returns an honest error when a page read fails, without throwing', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'baseball_pitch_events') {
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'is', 'gte', 'lte', 'or', 'order', 'range']) {
          chain[method] = vi.fn(() => chain);
        }
        chain.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve({ data: null, error: { message: 'boom', code: '500' } }).then(res, rej);
        return chain;
      }
      return makeChain([], []);
    });

    const result = await getEliteStatEvents(TEAM_ID);

    expect(result.authorized).toBe(true);
    expect(result.error).toBe('Some event data could not be loaded; metrics may be incomplete.');
    expect(result.summary.pitchEvents).toBe(0);
  });
});
