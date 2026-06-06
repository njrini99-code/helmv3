/**
 * W36 — coach-weighted ranking unit tests.
 *
 * loadCoachWeightsForPlayer hits Supabase, so that's exercised at
 * the integration layer. The pure score + rank fns are critical to
 * lock down: a sign flip ranks insights backwards across every
 * dashboard load.
 *
 * Tier-2 audit item #6 (2026-05-27) — goal-aware ranking. New tests
 * cover the `goalBoost` multiplier so insights touching a player's
 * active goal float to the top.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreInsight,
  rankInsights,
  coachabilityBoost,
  cappedStrokesImpact,
  STROKES_IMPACT_CEILING,
} from '@/lib/coachhelm/v3/ranking/score';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';

/**
 * Build a minimum-viable Goal stub. Only fields read by the ranking
 * code (`state`, `metric_id`, `category`) need real values; everything
 * else is filler to satisfy the Goal type.
 */
function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'g-stub',
    player_id: 'p-stub',
    team_id: null,
    created_by_user_id: 'u-stub',
    creator_role: 'player',
    coach_id_if_assigned: null,
    metric_id: 'sg_putting',
    title: 'stub goal',
    category: 'putting',
    started_at: '2026-01-01T00:00:00Z',
    ends_at: '2026-12-31T00:00:00Z',
    window_days: 30,
    baseline_value: null,
    current_value: null,
    target_value: null,
    target_source: null,
    state: 'active',
    outcome_evaluated_at: null,
    shared_with_coach: false,
    shared_at: null,
    coach_assignment_mode: null,
    player_accepted_at: null,
    player_declined_at: null,
    origin: 'manual',
    origin_insight_id: null,
    snapshots: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Goal;
}

describe('scoreInsight', () => {
  it('uses default weight 1.0 when insight_type not in weights map', () => {
    const score = scoreInsight(
      { insight_type: 'putt_distance', strokes_impact: 2, confidence: 0.8 },
      {},
    );
    expect(score).toBe(2 * 0.8 * 1.0);
  });

  it('applies coach-specific weight when calibrated', () => {
    const score = scoreInsight(
      { insight_type: 'putt_distance', strokes_impact: 2, confidence: 0.8 },
      { putt_distance: 1.5 },
    );
    expect(score).toBe(2 * 0.8 * 1.5);
  });

  it('uses absolute value of strokes_impact (sign just indicates direction)', () => {
    const pos = scoreInsight(
      { insight_type: 'x', strokes_impact: 1.5, confidence: 0.5 },
      {},
    );
    const neg = scoreInsight(
      { insight_type: 'x', strokes_impact: -1.5, confidence: 0.5 },
      {},
    );
    expect(pos).toBe(neg);
  });

  it('returns zero when confidence is zero', () => {
    expect(
      scoreInsight({ insight_type: 'x', strokes_impact: 5, confidence: 0 }, { x: 2 }),
    ).toBe(0);
  });

  it('returns zero when strokes_impact is zero', () => {
    expect(
      scoreInsight({ insight_type: 'x', strokes_impact: 0, confidence: 1 }, { x: 2 }),
    ).toBe(0);
  });
});

describe('rankInsights', () => {
  it('sorts descending by computed score', () => {
    const insights = [
      { insight_type: 'a', strokes_impact: 1, confidence: 0.5 },      // score 0.5
      { insight_type: 'b', strokes_impact: 3, confidence: 0.9 },      // score 2.7
      { insight_type: 'c', strokes_impact: 2, confidence: 0.7 },      // score 1.4
    ];
    const ranked = rankInsights(insights, {});
    expect(ranked.map((i) => i.insight_type)).toEqual(['b', 'c', 'a']);
  });

  it('preserves input order on score ties (stable sort)', () => {
    const insights = [
      { insight_type: 'first', strokes_impact: 1, confidence: 0.5 },
      { insight_type: 'second', strokes_impact: 1, confidence: 0.5 },
      { insight_type: 'third', strokes_impact: 1, confidence: 0.5 },
    ];
    const ranked = rankInsights(insights, {});
    expect(ranked.map((i) => i.insight_type)).toEqual(['first', 'second', 'third']);
  });

  it('coach weight can promote a lower-base insight above a higher-base one', () => {
    const insights = [
      { insight_type: 'low_base', strokes_impact: 1, confidence: 0.8 },  // 0.8
      { insight_type: 'high_base', strokes_impact: 2, confidence: 0.6 }, // 1.2
    ];
    // Without weights, high_base wins.
    expect(rankInsights(insights, {})[0]?.insight_type).toBe('high_base');
    // With a 2x weight on low_base, it should leapfrog.
    expect(
      rankInsights(insights, { low_base: 2 })[0]?.insight_type,
    ).toBe('low_base');
  });

  it('returns an empty array for empty input', () => {
    expect(rankInsights([], {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Goal-aware ranking (Tier 2 audit #6) — goalBoost multiplier
// ---------------------------------------------------------------------------

describe('scoreInsight — goal-aware boost', () => {
  // base carries a metric so the coachability factor is part of the baseline;
  // these tests isolate the GOAL multiplier layered on top of it.
  const base = { insight_type: 'x', strokes_impact: 2, confidence: 0.5, metric: 'sg_putting' };
  const baseScore = scoreInsight(base, {}, []); // 2 * 0.5 * coachability(sg_putting)

  it('returns the same score when activeGoals is empty (regression w/ W36)', () => {
    const withGoals = scoreInsight(
      { ...base, metric: 'sg_putting', category: 'putting' },
      {},
      [],
    );
    const withoutGoalsArg = scoreInsight(base, {});
    expect(withGoals).toBe(baseScore);
    expect(withGoals).toBe(withoutGoalsArg);
  });

  it('applies 1.5x boost when exactly one active goal matches the metric', () => {
    const goal = makeGoal({ metric_id: 'sg_putting', category: 'putting' });
    const score = scoreInsight(
      { ...base, metric: 'sg_putting', category: 'driving' },
      {},
      [goal],
    );
    expect(score).toBeCloseTo(baseScore * 1.5);
  });

  it('applies 2.0x boost when two or more active goals match', () => {
    const g1 = makeGoal({ id: 'g1', metric_id: 'sg_putting', category: 'putting' });
    // Second goal also matches via category (different metric, same category).
    const g2 = makeGoal({ id: 'g2', metric_id: 'putts_made_3_5ft_pct', category: 'putting' });
    const score = scoreInsight(
      { ...base, metric: 'sg_putting', category: 'putting' },
      {},
      [g1, g2],
    );
    expect(score).toBeCloseTo(baseScore * 2.0);
  });

  it('ignores non-active goals (paused/achieved/missed never boost)', () => {
    const paused = makeGoal({ state: 'paused', metric_id: 'sg_putting', category: 'putting' });
    const achieved = makeGoal({ state: 'achieved', metric_id: 'sg_putting', category: 'putting' });
    const score = scoreInsight(
      { ...base, metric: 'sg_putting', category: 'putting' },
      {},
      [paused, achieved],
    );
    expect(score).toBe(baseScore);
  });
});

describe('coachabilityBoost — strokes-recoverable-soon', () => {
  it('is 1.0 for an unknown / missing metric (no nudge)', () => {
    expect(coachabilityBoost(undefined)).toBe(1.0);
    expect(coachabilityBoost('not_a_metric')).toBe(1.0);
  });

  it('floats a fast-to-fix metric above a slow one of equal magnitude', () => {
    // sg_putting (4 wks) is more coachable-soon than sg_ott (24 wks).
    expect(coachabilityBoost('sg_putting')).toBeGreaterThan(coachabilityBoost('sg_ott'));
    const fast = scoreInsight({ insight_type: 'x', strokes_impact: 1, confidence: 1, metric: 'sg_putting' }, {});
    const slow = scoreInsight({ insight_type: 'x', strokes_impact: 1, confidence: 1, metric: 'sg_ott' }, {});
    expect(fast).toBeGreaterThan(slow);
  });

  it('stays clamped within [0.6, 1.5] so it nudges, never dominates', () => {
    for (const m of ['sg_putting', 'sg_ott', 'scoring_par_4', 'penalty_rate_per_round', 'gir_pct']) {
      const b = coachabilityBoost(m);
      expect(b).toBeGreaterThanOrEqual(0.6);
      expect(b).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('cappedStrokesImpact — ranking ceiling (audit EC-1 / FID-1/FID-2)', () => {
  it('caps a physically-impossible 42.5-stroke phantom at the ceiling magnitude', () => {
    expect(cappedStrokesImpact(42.5)).toBe(STROKES_IMPACT_CEILING);
    expect(cappedStrokesImpact(-42.5)).toBe(STROKES_IMPACT_CEILING);
  });

  it('passes a realistic per-round leak through untouched (magnitude < ceiling)', () => {
    expect(cappedStrokesImpact(2.1)).toBe(2.1);
    expect(cappedStrokesImpact(-1.5)).toBe(1.5);
  });

  it('treats NaN / non-finite impact as 0 (NaN-safe)', () => {
    expect(cappedStrokesImpact(NaN)).toBe(0);
    // Infinity is non-finite → 0 (never the ceiling). A real impact is always finite.
    expect(cappedStrokesImpact(Infinity)).toBe(0);
    expect(cappedStrokesImpact(-Infinity)).toBe(0);
  });

  it('scoreInsight uses the capped magnitude, so a 42.5 phantom cannot top a real leak', () => {
    // Uncapped a 42.5 × 0.5 = 21.25 phantom would dwarf a 3.0 × 1.0 = 3.0 leak.
    // Capped: 8 × 0.5 = 4 phantom vs 3.0 leak — and with a lower-confidence
    // phantom the real leak wins outright.
    const phantom = scoreInsight({ insight_type: 'scoring', strokes_impact: 42.5, confidence: 0.2 }, {});
    const realLeak = scoreInsight({ insight_type: 'putting', strokes_impact: 3.0, confidence: 1.0 }, {});
    expect(phantom).toBeLessThanOrEqual(STROKES_IMPACT_CEILING * 0.2);
    expect(realLeak).toBeGreaterThan(phantom);
  });
});
