import { describe, it, expect } from 'vitest';
import {
  isFloorExemptMetric,
  priorityFloorScore,
  sampleDamping,
  DAMP_MIN,
  scoreInsight,
  URGENT_SHORT_CIRCUIT,
} from './score';
import type { RankableInsight } from './score';

describe('isFloorExemptMetric', () => {
  it('exempts every par-scoring metric (descriptive, ×10 leverage family)', () => {
    expect(isFloorExemptMetric('scoring_par_3')).toBe(true);
    expect(isFloorExemptMetric('scoring_par_4')).toBe(true);
    expect(isFloorExemptMetric('scoring_par_5')).toBe(true);
  });

  it('exempts the warmup opening-hole metric', () => {
    expect(isFloorExemptMetric('opening_hole_delta')).toBe(true);
  });

  it('does NOT exempt an actionable diagnostic metric', () => {
    expect(isFloorExemptMetric('approach_proximity_175_plus_ft')).toBe(false);
    expect(isFloorExemptMetric('putts_made_5_10ft_pct')).toBe(false);
    expect(isFloorExemptMetric('scrambling_pct_sand')).toBe(false);
  });

  it('respects the anchored single-digit boundary of the par-scoring regex', () => {
    expect(isFloorExemptMetric('scoring_par_')).toBe(false); // no digit
    expect(isFloorExemptMetric('scoring_par_34')).toBe(false); // two digits
    expect(isFloorExemptMetric('scoring_par_3x')).toBe(false); // trailing junk
  });

  it('treats undefined / empty metric as not exempt (gets a floor)', () => {
    expect(isFloorExemptMetric(undefined)).toBe(false);
    expect(isFloorExemptMetric('')).toBe(false);
  });
});

describe('priorityFloorScore', () => {
  it('ranks urgent > high > medium > low and is strictly monotonic', () => {
    const u = priorityFloorScore('urgent');
    const h = priorityFloorScore('high');
    const m = priorityFloorScore('medium');
    const l = priorityFloorScore('low');
    expect(u).toBeGreaterThan(h);
    expect(h).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(l);
    expect(l).toBeGreaterThan(0); // even 'low' must be orderable, never 0
  });

  it('pins the exact floor for each priority (catches a constant typo)', () => {
    expect(priorityFloorScore('urgent')).toBe(4);
    expect(priorityFloorScore('high')).toBe(3);
    expect(priorityFloorScore('medium')).toBe(2);
    expect(priorityFloorScore('low')).toBe(1);
    expect(priorityFloorScore(undefined)).toBe(1); // falls back to 'low'
  });

  it('defaults an absent priority to the low floor', () => {
    expect(priorityFloorScore(undefined)).toBe(priorityFloorScore('low'));
  });
});

describe('sampleDamping', () => {
  it('returns 1.0 once sample meets the reference depth (no penalty)', () => {
    expect(sampleDamping(12)).toBe(1);
    expect(sampleDamping(50)).toBe(1);
  });

  it('damps a thin sample below 1 but keeps it positive', () => {
    const thin = sampleDamping(3);
    expect(thin).toBeLessThan(1);
    expect(thin).toBeGreaterThan(0);
  });

  it('damps a 5-round sample harder than a 12-round sample', () => {
    expect(sampleDamping(5)).toBeLessThan(sampleDamping(12));
  });

  it('treats absent/zero/NaN sample as fully damped-out to the exact floor', () => {
    expect(sampleDamping(undefined)).toBe(DAMP_MIN);
    expect(sampleDamping(0)).toBe(DAMP_MIN);
    expect(sampleDamping(Number.NaN)).toBe(DAMP_MIN);
  });
});

const base = (over: Partial<RankableInsight>): RankableInsight => ({
  insight_type: 'x',
  strokes_impact: 0,
  confidence: 0.5,
  ...over,
});

describe('scoreInsight rank floor', () => {
  it('a zero-impact high-confidence diagnostic outranks a zero-impact low-confidence one', () => {
    // The real production case: approach_proximity (conf 0.91, low) must beat
    // a stale low-conf low row. Both impact 0 → ordered by floor × confidence.
    const strongDiag = base({
      strokes_impact: 0, confidence: 0.91, priority: 'low',
      metric: 'approach_proximity_175_plus_ft', sample_n: 40,
    });
    const weakDiag = base({
      strokes_impact: 0, confidence: 0.3, priority: 'low',
      metric: 'penalty_rate_per_round', sample_n: 12,
    });
    expect(scoreInsight(strongDiag, {})).toBeGreaterThan(scoreInsight(weakDiag, {}));
  });

  it('a zero-impact insight is strictly orderable (never exactly 0) unless exempt', () => {
    const diag = base({
      strokes_impact: 0, confidence: 0.5, priority: 'low',
      metric: 'putts_made_5_10ft_pct', sample_n: 15,
    });
    expect(scoreInsight(diag, {})).toBeGreaterThan(0);
  });

  it('a real strokes_impact uses the impact term, not the floor', () => {
    // impactful takes the IMPACT branch (1.2 × conf 0.8 × coachability × damping).
    // floored takes the FLOOR branch: priorityFloor(medium)=2 × FLOOR_SCALE × …, a
    // tiny band that sits strictly BELOW any real per-round impact — so a genuine
    // 1.2-stroke leak always dominates a same-priority zero-impact diagnostic
    // (contract #2). Note: floor and impact are on different scales, so the floor
    // MUST be scaled down or a medium floor (2) would outrank a 1.2-stroke leak.
    const impactful = base({
      strokes_impact: 1.2, confidence: 0.8, priority: 'medium',
      metric: 'scrambling_pct_sand', sample_n: 20,
    });
    const floored = base({
      strokes_impact: 0, confidence: 0.8, priority: 'medium',
      metric: 'putts_made_5_10ft_pct', sample_n: 20,
    });
    expect(scoreInsight(impactful, {})).toBeGreaterThan(scoreInsight(floored, {}));
  });

  it('a real impact at LOW priority beats a HIGH-priority zero-impact floored row (contract #2 across priorities)', () => {
    // Adversarial: the floored row stacks every advantage SHORT of a real impact —
    // higher priority (high floor 3), max confidence, deep sample — yet a genuine
    // 0.5-stroke leak at the LOWEST priority still wins, because a real impact ranks
    // on its magnitude band, never the (scaled-down) floor band. Priority can never
    // let a zero-impact diagnostic leapfrog a meaningful real leak.
    const realLowImpact = base({
      strokes_impact: 0.5, confidence: 0.5, priority: 'low',
      metric: 'penalty_rate_per_round', sample_n: 12,
    });
    const flooredHigh = base({
      strokes_impact: 0, confidence: 1.0, priority: 'high',
      metric: 'approach_proximity_175_plus_ft', sample_n: 40,
    });
    expect(scoreInsight(realLowImpact, {})).toBeGreaterThan(scoreInsight(flooredHigh, {}));
  });
});

describe('scoreInsight urgent short-circuit', () => {
  it('an urgent insight outranks ANY non-urgent, even a higher-impact one', () => {
    const urgentSmall = base({
      strokes_impact: 0.4, confidence: 0.5, priority: 'urgent',
      metric: 'three_putt_chain', sample_n: 5,
    });
    const hugeNonUrgent = base({
      strokes_impact: 7.9, confidence: 1.0, priority: 'high',
      metric: 'scrambling_pct_sand', sample_n: 50,
    });
    expect(scoreInsight(urgentSmall, {})).toBeGreaterThan(scoreInsight(hugeNonUrgent, {}));
  });

  it('two urgent rows still order by their underlying composite', () => {
    const a = base({ strokes_impact: 1.0, confidence: 0.8, priority: 'urgent', sample_n: 20 });
    const b = base({ strokes_impact: 0.4, confidence: 0.5, priority: 'urgent', sample_n: 20 });
    expect(scoreInsight(a, {})).toBeGreaterThan(scoreInsight(b, {}));
  });

  it('an urgent row scores at or above the URGENT_SHORT_CIRCUIT band', () => {
    // The separator is actually applied: any urgent row lands in the >= 1000 band,
    // above the entire non-urgent composite range (max ~48), so no non-urgent row
    // can ever reach it.
    const urgent = base({
      strokes_impact: 0.4, confidence: 0.5, priority: 'urgent',
      metric: 'three_putt_chain', sample_n: 5,
    });
    expect(scoreInsight(urgent, {})).toBeGreaterThanOrEqual(URGENT_SHORT_CIRCUIT);
  });
});

describe('scoreInsight damping', () => {
  it('a thin-sample zero-impact row ranks below a deep-sample one at equal priority+confidence', () => {
    const thin = base({
      strokes_impact: 0, confidence: 0.5, priority: 'low',
      metric: 'putts_made_25_plus_ft_pct', sample_n: 3,
    });
    const deep = base({
      strokes_impact: 0, confidence: 0.5, priority: 'low',
      metric: 'putts_made_25_plus_ft_pct', sample_n: 40,
    });
    expect(scoreInsight(deep, {})).toBeGreaterThan(scoreInsight(thin, {}));
  });
});

describe('scoreInsight exemption', () => {
  it('a par-scoring descriptive row gets NO floor (scores 0 when impact is 0)', () => {
    const par = base({
      strokes_impact: 0, confidence: 0.4, priority: 'low',
      metric: 'scoring_par_4', sample_n: 15,
    });
    expect(scoreInsight(par, {})).toBe(0);
  });

  it('an exempt metric does NOT crowd out an actionable zero-impact diagnostic', () => {
    const par = base({
      strokes_impact: 0, confidence: 1.0, priority: 'medium',
      metric: 'scoring_par_4', sample_n: 15,
    });
    const diag = base({
      strokes_impact: 0, confidence: 0.4, priority: 'low',
      metric: 'approach_proximity_125_175ft', sample_n: 30,
    });
    // Even though the par row has higher confidence + priority, it is exempt
    // (floor 0) so the actionable diagnostic outranks it.
    expect(scoreInsight(diag, {})).toBeGreaterThan(scoreInsight(par, {}));
  });

  it('an exempt metric with a REAL counterfactual-backfilled impact still ranks on impact', () => {
    // After Phase A4, par-scoring keeps impact 0; but if a future exempt metric
    // carries a genuine impact it must still rank — exemption only removes the floor.
    const par = base({
      strokes_impact: 0.9, confidence: 0.6, priority: 'medium',
      metric: 'scoring_par_4', sample_n: 15,
    });
    expect(scoreInsight(par, {})).toBeGreaterThan(0);
  });
});
