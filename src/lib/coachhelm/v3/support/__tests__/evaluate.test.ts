import { describe, expect, it } from 'vitest';
import { buildCandidate, whyStateOf } from '../candidate';
import { evaluatePlayerRun, type SupportRow } from '../evaluate';
import { familyFor } from '../families';

// Synthetic rows shaped like what the v3 generators write (field inventory
// from production, 2026-10-20). No real player data.
const PLACEHOLDER =
  'Putts made 3-5 ft is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence';

function puttDistance(over: Record<string, unknown> = {}): SupportRow {
  return {
    id: 'pd',
    insight_type: 'putt_distance',
    evidence: {
      metric: 'putts_made_3_5ft_pct',
      unit: 'percent',
      your_value: 60,
      sample_n: 80,
      comparison_value: 96,
      comparison_source: 'pga_baseline',
      strokes_impact: 0.8,
      strokes_impact_method: 'peer_delta',
      detail: { band_attempts: 80, rounds_played: 10 },
      standing: { team_avg: 80, team_n: 8, level_avg: 78, level_n: 40 },
      diagnosis: { root_cause: PLACEHOLDER, causality_level: 'inferred_hypothesis' },
      ...over,
    },
  };
}

const approach: SupportRow = {
  id: 'ap',
  insight_type: 'approach_miss',
  evidence: {
    metric: 'approach_proximity_50_125ft',
    unit: 'percent',
    polarity: 'higher_better',
    your_value: 50,
    sample_n: 60,
    comparison_value: 75,
    comparison_source: 'pga_baseline',
    strokes_impact: 0.9,
    strokes_impact_method: 'sg_baseline',
    rounds_n: 9,
    detail: { attempts: 60, green_hit_n: 30, green_hit_pct: 50 },
    // On-green proximity, a different quantity: must not be the benchmark.
    standing: { team_avg: 24, team_n: 8 },
  },
};

const penalty: SupportRow = {
  id: 'pen',
  insight_type: 'course_management',
  evidence: {
    metric: 'penalty_rate_per_round',
    unit: 'count',
    your_value: 1.5,
    sample_n: 10,
    comparison_value: 0.3,
    comparison_source: 'pga_baseline',
    strokes_impact: 0,
    strokes_impact_method: 'peer_delta',
    standing: { team_avg: 0.6, team_n: 9 },
  },
};

const parScoring: SupportRow = {
  id: 'par',
  insight_type: 'par_scoring',
  evidence: { metric: 'scoring_par_3', unit: 'strokes', your_value: 3.4, sample_n: 12, comparison_value: 3, detail: { rounds_played: 12 } },
};

const composite: SupportRow = {
  id: 'comp',
  insight_type: 'composite',
  evidence: { metric: 'lag_3putt', unit: 'percent', your_value: 9, sample_n: 40, estimated: true },
};

const tee: SupportRow = {
  id: 'tee',
  insight_type: 'tee_strategy',
  evidence: {
    metric: 'fairway_pct_driver',
    unit: 'percent',
    polarity: 'higher_better',
    your_value: 40,
    sample_n: 60,
    comparison_value: 70,
    comparison_source: 'your_baseline',
    strokes_impact: 0,
    strokes_impact_method: 'rough_estimate',
    rounds_n: 8,
    detail: { driver_n: 60, non_driver_n: 30, driver_fairway_hits: 24, non_driver_fairway_hits: 21 },
  },
};

const thinScrambling: SupportRow = {
  id: 'sand',
  insight_type: 'scrambling',
  evidence: {
    metric: 'scrambling_pct_sand',
    unit: 'percent',
    your_value: 20,
    sample_n: 5,
    strokes_impact: 0,
    strokes_impact_method: 'peer_delta',
    rounds_n: 2,
    detail: { save_n: 5, saves_made: 1 },
    standing: { team_avg: 45, team_n: 8 },
  },
};

describe('families', () => {
  it('maps rows to families, slope rows by metric', () => {
    expect(familyFor('putt_bias', 'putt_slope_downhill_penalty_pct').family).toBe('putt_slope');
    expect(familyFor('putt_bias', 'putt_miss_bias_left_pct').family).toBe('putt_break');
    expect(familyFor('course_management', 'big_number_rate').family).toBe('big_number');
    expect(familyFor('something_new', 'x').family).toBe('unknown');
  });
});

describe('buildCandidate', () => {
  it('tests a putt band against the team line when the team has >= 4 players', () => {
    const c = buildCandidate(puttDistance());
    expect(c.benchmark).toEqual({ source: 'team', value: 80 });
    expect(c.gapInput).toMatchObject({ kind: 'proportion', k: 48, n: 80, benchmark: 0.8 });
    expect(c.roundsN).toBe(10);
    expect(c.why).toBe('not_traced');
  });

  it('falls back to the cohort, then to the row comparison', () => {
    expect(buildCandidate(puttDistance({ standing: { team_avg: 80, team_n: 2, level_avg: 78, level_n: 40 } })).benchmark)
      .toEqual({ source: 'cohort', value: 78 });
    const tour = buildCandidate(puttDistance({ standing: null }));
    expect(tour.benchmark).toEqual({ source: 'tour', value: 96 });
    expect(tour.cap).toBe('working_hypothesis');
    expect(tour.capReasons).toContain('tour_benchmark_only');
  });

  it('never uses an approach row standing (a different quantity) as the benchmark', () => {
    const c = buildCandidate(approach);
    expect(c.benchmark?.source).toBe('tour');
    expect(c.gapInput).toMatchObject({ kind: 'proportion', k: 30, n: 60 });
  });

  it('reads a zero strokes estimate as not estimated except for sg_baseline', () => {
    expect(buildCandidate(penalty).strokesRaw).toBeNull();
    expect(
      buildCandidate({ ...approach, evidence: { ...(approach.evidence as object), strokes_impact: 0 } }).strokesRaw,
    ).toBe(0);
  });

  it('reports untestable families with a reason, never a guess', () => {
    expect(buildCandidate(parScoring).untestableReason).toBe('no_per_round_spread');
    expect(buildCandidate(composite).untestableReason).toBe('composite_no_counts');
    expect(buildCandidate({ id: 'x', insight_type: 'putt_bias', evidence: { metric: 'putt_miss_bias_left_pct', your_value: 30, sample_n: 40 } }).untestableReason)
      .toBe('no_side_counts');
  });

  it('caps an estimated value below Observed', () => {
    const c = buildCandidate({ ...penalty, evidence: { ...(penalty.evidence as object), estimated: true } });
    expect(c.cap).toBe('likely');
  });
});

describe('whyStateOf', () => {
  it('treats the placeholder or no cause as not traced', () => {
    expect(whyStateOf({ diagnosis: { root_cause: PLACEHOLDER } })).toBe('not_traced');
    expect(whyStateOf({})).toBe('not_traced');
  });
  it('treats a printed generator cause as an uncorroborated candidate', () => {
    expect(whyStateOf({ diagnosis: { root_cause: 'Misses finish short of the hole.' } })).toBe('candidate');
  });
  it('holds a counted path to the raised floors (>= 4 of >= 10, >= 30%, >= 3 rounds)', () => {
    const path = { state: 'observed_sequence', occurrences: 4, denominator: 12, distinct_rounds: 3 };
    expect(whyStateOf({ cause: path })).toBe('observed_sequence');
    expect(whyStateOf({ cause: { ...path, occurrences: 3 } })).toBe('candidate');
    expect(whyStateOf({ cause: { ...path, denominator: 14 } })).toBe('candidate');
  });
  it('accepts a corroborated inference (lift >= 1.25, >= 10 per arm, lower bound > 0)', () => {
    const alt = { lift: 1.6, lower_bound: 0.04, arm_a: { n: 12, rate: 0.4 }, arm_b: { n: 20, rate: 0.25 } };
    expect(whyStateOf({ cause: { state: 'inferred_hypothesis', alternatives: [alt] } })).toBe('corroborated');
    expect(whyStateOf({ cause: { state: 'inferred_hypothesis', alternatives: [{ ...alt, lower_bound: -0.01 }] } }))
      .toBe('candidate');
  });
});

describe('evaluatePlayerRun', () => {
  const rows = [puttDistance(), approach, penalty, parScoring, composite, tee, thinScrambling];
  const result = evaluatePlayerRun(rows);
  const byId = new Map(result.rows.map((r) => [r.id, r]));

  it('counts every candidate in BH, untestable ones included', () => {
    expect(result.summary.candidates).toBe(7);
    expect(result.summary.tests_in_run).toBe(7);
    for (const r of result.rows) expect(r.patch.support.tests_in_run).toBe(7);
    expect(result.summary.testable).toBe(5);
  });

  it('writes the 04 §1.1 support fields', () => {
    const pd = byId.get('pd')!.patch;
    expect(pd.support).toMatchObject({
      version: 'support_v1',
      testable: true,
      family: 'putt_distance',
      gap_unit: 'pct_points',
      method: 'wilson',
      direction: 'weakness',
      n: 80,
      rounds_n: 10,
      benchmark: { source: 'team', value: 80 },
      clear: true,
    });
    expect(pd.support.gap).toBeCloseTo(20, 6);
    expect(pd.support.q_adj!).toBeGreaterThanOrEqual(pd.support.p_one_sided!);
    expect(pd.ladder).toBe('observed');
    expect(pd.shrink).toMatchObject({ kappa: 30, prior_source: 'team', prior_value: 80 });
    // Shrunk toward the team: 80 / (80 + 30) of the raw strokes.
    expect(pd.strokes_shrunk!).toBeCloseTo(0.8 * (80 / 110), 2);
  });

  it('caps a Tour-only benchmark at Working hypothesis', () => {
    const ap = byId.get('ap')!.patch;
    expect(ap.ladder).toBe('working_hypothesis');
    expect(ap.ladder_reasons).toContain('tour_benchmark_only');
  });

  it('derives the strokes of a per-round rate from the gap (one stroke per penalty)', () => {
    const pen = byId.get('pen')!.patch;
    expect(pen.support.benchmark).toEqual({ source: 'team', value: 0.6 });
    expect(pen.support.gap).toBeCloseTo(0.9, 6);
    expect(pen.ladder).not.toBe('not_enough_yet');
  });

  it('keeps a within-player contrast without a strokes estimate with the coach', () => {
    const t = byId.get('tee')!.patch;
    expect(t.support.method).toBe('newcombe');
    expect(t.what_ladder).toBe('working_hypothesis');
    expect(t.ladder_reasons).toContain('no_strokes_estimate');
  });

  it('marks untestable and thin rows Not enough yet and lists the thin one on Watching', () => {
    expect(byId.get('par')!.patch.ladder).toBe('not_enough_yet');
    expect(byId.get('par')!.patch.support).toMatchObject({ testable: false, untestable_reason: 'no_per_round_spread' });
    expect(byId.get('comp')!.patch.ladder).toBe('not_enough_yet');
    expect(byId.get('sand')!.patch.ladder).toBe('not_enough_yet');
    expect(result.summary.watching).toEqual([
      { family: 'sand_save', unit: 'opportunities', have_n: 5, need_n: 12, rounds_have: 2, rounds_need: 4 },
    ]);
    expect(result.summary.suppressed['untestable:no_per_round_spread']).toBe(1);
    expect(result.summary.suppressed['untestable:composite_no_counts']).toBe(1);
  });

  it('adds up', () => {
    const total = Object.values(result.summary.rungs).reduce((a, b) => a + b, 0);
    expect(total).toBe(7);
    expect(result.summary.eligible).toBe(7 - result.summary.rungs.not_enough_yet);
    const famTotal = Object.values(result.summary.families)
      .flatMap((f) => Object.values(f))
      .reduce((a, b) => a + (b ?? 0), 0);
    expect(famTotal).toBe(7);
  });

  it('computes split-half stability when the evidence carries halves', () => {
    const run = evaluatePlayerRun([
      puttDistance({ stability: { split_half: { gap_old: 22, gap_new: 18, n_old: 40, n_new: 40 } } }),
    ]);
    const p = run.rows[0]!.patch;
    expect(p.stability?.split_half.agrees).toBe(true);
    expect(p.ladder).toBe('seen_repeatedly');
  });

  it('is empty-safe', () => {
    const run = evaluatePlayerRun([]);
    expect(run.rows).toEqual([]);
    expect(run.summary.candidates).toBe(0);
  });

  it('makes a read harder to support as more candidates run', () => {
    const alone = evaluatePlayerRun([puttDistance({ your_value: 70 })]).rows[0]!.patch.support.q_adj!;
    const crowded = evaluatePlayerRun([puttDistance({ your_value: 70 }), parScoring, composite, penalty]).rows[0]!
      .patch.support.q_adj!;
    expect(crowded).toBeGreaterThan(alone);
  });
});
