import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit row 16 (2026-09-28): conditional patterns (pattern_detected).
//   - the first round of the window was given days_since_last 0, so it always
//     counted as "back-to-back";
//   - the baseline INCLUDED the matching rounds (diluting every impact);
//   - |impact| >= 0.6 alone admitted a pattern at any sample size;
//   - a player whose patterns all stopped reproducing never had them retired.

const { roundRows, supersedeChain, fromUntypedMock } = vi.hoisted(() => {
  const roundRows: { rows: Array<Record<string, unknown>> } = { rows: [] };
  interface Chain {
    update: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    not: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
  }
  const supersedeChain = {} as Chain;
  supersedeChain.update = vi.fn(() => supersedeChain);
  supersedeChain.in = vi.fn(() => supersedeChain);
  supersedeChain.eq = vi.fn(() => supersedeChain);
  supersedeChain.not = vi.fn(() => supersedeChain);
  supersedeChain.or = vi.fn(async () => ({ error: null }));
  const fromUntypedMock = vi.fn(() => supersedeChain);
  return { roundRows, supersedeChain, fromUntypedMock };
});

function roundsQuery() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order']) b[m] = vi.fn(() => b);
  b.limit = vi.fn(async () => ({ data: roundRows.rows, error: null }));
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'golf_rounds'
        ? roundsQuery()
        : {
            select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [] })) })),
            upsert: vi.fn(async () => ({ error: null })),
          },
  }),
}));
vi.mock('@/lib/supabase/untyped', () => ({ fromUntyped: fromUntypedMock }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v2/features', () => ({ extractAllFeatures: vi.fn(async () => ({})) }));

const { PatternMiner } = await import('@/lib/coachhelm/v2/mining/pattern-miner');

type Round = { id: string; score_to_par: number; round_date: string; round_type?: string | null; days_since_last?: number };
type Internals = {
  rounds: Round[];
  computeDaysSinceLast: (r: Round[]) => Round[];
  mineConditionalPatterns: () => Promise<Array<{ conditions: Array<{ field: string; value: unknown }>; strokeImpact: number }>>;
};

function day(i: number): string {
  return new Date(Date.UTC(2026, 6, 1) + i * 86400_000).toISOString().slice(0, 10);
}

/** Rounds spaced `gap` days apart with the given types and to-par values. */
function series(spec: Array<[string, number]>, gap = 3): Round[] {
  return spec.map(([round_type, score_to_par], i) => ({
    id: `r${i}`, round_type, score_to_par, round_date: day(i * gap),
  }));
}

function minerWith(rounds: Round[]): Internals {
  const m = new PatternMiner('player-1') as unknown as Internals;
  m.rounds = m.computeDaysSinceLast(rounds);
  return m;
}

describe('audit row 16 — conditional pattern statistics', () => {
  it('the first round of the window has no days_since_last and is not "back-to-back"', () => {
    const m = minerWith(series([['practice', 0], ['practice', 1], ['practice', 2]], 10));
    expect(m.rounds[0]!.days_since_last).toBeUndefined();
    expect(m.rounds[1]!.days_since_last).toBe(10);
  });

  it('compares the matching rounds with the REST of the rounds, not a baseline that includes them', async () => {
    // 4 tournaments at mean +6, 8 practice rounds at mean 0.
    // Old: 6 − overall mean 2 = +4. Rest-of-rounds: 6 − 0 = +6.
    const m = minerWith(series([
      ['tournament', 5], ['practice', -1], ['practice', 1], ['tournament', 7],
      ['practice', -1], ['practice', 1], ['tournament', 5], ['practice', -1],
      ['practice', 1], ['tournament', 7], ['practice', -1], ['practice', 1],
    ]));
    const patterns = await m.mineConditionalPatterns();
    const t = patterns.find((p) => p.conditions[0]!.value === 'tournament');
    expect(t).toBeDefined();
    expect(t!.strokeImpact).toBeCloseTo(6, 5);
  });

  it('drops a gap that is not significant at its sample size (Welch t)', async () => {
    // Tournaments [10, −6, 8, −4] mean +2 vs practice mean 0: a 2-stroke gap
    // that the old |impact| >= 0.6 gate admitted, but SE ≈ 4 strokes.
    const m = minerWith(series([
      ['tournament', 10], ['practice', 0], ['practice', 1], ['tournament', -6],
      ['practice', -1], ['practice', 0], ['tournament', 8], ['practice', 2],
      ['practice', -2], ['tournament', -4], ['practice', 1], ['practice', -1],
    ]));
    const patterns = await m.mineConditionalPatterns();
    expect(patterns.find((p) => p.conditions[0]!.value === 'tournament')).toBeUndefined();
  });

  it('keeps the sign: a favourable condition is stored with a negative impact', async () => {
    const m = minerWith(series([
      ['tournament', -5], ['practice', -1], ['practice', 1], ['tournament', -7],
      ['practice', -1], ['practice', 1], ['tournament', -5], ['practice', -1],
      ['practice', 1], ['tournament', -7], ['practice', -1], ['practice', 1],
    ]));
    const patterns = await m.mineConditionalPatterns();
    const t = patterns.find((p) => p.conditions[0]!.value === 'tournament');
    expect(t!.strokeImpact).toBeCloseTo(-6, 5);
  });
});

describe('audit row 16 — stale patterns are retired when nothing reproduces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roundRows.rows = [];
  });

  const countable = (i: number, toPar: number) => ({
    id: `x${i}`, score_to_par: toPar, round_date: day(i * 3), round_type: 'practice',
    holes_played: 18, total_score: 72 + toPar, front_nine: 36, back_nine: 36 + toPar, total_putts: null,
  });

  it('a mine that finds no pattern retires every active mined pattern for the player', async () => {
    roundRows.rows = Array.from({ length: 8 }, (_, i) => countable(i, 2));
    const out = await new PatternMiner('player-1').minePatterns();
    expect(out).toEqual([]);
    expect(fromUntypedMock).toHaveBeenCalledWith(expect.anything(), 'golf_patterns_v2');
    expect(supersedeChain.in).toHaveBeenCalledWith('player_id', ['player-1']);
    // Nothing fresh to keep → no `not in ()` clause (which PostgREST rejects).
    expect(supersedeChain.not).not.toHaveBeenCalled();
    expect(supersedeChain.or).toHaveBeenCalledTimes(1);
  });

  it('a player below the round floor also has stale patterns retired', async () => {
    roundRows.rows = [countable(0, 1), countable(1, 3)];
    await new PatternMiner('player-1').minePatterns();
    expect(supersedeChain.in).toHaveBeenCalledWith('player_id', ['player-1']);
  });
});
