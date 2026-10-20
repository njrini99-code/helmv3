import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import { compositeSampleUnit, compositeWindowRoundIds } from '../synthesis';
import type { CompositeContext, EvidenceInsight } from '../types';

function insight(id: string, type: string, sampleN: number, rounds?: string[]): EvidenceInsight {
  return {
    id,
    insight_type: type,
    category: 'putting',
    signature: `v3:${type}`,
    player_id: 'p1',
    engine_version: 'v3',
    created_at: '2026-10-01T00:00:00Z',
    evidence: {
      metric: 'm',
      metric_label: 'M',
      unit: 'percent',
      your_value: 1,
      your_value_display: '1',
      comparison_value: 1,
      comparison_label: 'x',
      comparison_source: 'team_avg',
      sample_n: sampleN,
      window_days: 90,
      window_start: '',
      window_end: '',
      strokes_impact: 0,
      strokes_impact_method: 'peer_delta',
      confidence: 0.5,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      ...(rounds ? { source_round_ids: rounds } : {}),
    },
  };
}

const ctx: CompositeContext = {
  hole_scores: [
    { round_id: 'h1', hole_number: 1, par: 4, score: 5 },
    { round_id: 'h1', hole_number: 2, par: 4, score: 4 },
    { round_id: 'h2', hole_number: 1, par: 4, score: 4 },
  ],
  short_game_shots: [
    { round_id: 's1', hole_number: 3, lie_before: 'sand', distance_to_hole_before: 10, distance_to_hole_after: 20 },
  ],
  flyer_lie_shots: [],
};

describe('compositeWindowRoundIds', () => {
  it('a context rule uses the rounds of the context array it reads', () => {
    const match = { source_insight_ids: [], signals: {} };
    expect(compositeWindowRoundIds('closing_hole_fatigue', match, [], ctx)?.sort()).toEqual(['h1', 'h2']);
    expect(compositeWindowRoundIds('short_side_scrambling_chain', match, [], ctx)).toEqual(['s1']);
    expect(compositeWindowRoundIds('flyer_lie_over_the_green', match, [], ctx)).toBeNull();
    expect(compositeWindowRoundIds('unknown_ctx_rule', match, [], ctx)).toBeNull();
  });

  it('an insight rule takes the union of its sources’ rounds', () => {
    const insights = [insight('a', 'putt_distance', 30, ['r1', 'r2']), insight('b', 'putt_distance', 25, ['r2', 'r3'])];
    const ids = compositeWindowRoundIds('lag_distance_3putt', { source_insight_ids: ['a', 'b'], signals: {} }, insights, ctx);
    expect(ids?.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('falls back (null) when a source predates the stamp', () => {
    const insights = [insight('a', 'putt_distance', 30, ['r1']), insight('b', 'pressure_gap', 12)];
    expect(
      compositeWindowRoundIds('pressure_decel_chain', { source_insight_ids: ['a', 'b'], signals: {} }, insights, ctx),
    ).toBeNull();
  });
});

describe('compositeSampleUnit', () => {
  it('context rules have a fixed unit', () => {
    expect(compositeSampleUnit('doubles_after_bogey', { sample_n: 14 }, [], [])).toBe('holes');
  });

  it('insight rules take the unit of the source whose count they used', () => {
    const insights = [insight('a', 'pressure_gap', 12), insight('b', 'putt_distance', 30)];
    expect(compositeSampleUnit('pressure_decel_chain', { sample_n: 12 }, ['a', 'b'], insights)).toBe('rounds');
    expect(compositeSampleUnit('pressure_decel_chain', { sample_n: 30 }, ['a', 'b'], insights)).toBe('putts');
    expect(compositeSampleUnit('pressure_decel_chain', { sample_n: 7 }, ['a', 'b'], insights)).toBeNull();
  });
});
