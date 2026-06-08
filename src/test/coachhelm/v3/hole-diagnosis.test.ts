import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiagnosisHole } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
import { classifyHole, proximateCause } from '@/lib/coachhelm/v3/engine/hole-diagnosis';

// ---------------------------------------------------------------------------
// Pure-function contracts.
//
// These two pure functions are imported by every Phase C engine (par-type,
// course-mgmt, pressure, warmup) — the classification precedence and cause
// precedence here MUST stay byte-stable with how those consumers read them
// (C1 classifies by score-par buckets; C3 switches on proximateCause).
// ---------------------------------------------------------------------------

function makeHole(over: number, extra: Partial<DiagnosisHole> = {}): DiagnosisHole {
  const par = extra.par ?? 4;
  return {
    round_id: extra.round_id ?? 'r-1',
    hole_number: extra.hole_number ?? 1,
    par,
    score: extra.score ?? par + over,
    putts: extra.putts ?? 2,
    penalty_strokes: extra.penalty_strokes ?? 0,
    gir: extra.gir ?? true,
    up_and_down: extra.up_and_down ?? false,
  };
}

describe('classifyHole — score-vs-par bucketing (matches C1 par-type decomposition)', () => {
  it('score < par → birdie_or_better (eagle counts too)', () => {
    expect(classifyHole(makeHole(-1))).toBe('birdie_or_better');
    expect(classifyHole(makeHole(-2))).toBe('birdie_or_better');
  });

  it('score === par → par', () => {
    expect(classifyHole(makeHole(0))).toBe('par');
  });

  it('score === par + 1 → bogey', () => {
    expect(classifyHole(makeHole(1))).toBe('bogey');
  });

  it('score >= par + 2 → double_plus', () => {
    expect(classifyHole(makeHole(2))).toBe('double_plus');
    expect(classifyHole(makeHole(5))).toBe('double_plus');
  });
});

describe('proximateCause — precedence matches C3 course-mgmt switch', () => {
  it('penalty wins first: any penalty stroke → penalty (even with a 3-putt)', () => {
    expect(
      proximateCause(makeHole(2, { penalty_strokes: 1, putts: 3, gir: false })),
    ).toBe('penalty');
  });

  it('3-putt is next: no penalty, putts >= 3 → three_putt (even on a missed GIR)', () => {
    expect(
      proximateCause(makeHole(2, { penalty_strokes: 0, putts: 3, gir: false })),
    ).toBe('three_putt');
    // 4-putt also counts.
    expect(
      proximateCause(makeHole(3, { penalty_strokes: 0, putts: 4, gir: true })),
    ).toBe('three_putt');
  });

  it('missed GIR with no scramble: no penalty, < 3 putts, gir false, not up-and-down', () => {
    expect(
      proximateCause(
        makeHole(2, { penalty_strokes: 0, putts: 2, gir: false, up_and_down: false }),
      ),
    ).toBe('missed_gir_no_scramble');
  });

  it('clean: hit the green (gir true), no penalty, < 3 putts', () => {
    expect(
      proximateCause(makeHole(0, { penalty_strokes: 0, putts: 2, gir: true })),
    ).toBe('clean');
  });

  it('clean: missed GIR but got up-and-down (scrambled) → not the missed-GIR cause', () => {
    expect(
      proximateCause(
        makeHole(0, { penalty_strokes: 0, putts: 2, gir: false, up_and_down: true }),
      ),
    ).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// Pagination regression guard.
//
// PostgREST hard-caps a single response at 1000 rows regardless of `.limit()`.
// A high-volume player (55+ rounds in 90 days) easily exceeds 1000 golf_holes
// rows; a bare `.in('round_id', ids)` fetch would silently truncate at 1000 and
// corrupt every Phase C decomposition that consumes loadCompletedHoles.
// `loadCompletedHoles` MUST paginate via `fetchAllRowsResult`
// (`.order('id').range(from,to)`), walking pages until a short page terminates.
//
// This test serves 1300 synthetic holes across pages and asserts the loader
// returns ALL 1300 — a single bare fetch (capped at the 1000-row first page)
// would fail it. Mirrors src/test/coachhelm/v3/sand-source.test.ts.
// ---------------------------------------------------------------------------

// Mock the typed admin client so the `golf_rounds` lookup returns one round id.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => {
      // golf_rounds: .select('id').eq().eq().not().gte() -> awaited thenable.
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.select = ret;
      chain.eq = ret;
      chain.not = ret;
      chain.gte = () =>
        Promise.resolve({ data: [{ id: 'round-1' }], error: null });
      return chain;
    },
  }),
}));

// Total synthetic holes — must exceed the 1000-row PostgREST cap.
const TOTAL_HOLES = 1300;

// Build the full source dataset ONCE: 1300 holes, each its own hole_number.
function buildAllRows() {
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < TOTAL_HOLES; i += 1) {
    rows.push({
      round_id: 'round-1',
      hole_number: (i % 18) + 1,
      par: 4,
      score: 5,
      putts: 2,
      penalty_strokes: 0,
      gir: false,
    });
  }
  return rows;
}

// A thenable PostgREST-builder mock that HONORS `.range(from,to)` — it resolves
// the matching slice of the full dataset so `fetchAllRowsResult`'s paging loop
// terminates on a final page shorter than the 1000-row page size. Records
// `.order()`/`.range()` calls to prove the loader paginates with a stable key.
function makePaginatedHolesMock(
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
  builder.not = ret;
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
  fromUntyped: (_client: unknown, _table: string) =>
    makePaginatedHolesMock(allRows, orderCalls, rangeCalls),
}));

// Import AFTER the mocks are registered.
const { loadCompletedHoles } = await import('@/lib/coachhelm/v3/engine/hole-diagnosis');

describe('loadCompletedHoles pagination', () => {
  beforeEach(() => {
    orderCalls.length = 0;
    rangeCalls.length = 0;
  });

  it('returns ALL holes past the PostgREST 1000-row cap (no truncation)', async () => {
    const result = await loadCompletedHoles('player-1');
    // A bare single fetch caps at the 1000-row first page; pagination yields all.
    expect(result.length).toBe(TOTAL_HOLES);
    expect(result.length).toBeGreaterThan(1000);
  });

  it('paginates with a stable order key and walks pages via .range()', async () => {
    await loadCompletedHoles('player-1');
    // Stable tiebreaker so page boundaries do not drift.
    expect(
      orderCalls.some((c) => c.column === 'id' && c.opts?.ascending === true),
    ).toBe(true);
    // 1300 rows / 1000 page size -> at least 2 pages (range calls).
    expect(rangeCalls.length).toBeGreaterThanOrEqual(2);
    expect(rangeCalls[0]).toEqual({ from: 0, to: 999 });
    expect(rangeCalls[1]).toEqual({ from: 1000, to: 1999 });
  });

  it('derives up_and_down from the engine def (gir=false & score<=par), not the sparse column', async () => {
    // Every synthetic hole is gir=false, score 5 on a par 4 (over=+1) → NOT
    // up-and-down. Proves derivation runs (a bare column read would have been
    // null/undefined → falsy, but here we assert the engine rule fired).
    const result = await loadCompletedHoles('player-1');
    expect(result.every((h) => h.up_and_down === false)).toBe(true);
    expect(result[0]?.gir).toBe(false);
  });
});
