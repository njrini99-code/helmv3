import { describe, it, expect } from 'vitest';
import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';

const PLAYER_ID = 'p-1';

function makeAgg(par: 3 | 4 | 5, playerValue: number, rounds = 20) {
  return {
    sampleN: rounds,
    playerValue,
    par,
    rounds_played: rounds,
  };
}

describe('ParTypeGenerator', () => {
  it('identity for each par variant', () => {
    expect(new ParTypeGenerator(PLAYER_ID, 3).metricId).toBe('scoring_par_3');
    expect(new ParTypeGenerator(PLAYER_ID, 4).metricId).toBe('scoring_par_4');
    expect(new ParTypeGenerator(PLAYER_ID, 5).metricId).toBe('scoring_par_5');
  });

  it('common properties', () => {
    const g = new ParTypeGenerator(PLAYER_ID, 4);
    expect(g.name).toBe('ParTypeGenerator');
    expect(g.insightType).toBe('par_scoring');
    expect(g.category).toBe('scoring');
    expect(g.minSampleN).toBe(5);
  });

  it('composes a "+0.20 vs par" insight when player scores 4.20 on par 4', () => {
    const g = new ParTypeGenerator(PLAYER_ID, 4);
    const c = g.composeContent(makeAgg(4, 4.2, 22));
    expect(c.title).toContain('Par 4');
    expect(c.title).toContain('4.20');
    expect(c.title).toContain('+0.20');
    expect(c.content).toContain('22 rounds');
    expect(c.signature).toBe('par_scoring:par4');
    expect(c.evidence.metric).toBe('scoring_par_4');
    expect(c.evidence.unit).toBe('strokes');
    expect(c.evidence.comparison_value).toBe(4);
    expect(c.evidence.comparison_source).toBe('absolute_target');
  });

  it('composes a negative-delta insight for under-par scoring on par 5', () => {
    const g = new ParTypeGenerator(PLAYER_ID, 5);
    const c = g.composeContent(makeAgg(5, 4.7));
    expect(c.title).toContain('-0.30');
    expect(c.signature).toBe('par_scoring:par5');
  });
});
