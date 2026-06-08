import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SandShot } from '@/lib/coachhelm/v3/engine/shot-source';

// Type-level + shape contract: SandShot must expose the fields the
// ScramblingGenerator's escape-vs-lag branch reads. (The DB-bound loader itself
// is covered by the ScramblingGenerator tests via a mock.)
describe('SandShot shape contract', () => {
  it('carries reached_green, leave_distance_feet, putts_after', () => {
    const s: SandShot = {
      round_id: 'r-1',
      hole_number: 3,
      reached_green: true,
      leave_distance_feet: 13.7,
      putts_after: 2,
    };
    expect(s.reached_green).toBe(true);
    expect(s.leave_distance_feet).toBeCloseTo(13.7);
    expect(s.putts_after).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pagination regression guard.
//
// PostgREST hard-caps a single response at 1000 rows regardless of `.limit()`.
// A high-volume player (14+ rounds in 90 days) easily exceeds 1000 golf_shots
// rows; a bare `.in('round_id', ids)` fetch would silently truncate at 1000 and
// corrupt the scrambling diagnosis. `loadSandShots` MUST paginate via
// `fetchAllRowsResult` (`.order('id').range(from,to)`), walking pages until a
// short page terminates the loop.
//
// This test serves 1300 synthetic SAND shots across pages and asserts the
// loader returns ALL 1300 — a single bare fetch (capped at the 1000-row first
// page) would fail it.
// ---------------------------------------------------------------------------

// Mock the typed admin client so the `golf_rounds` lookup returns one round id.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => {
      // golf_rounds: .select('id').eq().eq().gte() -> awaited thenable.
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.select = ret;
      chain.eq = ret;
      chain.gte = () =>
        Promise.resolve({ data: [{ id: 'round-1' }], error: null });
      return chain;
    },
  }),
}));

// Total synthetic sand shots — must exceed the 1000-row PostgREST cap.
const TOTAL_SAND_SHOTS = 1300;

// Build the full source dataset ONCE: 1300 sand shots, each its own hole so
// the putts_after inner-filter stays cheap and every row reaches the green.
function buildAllRows() {
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < TOTAL_SAND_SHOTS; i += 1) {
    rows.push({
      round_id: 'round-1',
      hole_number: i + 1,
      shot_number: 2,
      shot_type: 'around_green',
      lie_before: 'sand',
      lie_after: 'green',
      result: 'green',
      distance_to_hole_after: 13.7,
      distance_unit_after: 'feet',
    });
  }
  return rows;
}

// A thenable PostgREST-builder mock that HONORS `.range(from,to)` — it resolves
// the matching slice of the full dataset so `fetchAllRowsResult`'s paging loop
// terminates on a final page shorter than the 1000-row page size. Records
// `.order()`/`.range()` calls to prove the loader paginates with a stable key.
function makePaginatedShotsMock(
  allRows: Array<Record<string, unknown>>,
  orderCalls: Array<{ column: string; opts?: { ascending?: boolean } }>,
  rangeCalls: Array<{ from: number; to: number }>,
) {
  let pendingRange: { from: number; to: number } | null = null;

  const resolveSlice = () => {
    // An UNRANGED query hits PostgREST's real server-side 1000-row cap — so a
    // bare single `.in()` fetch (no `.range()`) gets only the first 1000 rows.
    // A ranged query returns exactly the requested slice. This is what makes the
    // truncation test genuine: only a loader that paginates via `.range()` walks
    // past 1000.
    const SERVER_MAX_ROWS = 1000;
    const slice =
      pendingRange != null
        ? allRows.slice(pendingRange.from, pendingRange.to + 1)
        : allRows.slice(0, SERVER_MAX_ROWS);
    pendingRange = null;
    return { data: slice, error: null as { message: string } | null };
  };

  const builder: Record<string, unknown> = {};
  const ret = () => builder;
  builder.select = ret;
  builder.eq = ret;
  builder.in = ret;
  builder.gte = ret;
  builder.order = (column: string, opts?: { ascending?: boolean }) => {
    orderCalls.push({ column, opts });
    return builder;
  };
  builder.range = (from: number, to: number) => {
    pendingRange = { from, to };
    rangeCalls.push({ from, to });
    return builder;
  };
  builder.then = (
    resolve: (v: {
      data: Array<Record<string, unknown>>;
      error: { message: string } | null;
    }) => void,
  ) => Promise.resolve(resolve(resolveSlice()));
  return builder;
}

const orderCalls: Array<{ column: string; opts?: { ascending?: boolean } }> = [];
const rangeCalls: Array<{ from: number; to: number }> = [];
const allRows = buildAllRows();

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: () => makePaginatedShotsMock(allRows, orderCalls, rangeCalls),
}));

// Import AFTER the mocks are registered.
const { loadSandShots } = await import('@/lib/coachhelm/v3/engine/shot-source');

describe('loadSandShots pagination', () => {
  beforeEach(() => {
    orderCalls.length = 0;
    rangeCalls.length = 0;
  });

  it('returns ALL sand shots past the PostgREST 1000-row cap (no truncation)', async () => {
    const result = await loadSandShots('player-1');
    // A bare single fetch caps at the 1000-row first page; pagination yields all.
    expect(result.length).toBe(TOTAL_SAND_SHOTS);
    expect(result.length).toBeGreaterThan(1000);
    // Every synthetic shot reached the green at 13.7 ft with 0 putts after.
    expect(result.every((s) => s.reached_green === true)).toBe(true);
    expect(result[0]?.leave_distance_feet).toBeCloseTo(13.7);
  });

  it('paginates with a stable order key and walks pages via .range()', async () => {
    await loadSandShots('player-1');
    // Stable tiebreaker so page boundaries do not drift.
    expect(
      orderCalls.some((c) => c.column === 'id' && c.opts?.ascending === true),
    ).toBe(true);
    // 1300 rows / 1000 page size -> at least 2 pages (range calls).
    expect(rangeCalls.length).toBeGreaterThanOrEqual(2);
    expect(rangeCalls[0]).toEqual({ from: 0, to: 999 });
    expect(rangeCalls[1]).toEqual({ from: 1000, to: 1999 });
  });
});
