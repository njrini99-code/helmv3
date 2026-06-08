import { describe, it, expect, beforeEach } from 'vitest';

// F2+F3: aggregate() reads golf_shots with distance + slope data.
// Mock the admin client's `.from(table)` to drive shot-level reads.
type Row = Record<string, unknown>;
let roundsRows: Row[] = [];
let puttRows: Row[] = [];

function makeBuilder(rows: Row[]) {
  // Every chained filter returns the builder; awaiting it yields {data,error}.
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'in']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return builder;
}

import { vi } from 'vitest';

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
  distFt = 15,
  slope: string | null = 'level',
): Row[] {
  return Array.from({ length: attempts }, (_, i) => ({
    putt_break,
    putt_made: i < made,
    putt_slope: slope,
    distance_to_hole_before: distFt,
    distance_unit_before: 'feet',
  }));
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

  it('evidence uses your_baseline as comparison_source', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent({
      sampleN: 20, playerValue: 28, rounds_played: 20,
      significant: true, weakest_direction: 'left', band: '11-20 ft',
      slope: 'level', weak_pct: 28, strong_pct: 40, gap_pp: 12,
      weak_n: 20, strong_n: 20,
    });
    expect(c.evidence.comparison_source).toBe('your_baseline');
    expect(c.evidence.unit).toBe('percent');
  });
});

describe('PuttBiasGenerator.aggregate (F2+F3 L-vs-R distance-controlled)', () => {
  beforeEach(() => {
    roundsRows = [{ id: 'r-1' }, { id: 'r-2' }];
    puttRows = [];
  });

  it('returns null when the player has no completed rounds in the window', async () => {
    roundsRows = [];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).toBeNull();
  });

  it('returns a non-null agg (significant=false) when break sides are even', async () => {
    // Even L-vs-R at 11-20 ft → no significant gap → significant=false
    puttRows = [
      ...putts('left_to_right', 20, 4, 15, 'level'),
      ...putts('right_to_left', 20, 4, 15, 'level'),
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    // aggregate() now always returns a value when rounds exist (no early null for even data)
    expect(agg).not.toBeNull();
    expect(agg!.significant).toBe(false);
    expect(agg!.weakest_direction).toBeNull();
  });

  it('excludes "multiple" and "straight" break types (not single-directional)', async () => {
    // Only straight + multiple — no L-vs-R data → significant=false
    puttRows = [
      ...putts('straight', 40, 30, 2, 'level'),
      ...putts('multiple', 50, 5, 15, 'level'),
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.significant).toBe(false);
  });

  it('excludes unscored putts (putt_made=null)', async () => {
    // 20 scored LtR + 20 scored RtL (even), plus unscored rows that should be ignored
    puttRows = [
      ...putts('left_to_right', 20, 4, 15, 'level'),
      ...putts('right_to_left', 20, 4, 15, 'level'),
      // unscored LtR rows (putt_made=null) — should not affect result
      ...putts('left_to_right', 30, 30, 15, 'level').map((r) => ({ ...r, putt_made: null })),
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).not.toBeNull();
    // The 30 unscored rows should not inflate the LtR count or alter significance
    expect(agg!.significant).toBe(false);
  });

  it('detects a significant gap and identifies the weaker break direction', async () => {
    // 7-10 ft level: LtR 50% (20/40), RtL 20% (8/40) → 30pp gap, significant
    puttRows = [
      ...putts('left_to_right', 20, 20, 8, 'level'), // 20 made
      ...putts('left_to_right', 20, 0, 8, 'level'),  // 20 missed → 50% total
      ...putts('right_to_left', 8, 8, 8, 'level'),   // 8 made
      ...putts('right_to_left', 32, 0, 8, 'level'),  // 32 missed → 20% total
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.significant).toBe(true);
    expect(agg!.weakest_direction).toBe('right'); // right_to_left is weaker
    expect(agg!.band).toBe('7-10 ft');
    expect(agg!.gap_pp).toBeGreaterThanOrEqual(12);
  });

  it('converts yards to feet before bucketing (×3)', async () => {
    // 3 yards = 9 feet → falls in the 7-10 ft band
    const yardsRow: Row = {
      putt_break: 'left_to_right',
      putt_made: true,
      putt_slope: 'level',
      distance_to_hole_before: 3,
      distance_unit_before: 'yards',
    };
    puttRows = [
      // 40 LtR at 3 yds (9 ft) — 50% make
      ...Array(20).fill(0).map(() => ({ ...yardsRow, putt_made: true })),
      ...Array(20).fill(0).map(() => ({ ...yardsRow, putt_made: false })),
      // 40 RtL at 9 ft — 20% make
      ...putts('right_to_left', 8, 8, 9, 'level'),
      ...putts('right_to_left', 32, 0, 9, 'level'),
    ];
    const agg = await new PuttBiasGenerator(PLAYER_ID, 'left').aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.significant).toBe(true);
    expect(agg!.band).toBe('7-10 ft');
  });
});
