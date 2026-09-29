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

// Priority anchors to the cohort (golf_player_standing.level_avg). Null by
// default = cold-start (no standing row yet).
let standingLevelAvg: number | null = null;
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadStandingForMetric: vi.fn(async () =>
    standingLevelAvg === null ? null : { level_avg: standingLevelAvg, level_n: 11, pga_value: 0.5 },
  ),
}));

import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';
import { computeMeasuredFactors } from '@/lib/coachhelm/v3/engine/generator-base';

const PLAYER_ID = 'p-1';

/** N rounds of a given type with a fixed score_to_par. Each round gets a recent,
 *  parseable round_date (i days ago) so SV-1's round_dates are non-empty. */
function rounds(round_type: string, n: number, scoreToPar: number, holes = 18): Row[] {
  const par = holes === 9 ? 36 : 72;
  return Array.from({ length: n }, (_, i) => ({
    id: holes === 18 ? `${round_type}-${i}` : `${round_type}-9h-${i}`,
    round_type,
    score_to_par: scoreToPar,
    round_date: new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10),
    // Countable-round columns (isCountableRound): fully recorded and plausible.
    holes_played: holes,
    total_score: par + scoreToPar,
    front_nine: holes === 9 ? par + scoreToPar : 36,
    back_nine: holes === 9 ? null : 36 + scoreToPar,
    total_putts: null,
  }));
}

function makeAgg(over: Partial<{
  playerValue: number;
  practice_avg: number;
  competitive_avg: number;
  practice_count: number;
  competitive_count: number;
  doubles_per18_delta: number;
  three_putts_per18_delta: number;
  penalty_per18_delta: number;
  opening3_strokes_delta: number;
}> = {}) {
  return {
    sampleN: (over.practice_count ?? 8) + (over.competitive_count ?? 5),
    playerValue: over.playerValue ?? 1.5,
    practice_avg: over.practice_avg ?? 0.8,
    competitive_avg: over.competitive_avg ?? 2.3,
    practice_count: over.practice_count ?? 8,
    competitive_count: over.competitive_count ?? 5,
    doubles_per18_delta: over.doubles_per18_delta ?? 0,
    three_putts_per18_delta: over.three_putts_per18_delta ?? 0,
    penalty_per18_delta: over.penalty_per18_delta ?? 0,
    opening3_strokes_delta: over.opening3_strokes_delta ?? 0,
    gap_se: 0.4,
    noise_band: 1.0,
    cohort_avg: null as number | null,
    window_start: null,
    window_end: null,
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
        doubles_per18_delta: 1.4, // +1.4 doubles per 18 in competition — the dominant break
        three_putts_per18_delta: 0.4,
        penalty_per18_delta: 0.2,
        opening3_strokes_delta: 0.1,
      }),
    );
    expect(c.content.toLowerCase()).toContain('double');
    expect(c.content).toContain('1.4');
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

  // NUM-24: the shared pressure-gap rule (src/lib/golf/metrics/pressure-gap.ts),
  // which Standing's SQL also follows.
  it("counts the legacy 'qualifying' spelling as pressure", async () => {
    roundRows = [
      ...rounds('practice', 3, 1),
      ...rounds('tournament', 2, 3),
      ...rounds('qualifying', 1, 3),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.competitive_count).toBe(3);
    expect(agg!.playerValue).toBeCloseTo(2);
  });

  it('scales 9-hole rounds to 18 holes before averaging', async () => {
    roundRows = [
      ...rounds('practice', 3, 2),
      // A 9-hole +2 is +4 over 18 holes, so pressure averages +4, not +2.
      ...rounds('tournament', 3, 2, 9),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.competitive_avg).toBeCloseTo(4);
    expect(agg!.playerValue).toBeCloseTo(2);
  });

  it('leaves out rounds that are not countable', async () => {
    roundRows = [
      ...rounds('practice', 3, 0),
      ...rounds('tournament', 3, 2),
      // A 37-stroke "18-hole" round (the Sep 17 round) is implausible.
      { ...rounds('tournament', 1, -35)[0], id: 'implausible' },
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.competitive_count).toBe(3);
    expect(agg!.playerValue).toBeCloseTo(2);
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
    // 3/9 competitive holes are double-plus vs 0 in practice → +6 per 18 holes.
    expect(agg!.doubles_per18_delta).toBeCloseTo(6, 4);
    expect(agg!.three_putts_per18_delta).toBeCloseTo(0, 5);
    expect(agg!.penalty_per18_delta).toBeCloseTo(0, 5);
    // Opening 3 holes: competitive +2 each, practice +0 → +6 strokes over the three.
    expect(agg!.opening3_strokes_delta).toBeCloseTo(6.0, 5);
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
    // Practice sits far enough below (−5) that the gap (8) clears its noise
    // band (t(2) × 1.15 ≈ 5.0) — a gap inside the band is suppressed.
    roundRows = [
      ...rounds('practice', 3, -5),
      { ...rounds('tournament', 1, 1)[0], id: 'tournament-0', round_date: new Date(Date.now() - 1 * 86400_000).toISOString().slice(0, 10) },
      { ...rounds('tournament', 1, 5)[0], id: 'tournament-1', round_date: new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10) },
      { ...rounds('tournament', 1, 3)[0], id: 'tournament-2', round_date: new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10) },
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

/** Rounds of one type with the given 18-hole to-par values. */
function roundsWith(round_type: string, values: number[]): Row[] {
  return values.map((v, i) => ({ ...rounds(round_type, 1, v)[0], id: `${round_type}-v${i}` }));
}

function holesFor(roundId: string, shape: (h: number) => Partial<HoleRow>): HoleRow[] {
  return Array.from({ length: 9 }, (_, h) => ({
    round_id: roundId, hole_number: h + 1, par: 4, score: 4, putts: 2,
    penalty_strokes: 0, gir: true, up_and_down: false, ...shape(h),
  }));
}

describe('audit row 14 — pressure gap accuracy', () => {
  beforeEach(() => { roundRows = []; holeRows = []; standingLevelAvg = null; });

  it('suppresses a gap that sits inside its 95% noise band (Welch SE, t critical)', async () => {
    // Practice mean 1.0 (spread 4), pressure mean 3.0 (spread 4): gap 2.0,
    // SE = sqrt(20/3/3 + 20/3/3) ≈ 2.1 → the band is far wider than the gap.
    roundRows = [
      ...roundsWith('practice', [-3, 1, 5]),
      ...roundsWith('tournament', [-1, 3, 7]),
    ];
    expect(await new PressureGapGenerator(PLAYER_ID).aggregate()).toBeNull();
  });

  it('keeps a gap that clears its noise band and reports the band', async () => {
    roundRows = [
      ...roundsWith('practice', [0, 1, 0, 1]),
      ...roundsWith('tournament', [6, 7, 6, 7]),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.playerValue).toBeCloseTo(6);
    expect(agg!.gap_se).toBeGreaterThan(0);
    expect(agg!.noise_band).toBeLessThan(6);
  });

  it('ranks the decomposition on one scale (per 18 holes), so penalties can be the driver', async () => {
    roundRows = [
      ...rounds('practice', 3, 0),
      ...rounds('tournament', 3, 4),
    ];
    // Competition: per 9 holes one double (no penalty) and two penalty bogeys.
    // Old units: doubles +11.1 "pp" outranked penalties +2.0 "per round".
    // Per 18 holes: doubles +2.0 vs penalty strokes +4.0 → penalties lead.
    holeRows = [
      ...['practice-0', 'practice-1', 'practice-2'].flatMap((r) => holesFor(r, () => ({}))),
      ...['tournament-0', 'tournament-1', 'tournament-2'].flatMap((r) =>
        holesFor(r, (h) =>
          h === 5 ? { score: 6, gir: false }
            : h === 6 || h === 7 ? { score: 5, penalty_strokes: 1, gir: false }
              : {})),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.doubles_per18_delta).toBeCloseTo(2, 5);
    expect(agg!.penalty_per18_delta).toBeCloseTo(4, 5);
    const c = new PressureGapGenerator(PLAYER_ID).composeContent(agg!);
    expect(c.content).toMatch(/Most of that gap is penalties: \+4\.0 per 18 holes/);
  });

  it('anchors priority and the primary comparison to the cohort, with the Tour as secondary', () => {
    const g = new PressureGapGenerator(PLAYER_ID);
    // A 1.5-stroke gap is below the 2.27 cohort: not a pressure weakness for
    // a college player, although it is 3x the Tour's 0.5.
    const c = g.composeContent({ ...makeAgg({ playerValue: 1.5 }), cohort_avg: 2.27 });
    expect(c.priority).toBe('low');
    expect(c.evidence.comparison_value).toBe(2.27);
    expect(c.evidence.comparison_source).toBe('cohort_avg');
    expect(c.evidence.secondary_value).toBe(0.5);
    expect(c.evidence.secondary_source).toBe('pga_baseline');
    expect(g.composeContent({ ...makeAgg({ playerValue: 3.0 }), cohort_avg: 2.27 }).priority).toBe('medium');
    expect(g.composeContent({ ...makeAgg({ playerValue: 4.5 }), cohort_avg: 2.27 }).priority).toBe('high');
  });

  it('aggregate carries the cohort level_avg from standing', async () => {
    standingLevelAvg = 2.27;
    roundRows = [
      ...rounds('practice', 3, 0),
      ...rounds('tournament', 3, 4),
    ];
    const agg = await new PressureGapGenerator(PLAYER_ID).aggregate();
    expect(agg!.cohort_avg).toBe(2.27);
  });
});
