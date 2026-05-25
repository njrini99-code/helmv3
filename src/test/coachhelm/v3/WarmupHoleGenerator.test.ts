import { describe, it, expect } from 'vitest';
import { WarmupHoleGenerator } from '@/lib/coachhelm/v3/generators/warmup-hole';

const PLAYER_ID = 'p-1';

function makeAgg(over: Partial<{
  playerValue: number;
  hole1_avg: number;
  rest_avg: number;
  rounds_with_hole1: number;
}> = {}) {
  return {
    sampleN: over.rounds_with_hole1 ?? 12,
    playerValue: over.playerValue ?? 0.35,
    hole1_avg: over.hole1_avg ?? 0.45,
    rest_avg: over.rest_avg ?? 0.10,
    rounds_with_hole1: over.rounds_with_hole1 ?? 12,
  };
}

describe('WarmupHoleGenerator', () => {
  it('identity', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    expect(g.name).toBe('WarmupHoleGenerator');
    expect(g.insightType).toBe('warmup_hole');
    expect(g.category).toBe('pressure');
    expect(g.metricId).toBe('opening_hole_delta');
    expect(g.minSampleN).toBe(5);
  });

  it('positive delta = "harder" framing', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: 0.35 }));
    expect(c.title).toContain('+0.35');
    expect(c.content).toContain('harder than holes 2-18');
    expect(c.signature).toBe('warmup_hole:hole_1');
  });

  it('negative delta = "easier" framing', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: -0.20, hole1_avg: -0.10, rest_avg: 0.10 }));
    expect(c.title).toContain('-0.20');
    expect(c.content).toContain('easier than holes 2-18');
  });

  it('includes round count', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ rounds_with_hole1: 18 }));
    expect(c.content).toContain('18 rounds');
  });

  it('evidence references PGA 0.1 anchor', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg());
    expect(c.evidence.comparison_value).toBe(0.1);
    expect(c.evidence.comparison_source).toBe('pga_baseline');
    expect(c.evidence.unit).toBe('strokes');
  });
});
