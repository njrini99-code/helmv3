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

// C5: aggregate() now decomposes the gap by joining holes via loadCompletedHoles.
// Mock the hole-diagnosis loader so the per-bucket component deltas are driven by
// a controllable hole set; classifyHole stays the real implementation.
type HoleRow = {
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
  putts: number;
  penalty_strokes: number;
  gir: boolean;
  up_and_down: boolean;
};
let holeRows: HoleRow[] = [];
vi.mock('@/lib/coachhelm/v3/engine/hole-diagnosis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/engine/hole-diagnosis')>();
  return {
    ...actual,
    loadCompletedHoles: vi.fn(async () => holeRows),
  };
});

import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';
import { computeMeasuredFactors } from '@/lib/coachhelm/v3/engine/generator-base';

const PLAYER_ID = 'p-1';

/** N rounds of a given type with a fixed score_to_par. Each round gets a recent,
 *  parseable round_date (i days ago) so SV-1's round_dates are non-empty. */
function rounds(round_type: string, n: number, scoreToPar: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${round_type}-${i}`,
    round_type,
    score_to_par: scoreToPar,
    round_date: new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10),
  }));
}

function makeAgg(over: Partial<{
  playerValue: number;
  practice_avg: number;
  competitive_avg: number;
  practice_count: number;
  competitive_count: number;
  double_rate_delta: number;
  three_putt_delta: number;
  penalty_delta: number;
  opening3_delta: number;
}> = {}) {
  return {
    sampleN: (over.practice_count ?? 8) + (over.competitive_count ?? 5),
    playerValue: over.playerValue ?? 1.5,
    practice_avg: over.practice_avg ?? 0.8,
    competitive_avg: over.competitive_avg ?? 2.3,
    practice_count: over.practice_count ?? 8,
    competitive_count: over.competitive_count ?? 5,
    double_rate_delta: over.double_rate_delta ?? 0,
    three_putt_delta: over.three_putt_delta ?? 0,
    penalty_delta: over.penalty_delta ?? 0,
    opening3_delta: over.opening3_delta ?? 0,
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

describe('C5 pressure gap decomposition', () => {
  it('names the sub-area that breaks under pressure (largest positive component delta)', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    const c = g.composeContent(
      makeAgg({
        playerValue: 1.5,
        double_rate_delta: 8, // +8 pp doubles in competition — the dominant break
        three_putt_delta: 2,
        penalty_delta: 1,
        opening3_delta: 0.1,
      }),
    );
    expect(c.content.toLowerCase()).toContain('double');
    expect(c.content).toContain('8');
  });

  it('a positive gap with no decomposed driver does NOT fabricate one', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: 0.9 }));
    // All component deltas 0 → no "driven by" sentence, just the honest gap.
    expect(c.content.toLowerCase()).not.toContain('driven by');
  });
});

// pg-1/pg-2: per-bucket floor (requalification gate). BOTH buckets need >= 3
// rounds before the gap is emitted — a 1-1 split produces no insight, so the
// "+6.5 from 0-1 rounds" stale-HIGH class can't be (re-)created here.
describe('PressureGapGenerator.aggregate (pg-1/pg-2 per-bucket floor)', () => {
  beforeEach(() => { roundRows = []; holeRows = []; });

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

  it('decomposes the gap into component deltas from the joined holes (C5)', async () => {
    roundRows = [
      ...rounds('practice', 3, 0.5),
      ...rounds('tournament', 3, 2.5),
    ];
    // Practice holes: all clean pars (no doubles, no 3-putts, no penalties).
    const practiceHoles: HoleRow[] = ['practice-0', 'practice-1', 'practice-2'].flatMap((rid) =>
      Array.from({ length: 9 }, (_, h) => ({
        round_id: rid,
        hole_number: h + 1,
        par: 4,
        score: 4,
        putts: 2,
        penalty_strokes: 0,
        gir: true,
        up_and_down: false,
      })),
    );
    // Competitive holes: every round has 3 double bogeys (holes 1-3) → a large
    // positive double_rate_delta that should be the named driver.
    const compHoles: HoleRow[] = ['tournament-0', 'tournament-1', 'tournament-2'].flatMap((rid) =>
      Array.from({ length: 9 }, (_, h) => {
        const isDouble = h < 3;
        return {
          round_id: rid,
          hole_number: h + 1,
          par: 4,
          score: isDouble ? 6 : 4, // 6 on a par-4 = double-plus
          putts: 2,
          penalty_strokes: 0,
          gir: !isDouble,
          up_and_down: false,
        };
      }),
    );
    holeRows = [...practiceHoles, ...compHoles];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    // 3/9 competitive holes are double-plus (33.33%) vs 0% practice → +33.3 pp.
    expect(agg!.double_rate_delta).toBeCloseTo(100 / 3, 4);
    expect(agg!.three_putt_delta).toBeCloseTo(0, 5);
    expect(agg!.penalty_delta).toBeCloseTo(0, 5);
    // Opening 3 holes: competitive +2 each (avg +2.0), practice +0 → +2.0.
    expect(agg!.opening3_delta).toBeCloseTo(2.0, 5);
    // SV-1: every competitive round scored +2.5 → zero dispersion.
    expect(agg!.stddev).toBeCloseTo(0, 5);
    // SV-1 wiring: round_dates must be exposed (the competitive rounds) or the
    // base's computeMeasuredFactors stays null and the real stddev is never used.
    expect(agg!.round_dates).toBeDefined();
    expect(agg!.round_dates!.length).toBe(3); // the 3 competitive rounds

    // The composed card names doubles as the driver.
    const c = new PressureGapGenerator(PLAYER_ID).composeContent(agg!);
    expect(c.content.toLowerCase()).toContain('double');
  });

  it('SV-1 is fully wired: the real stddev IS consumed (factors_measured:true, not placeholder)', async () => {
    // Competitive rounds with GENUINE score-to-par spread so stddev > 0.
    roundRows = [
      ...rounds('practice', 3, 0.5),
      { id: 'tournament-0', round_type: 'tournament', score_to_par: 1, round_date: new Date(Date.now() - 1 * 86400_000).toISOString().slice(0, 10) },
      { id: 'tournament-1', round_type: 'tournament', score_to_par: 5, round_date: new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10) },
      { id: 'tournament-2', round_type: 'tournament', score_to_par: 3, round_date: new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10) },
    ];
    holeRows = []; // component deltas irrelevant here; only SV-1 dispersion matters.
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();

    // Real sample stddev of [1,5,3] = sqrt(((1-3)^2+(5-3)^2+(3-3)^2)/2) = 2.
    expect(agg!.stddev).toBeCloseTo(2, 5);
    expect(agg!.stddev_scale).toBe(5);
    expect(agg!.round_dates!.length).toBe(3);

    // PROOF the base now consumes it: computeMeasuredFactors returns a non-null
    // measured factor (factors_measured:true) — the placeholder 0.5 variance /
    // 1.0 recency path is no longer in effect.
    const measured = computeMeasuredFactors(agg!, 90);
    expect(measured).not.toBeNull();
    expect(measured!.factors_measured).toBe(true);
    // variance = clamp01(1 - stddev/scale) = 1 - 2/5 = 0.6 (≠ the 0.5 placeholder).
    expect(measured!.variance).toBeCloseTo(0.6, 5);
    expect(measured!.variance).not.toBeCloseTo(0.5, 2);
    // All 3 competitive rounds are within the 45-day freshness half-window → recency 1.0.
    expect(measured!.recency).toBeCloseTo(1.0, 5);

    // And the inert path is genuinely gone: stripping round_dates reverts to null
    // (the exact failure mode this fix closes).
    const withoutDates = computeMeasuredFactors({ ...agg!, round_dates: [] }, 90);
    expect(withoutDates).toBeNull();
  });
});
