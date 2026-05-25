import { describe, it, expect } from 'vitest';
import { PuttBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-bias';

const PLAYER_ID = 'p-1';

function makeAgg(overrides: Partial<{
  weakest: 'left' | 'right' | 'straight';
  weakest_pct: number;
  straight_pct: number;
  rounds_played: number;
}> = {}) {
  return {
    sampleN: overrides.rounds_played ?? 20,
    playerValue: overrides.weakest_pct ?? 28,
    weakest_direction: overrides.weakest ?? 'left' as const,
    straight_pct: overrides.straight_pct ?? 38,
    weakest_pct: overrides.weakest_pct ?? 28,
    rounds_played: overrides.rounds_played ?? 20,
  };
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

  it('composes a directional insight when weakness is found', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent(makeAgg({
      weakest: 'left',
      weakest_pct: 28,
      straight_pct: 40,
      rounds_played: 22,
    }));
    expect(c.title).toContain('Putting bias');
    expect(c.title).toContain('left-to-right break');
    expect(c.title).toContain('28%');
    expect(c.content).toContain('22 rounds');
    expect(c.content).toContain('12-point gap');
    expect(c.signature).toBe('putt_bias:left');
  });

  it('composes a "balanced" insight when no direction is weak', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent(makeAgg({
      weakest: 'straight',
      weakest_pct: 40,
      straight_pct: 40,
    }));
    expect(c.title).toContain('balanced');
    expect(c.signature).toBe('putt_bias:straight');
  });

  it('evidence uses your_baseline as comparison_source', () => {
    const g = new PuttBiasGenerator(PLAYER_ID, 'left');
    const c = g.composeContent(makeAgg());
    expect(c.evidence.comparison_source).toBe('your_baseline');
    expect(c.evidence.unit).toBe('percent');
  });
});
