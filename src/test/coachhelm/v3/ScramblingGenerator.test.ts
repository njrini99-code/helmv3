import { describe, it, expect } from 'vitest';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';

const PLAYER_ID = 'p-1';

function makeAgg(overrides: Partial<{
  playerValue: number;
  attempts: number;
  rounds_played: number;
}> = {}) {
  return {
    sampleN: overrides.rounds_played ?? 20,
    playerValue: overrides.playerValue ?? 45,
    lie: 'sand' as const,
    attempts: overrides.attempts ?? 12,
    rounds_played: overrides.rounds_played ?? 20,
  };
}

describe('ScramblingGenerator', () => {
  it('identity properties', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    expect(g.name).toBe('ScramblingGenerator');
    expect(g.insightType).toBe('scrambling');
    expect(g.category).toBe('short_game');
    expect(g.minSampleN).toBe(5);
    expect(g.metricId).toBe('scrambling_pct_sand');
  });

  it('composes a sand-save insight with PGA comparison anchored to 50%', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({ playerValue: 42, attempts: 15, rounds_played: 22 }));
    expect(c.title).toContain('Sand save rate');
    expect(c.title).toContain('42%');
    expect(c.content).toContain('22 rounds');
    expect(c.content).toContain('15 total');
    expect(c.signature).toBe('scrambling:sand');
    expect(c.evidence.comparison_source).toBe('pga_baseline');
    expect(c.evidence.comparison_value).toBe(50);
  });

  it('sample_adequacy scales with attempts and caps at 1', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    expect(g.composeContent(makeAgg({ attempts: 5 })).evidence.confidence_factors.sample_adequacy)
      .toBeCloseTo(0.25);
    expect(g.composeContent(makeAgg({ attempts: 40 })).evidence.confidence_factors.sample_adequacy)
      .toBe(1);
  });
});
