import { describe, it, expect } from 'vitest';
import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';

const PLAYER_ID = 'p-1';

function makeAgg(over: Partial<{
  playerValue: number;
  practice_avg: number;
  competitive_avg: number;
  practice_count: number;
  competitive_count: number;
}> = {}) {
  return {
    sampleN: (over.practice_count ?? 8) + (over.competitive_count ?? 5),
    playerValue: over.playerValue ?? 1.5,
    practice_avg: over.practice_avg ?? 0.8,
    competitive_avg: over.competitive_avg ?? 2.3,
    practice_count: over.practice_count ?? 8,
    competitive_count: over.competitive_count ?? 5,
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
