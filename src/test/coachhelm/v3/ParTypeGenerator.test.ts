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

  // par-type seeds strokes_impact:0. "Impact" is a gap-to-COHORT quantity, so the
  // BaseGenerator backfills the real (capped) value from the counterfactual when
  // there is genuine cohort-relative leverage. composeContent must NOT seed a
  // gap-to-PAR diagnostic: when the CF is suppressed (player at/better than
  // cohort) the base keeps the seed, and a non-zero gap-to-par would float a
  // non-weakness to the top of the feed (audit par_scoring phantom impact).
  describe('strokes_impact is seeded 0 (impact comes from the counterfactual)', () => {
    it('an over-par par-4 average still seeds 0, not a gap×10 diagnostic', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 4);
      const c = g.composeContent(makeAgg(4, 4.4)); // +0.40 over par
      expect(c.evidence.strokes_impact).toBe(0);
      expect(c.priority).toBe('low'); // descriptive — StandingBar carries severity
    });

    it('an over-par par-3 average seeds 0', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 3);
      expect(g.composeContent(makeAgg(3, 3.5)).evidence.strokes_impact).toBe(0);
    });

    it('at/under par seeds 0', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 5);
      expect(g.composeContent(makeAgg(5, 4.7)).evidence.strokes_impact).toBe(0);
      expect(g.composeContent(makeAgg(5, 5.0)).evidence.strokes_impact).toBe(0);
    });
  });
});
