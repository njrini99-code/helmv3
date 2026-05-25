/**
 * v3 PuttDistanceGenerator (W21) — content composition + signature tests.
 *
 * Doesn't exercise the full BaseGenerator.run() lifecycle (that would
 * need Supabase mocks for cache + standing + counterfactual). Instead
 * we instantiate the generator, hand it a synthetic aggregate, and
 * verify the title / content / signature / evidence shape are correct.
 *
 * The end-to-end orchestrator integration test belongs to W25 (cutover).
 */

import { describe, it, expect } from 'vitest';
import { PuttDistanceGenerator } from '@/lib/coachhelm/v3/generators/putt-distance';

const PLAYER_ID = 'player-test-1';

function makeAgg(overrides: Partial<{
  bucket: '3_5ft' | '5_10ft' | '10_15ft';
  playerValue: number;
  rounds_played: number;
}> = {}) {
  return {
    sampleN: overrides.rounds_played ?? 20,
    playerValue: overrides.playerValue ?? 35,
    bucket: overrides.bucket ?? '10_15ft',
    rawValue: (overrides.playerValue ?? 35) / 100,
    rounds_played: overrides.rounds_played ?? 20,
  };
}

describe('PuttDistanceGenerator', () => {
  it('has the right name, insightType, category, minSampleN', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '10_15ft');
    expect(g.name).toBe('PuttDistanceGenerator');
    expect(g.insightType).toBe('putt_distance');
    expect(g.category).toBe('putting');
    expect(g.minSampleN).toBe(5);
  });

  it('maps bucket → metricId correctly', () => {
    expect(new PuttDistanceGenerator(PLAYER_ID, '3_5ft').metricId).toBe('putts_made_3_5ft_pct');
    expect(new PuttDistanceGenerator(PLAYER_ID, '5_10ft').metricId).toBe('putts_made_5_10ft_pct');
    expect(new PuttDistanceGenerator(PLAYER_ID, '10_15ft').metricId).toBe('putts_made_10_15ft_pct');
  });

  it('composeContent renders a sensible title + content + signature for 10-15 ft', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '10_15ft');
    const composed = g.composeContent(makeAgg({ bucket: '10_15ft', playerValue: 32, rounds_played: 18 }));
    expect(composed.title).toContain('10-15 ft');
    expect(composed.title).toContain('32%');
    expect(composed.content).toContain('18 rounds');
    expect(composed.content).toContain('32%');
    expect(composed.signature).toBe('putt_distance:10_15ft');
  });

  it('composeContent produces evidence with the canonical metric_id + display label', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '5_10ft');
    const composed = g.composeContent(makeAgg({ bucket: '5_10ft', playerValue: 55 }));
    expect(composed.evidence.metric).toBe('putts_made_5_10ft_pct');
    expect(composed.evidence.metric_label).toBe('Putts Made 5-10 ft');
    expect(composed.evidence.unit).toBe('percent');
    expect(composed.evidence.your_value).toBe(55);
    expect(composed.evidence.your_value_display).toBe('55%');
    expect(composed.evidence.comparison_source).toBe('pga_baseline');
  });

  it('composeContent confidence_factors.sample_adequacy scales with rounds_played and caps at 1', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '10_15ft');
    const small = g.composeContent(makeAgg({ rounds_played: 6 }));
    expect(small.evidence.confidence_factors.sample_adequacy).toBeCloseTo(0.2, 1);
    const large = g.composeContent(makeAgg({ rounds_played: 60 }));
    expect(large.evidence.confidence_factors.sample_adequacy).toBe(1);
  });
});
