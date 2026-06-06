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

  // par-type-3: the ×4/×10/×4 holes/round leverage lets the par-4 family project
  // the whole-round gap and dominate the top-3. The generator caps its declared
  // strokes_impact at the per-par ceiling and stays descriptive (priority low).
  describe('par-type-3 leverage cap', () => {
    it('par-4 strokes_impact is capped at the par-4 ceiling (1.5), not gap×10', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 4);
      // +0.40 over par × 10 holes = 4.0 raw → capped to the 1.5 ceiling.
      const c = g.composeContent(makeAgg(4, 4.4));
      expect(c.evidence.strokes_impact).toBe(1.5);
      expect(c.evidence.strokes_impact_method).toBe('rough_estimate');
      expect(c.priority).toBe('low'); // descriptive — never dominates top-3
    });

    it('par-3 strokes_impact is capped at the par-3 ceiling (1.0)', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 3);
      // +0.50 over par × 4 holes = 2.0 raw → capped to 1.0.
      expect(g.composeContent(makeAgg(3, 3.5)).evidence.strokes_impact).toBe(1.0);
    });

    it('a small over-par gap stays below the ceiling (uncapped)', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 4);
      // +0.08 × 10 = 0.8 < 1.5 ceiling.
      expect(g.composeContent(makeAgg(4, 4.08)).evidence.strokes_impact).toBeCloseTo(0.8, 3);
    });

    it('at/under par is not "costing" strokes → 0', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 5);
      expect(g.composeContent(makeAgg(5, 4.7)).evidence.strokes_impact).toBe(0);
      expect(g.composeContent(makeAgg(5, 5.0)).evidence.strokes_impact).toBe(0);
    });
  });
});
