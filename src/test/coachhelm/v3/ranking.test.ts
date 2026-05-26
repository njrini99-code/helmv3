/**
 * W36 — coach-weighted ranking unit tests.
 *
 * loadCoachWeightsForPlayer hits Supabase, so that's exercised at
 * the integration layer. The pure score + rank fns are critical to
 * lock down: a sign flip ranks insights backwards across every
 * dashboard load.
 */

import { describe, it, expect } from 'vitest';
import { scoreInsight, rankInsights } from '@/lib/coachhelm/v3/ranking/score';

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
