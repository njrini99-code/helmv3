import { describe, it, expect, vi, beforeEach } from 'vitest';

// pb-1: aggregate() now reads golf_shots (shot_type='putting', putt_break +
// putt_made) directly — the old cache columns are 100% NULL in prod. Mock the
// admin client's `.from(table)` so we can drive the shot-level read.
type Row = Record<string, unknown>;
let roundsRows: Row[] = [];
let puttRows: Row[] = [];

function makeBuilder(rows: Row[]) {
  // Every chained filter returns the builder; awaiting it yields {data,error}.
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'in']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      makeBuilder(table === 'golf_rounds' ? roundsRows : puttRows),
  }),
}));

import { PuttBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-bias';

const PLAYER_ID = 'p-1';

/** Build N putting shots of a given break with `made` of them holed. */
function putts(
  putt_break: string,
  attempts: number,
  made: number,
  round_id = 'r-1',
): Row[] {
  return Array.from({ length: attempts }, (_, i) => ({
    round_id,
    putt_break,
    putt_made: i < made,
  }));
}

function makeAgg(overrides: Partial<{
  weakest: 'left' | 'right' | 'straight';
  weakest_pct: number;
  straight_pct: number;
  rounds_played: number;
}> = {}) {
  return {
    sampleN: overrides.rounds_played ?? 20,
    playerValue: overrides.weakest_pct ?? 28,
    weakest_direction: overrides.weakest ?? 'left' as const,
    straight_pct: overrides.straight_pct ?? 38,
    weakest_pct: overrides.weakest_pct ?? 28,
    rounds_played: overrides.rounds_played ?? 20,
  };
}

describe('PuttBiasGenerator', () => {
  it('identity properties are right', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    expect(g.name).toBe('PuttBiasGenerator');
    expect(g.insightType).toBe('putt_bias');
    expect(g.category).toBe('putting');
    expect(g.minSampleN).toBe(5);
    expect(g.metricId).toBe('putt_miss_bias_left_pct');
  });

  it('maps right-direction to right metric_id', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'right');
    expect(g.metricId).toBe('putt_miss_bias_right_pct');
  });

  it('composes a directional insight when weakness is found', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent(makeAgg({
      weakest: 'left',
      weakest_pct: 28,
      straight_pct: 40,
      rounds_played: 22,
    }));
    expect(c.title).toContain('Putting bias');
    expect(c.title).toContain('left-to-right break');
    expect(c.title).toContain('28%');
    expect(c.content).toContain('22 rounds');
    expect(c.content).toContain('12-point gap');
    expect(c.signature).toBe('putt_bias:left');
  });

  it('composes a "balanced" insight when no direction is weak', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent(makeAgg({
      weakest: 'straight',
      weakest_pct: 40,
      straight_pct: 40,
    }));
    expect(c.title).toContain('balanced');
    expect(c.signature).toBe('putt_bias:straight');
  });

  it('evidence uses your_baseline as comparison_source', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent(makeAgg());
    expect(c.evidence.comparison_source).toBe('your_baseline');
    expect(c.evidence.unit).toBe('percent');
  });
});

// pb-1: shot-level revival. Aggregates make-% by break direction from golf_shots
// (the cache columns are dead). These exercise the live aggregate() path.
describe('PuttBiasGenerator.aggregate (pb-1 golf_shots read)', () => {
  beforeEach(() => {
    roundsRows = [{ id: 'r-1' }, { id: 'r-2' }];
    puttRows = [];
  });

  it('returns null when the player has no completed rounds in the window', async () => {
    roundsRows = [];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).toBeNull();
  });

  it('flags the break direction with the largest gap below straight', async () => {
    // straight 30/40 = 75%, L→R 10/20 = 50% (gap 25), R→L 14/20 = 70% (gap 5).
    puttRows = [
      ...putts('straight', 40, 30),
      ...putts('left_to_right', 20, 10),
      ...putts('right_to_left', 20, 14),
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.weakest_direction).toBe('left');
    expect(agg!.straight_pct).toBeCloseTo(75, 5);
    expect(agg!.weakest_pct).toBeCloseTo(50, 5);
  });

  it('reports "balanced" (straight) when neither side trails by >1pt', async () => {
    puttRows = [
      ...putts('straight', 40, 30),   // 75%
      ...putts('left_to_right', 20, 15), // 75%
      ...putts('right_to_left', 20, 15), // 75%
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg!.weakest_direction).toBe('straight');
  });

  it('excludes "multiple" (compound break) and unscored putts', async () => {
    puttRows = [
      ...putts('straight', 40, 30),
      ...putts('left_to_right', 20, 8), // 40% → weakest
      ...putts('right_to_left', 20, 14),
      ...putts('multiple', 50, 5),                      // ignored
      ...putts('left_to_right', 30, 30).map((r) => ({ ...r, putt_made: null })), // unscored, ignored
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg!.weakest_direction).toBe('left');
    // 8/20 = 40% (the 30 unscored L→R rows were excluded, not counted as misses).
    expect(agg!.weakest_pct).toBeCloseTo(40, 5);
  });

  it('returns null when no break side clears the per-direction floor (8)', async () => {
    puttRows = [
      ...putts('straight', 40, 30),
      ...putts('left_to_right', 5, 1),  // < 8 attempts
      ...putts('right_to_left', 4, 1),  // < 8 attempts
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).toBeNull();
  });

  it('returns null when the straight baseline is below the floor', async () => {
    puttRows = [
      ...putts('straight', 5, 4),       // < 8 → no stable baseline
      ...putts('left_to_right', 20, 8),
      ...putts('right_to_left', 20, 14),
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).toBeNull();
  });
});
