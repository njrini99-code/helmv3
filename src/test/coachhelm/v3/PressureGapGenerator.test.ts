import { describe, it, expect, vi, beforeEach } from 'vitest';

// pg-1/pg-2: aggregate() reads golf_rounds and gates on >= MIN_ROUNDS_PER_BUCKET
// (3) rounds in EACH bucket. Mock the admin client's golf_rounds read.
type Row = Record<string, unknown>;
let roundRows: Row[] = [];

function makeBuilder(rows: Row[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte']) builder[m] = vi.fn(() => builder);
  builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => makeBuilder(roundRows) }),
}));

import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';

const PLAYER_ID = 'p-1';

/** N rounds of a given type with a fixed score_to_par. */
function rounds(round_type: string, n: number, scoreToPar: number): Row[] {
  return Array.from({ length: n }, () => ({ round_type, score_to_par: scoreToPar }));
}

function makeAgg(over: Partial<{
  playerValue: number;
  practice_avg: number;
  competitive_avg: number;
  practice_count: number;
  competitive_count: number;
}> = {}) {
  return {
    sampleN: (over.practice_count ?? 8) + (over.competitive_count ?? 5),
    playerValue: over.playerValue ?? 1.5,
    practice_avg: over.practice_avg ?? 0.8,
    competitive_avg: over.competitive_avg ?? 2.3,
    practice_count: over.practice_count ?? 8,
    competitive_count: over.competitive_count ?? 5,
  };
}

describe('PressureGapGenerator', () => {
  it('identity', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    expect(g.name).toBe('PressureGapGenerator');
    expect(g.insightType).toBe('pressure_gap');
    expect(g.category).toBe('pressure');
    expect(g.metricId).toBe('practice_tournament_delta');
    expect(g.minSampleN).toBe(5);
  });

  it('positive delta = "play worse" framing', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: 1.5 }));
    expect(c.title).toContain('+1.5');
    expect(c.content).toContain('worse when it counts');
    expect(c.signature).toBe('pressure_gap:practice_vs_tournament');
  });

  it('negative delta = "play better" framing', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: -0.7 }));
    expect(c.title).toContain('-0.7');
    expect(c.content).toContain('better when it counts');
  });

  it('content includes round counts on each side', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ practice_count: 12, competitive_count: 7 }));
    expect(c.content).toContain('12 practice rounds');
    expect(c.content).toContain('7 competitive rounds');
  });

  it('evidence references the PGA 0.5 anchor', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg());
    expect(c.evidence.comparison_value).toBe(0.5);
    expect(c.evidence.comparison_source).toBe('pga_baseline');
    expect(c.evidence.unit).toBe('strokes');
  });
});

// pg-1/pg-2: per-bucket floor (requalification gate). BOTH buckets need >= 3
// rounds before the gap is emitted — a 1-1 split produces no insight, so the
// "+6.5 from 0-1 rounds" stale-HIGH class can't be (re-)created here.
describe('PressureGapGenerator.aggregate (pg-1/pg-2 per-bucket floor)', () => {
  beforeEach(() => { roundRows = []; });

  it('emits the gap when both buckets clear the floor (>= 3 each)', async () => {
    roundRows = [
      ...rounds('practice', 4, 0.5),
      ...rounds('tournament', 3, 2.5),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.practice_count).toBe(4);
    expect(agg!.competitive_count).toBe(3);
    expect(agg!.playerValue).toBeCloseTo(2.0, 5); // 2.5 - 0.5
  });

  it('returns null when the competitive bucket is below the floor (1 round)', async () => {
    roundRows = [
      ...rounds('practice', 6, 0.5),
      ...rounds('tournament', 1, 8.0), // a lone blow-up round → no fake "+7.5 gap"
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).toBeNull();
  });

  it('returns null when the practice bucket is below the floor', async () => {
    roundRows = [
      ...rounds('practice', 2, 0.5),
      ...rounds('tournament', 5, 2.5),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).toBeNull();
  });

  it('counts both tournament and qualifier rounds as competitive', async () => {
    roundRows = [
      ...rounds('practice', 3, 0.5),
      ...rounds('tournament', 2, 2.0),
      ...rounds('qualifier', 1, 3.0),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.competitive_count).toBe(3);
  });
});
