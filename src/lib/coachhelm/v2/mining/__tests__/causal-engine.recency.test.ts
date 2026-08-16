import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression guard: the causal engine must analyse a player's MOST RECENT
// rounds, and must hand them to computeDaysSinceLast in ASCENDING order.
//
// The load used `.order('round_date', { ascending: true }).limit(100)`, which
// selects the OLDEST 100 rounds. At 100 rounds a player's causal analysis
// freezes on their earliest data and never updates again — silently, because
// the engine keeps running and keeps writing rows.
//
// The two halves are coupled, which is why one test covers both:
// `computeDaysSinceLast` reads `rounds[index - 1]` as the PREVIOUS round and
// computes `curr - prev`. Flipping the sort to descending alone would make
// every `days_since_last` NEGATIVE, and that value feeds the causal-strength
// maths — a silent corruption strictly worse than the staleness being fixed.
// So the contract is: fetch newest-first, then reverse back to chronological.
//
// The stub below deliberately SIMULATES Postgres — it applies whatever
// order/limit the engine actually asks for to a 101-round fixture. A stub that
// just returned a canned array would pass regardless of the query, which is
// the failure mode this test exists to catch.
// ---------------------------------------------------------------------------

/**
 * Intersected with `Record<string, unknown>` so the fixture is assignable to
 * the stub's generic row store — the stub sorts by an arbitrary column name,
 * so it must index rows dynamically.
 */
type FixtureRound = Record<string, unknown> & {
  id: string;
  score_to_par: number;
  round_date: string;
  total_putts: number;
  total_fairways_hit: number;
  total_gir: number;
};

const TOTAL_ROUNDS = 101;

/** 101 rounds, one per day from 2020-01-01. Index 0 = oldest, 100 = newest. */
function buildFixture(): FixtureRound[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
    const day = new Date(Date.UTC(2020, 0, 1 + i));
    return {
      id: `round-${String(i).padStart(3, '0')}`,
      // Varying values so the hypothesis tests have something to correlate on.
      score_to_par: (i % 7) - 3,
      round_date: day.toISOString().slice(0, 10),
      total_putts: 28 + (i % 5),
      total_fairways_hit: 7 + (i % 4),
      total_gir: 9 + (i % 6),
    };
  });
}

const { state, adminFromMock } = vi.hoisted(() => {
  const state = {
    fixture: [] as Array<Record<string, unknown>>,
    lastOrder: null as { column: string; ascending: boolean } | null,
    lastLimit: null as number | null,
  };

  function makeRoundsBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = (column: string, opts?: { ascending?: boolean }) => {
      state.lastOrder = { column, ascending: opts?.ascending !== false };
      return builder;
    };
    builder.limit = (n: number) => {
      state.lastLimit = n;
      return builder;
    };
    // Apply the recorded order + limit the way Postgres would.
    builder.then = (
      resolve: (v: { data: unknown; error: null }) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      let rows = [...state.fixture];
      if (state.lastOrder) {
        const col = state.lastOrder.column;
        rows.sort((a, b) => {
          const av = String((a as Record<string, unknown>)[col]);
          const bv = String((b as Record<string, unknown>)[col]);
          return state.lastOrder!.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (state.lastLimit !== null) rows = rows.slice(0, state.lastLimit);
      return Promise.resolve({ data: rows, error: null as null }).then(resolve, reject);
    };
    return builder;
  }

  /** Writes (saveRelationships) are swallowed — this test is about the read. */
  function makeWriteBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.insert = () => Promise.resolve({ error: null });
    builder.update = () => builder;
    builder.delete = () => builder;
    builder.eq = () => builder;
    builder.not = () => builder;
    builder.limit = () => builder;
    builder.order = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    builder.then = (resolve: (v: { error: null }) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ error: null as null }).then(resolve, reject);
    return builder;
  }

  const adminFromMock = vi.fn((table: string) =>
    table === 'golf_rounds' ? makeRoundsBuilder() : makeWriteBuilder(),
  );
  return { state, adminFromMock };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { CausalEngine } from '@/lib/coachhelm/v2/mining/causal-engine';

/** The engine keeps its analysed set private; read it for a white-box assert. */
interface EngineInternals {
  rounds: Array<{ id: string; round_date: string; days_since_last?: number }>;
}

describe('CausalEngine — analyses the most RECENT rounds', () => {
  beforeEach(() => {
    state.fixture = buildFixture();
    state.lastOrder = null;
    state.lastLimit = null;
    adminFromMock.mockClear();
  });

  it('selects the newest 100 rounds, not the oldest 100', async () => {
    const engine = new CausalEngine('player-1', 'team-1');
    await engine.discoverCausalRelationships();

    const analysed = (engine as unknown as EngineInternals).rounds;
    expect(analysed).toHaveLength(100);

    const ids = analysed.map((r) => r.id);
    // round-000 is the oldest of 101 and must be the ONE that drops out.
    expect(ids).not.toContain('round-000');
    // round-100 is the newest and must be present.
    expect(ids).toContain('round-100');
  });

  it('hands rounds to computeDaysSinceLast in ascending date order', async () => {
    const engine = new CausalEngine('player-1', 'team-1');
    await engine.discoverCausalRelationships();

    const analysed = (engine as unknown as EngineInternals).rounds;

    // Chronological order is the contract computeDaysSinceLast depends on.
    const dates = analysed.map((r) => r.round_date);
    expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates);

    // And therefore every gap is non-negative. A descending array would make
    // all of these -1, which would corrupt the causal-strength maths silently.
    const gaps = analysed.slice(1).map((r) => r.days_since_last ?? 0);
    expect(gaps.every((g) => g >= 0)).toBe(true);
    expect(Math.min(...gaps)).toBe(1);
  });
});
