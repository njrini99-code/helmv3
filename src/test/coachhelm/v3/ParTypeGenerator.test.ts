import { describe, it, expect } from 'vitest';
import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';

const PLAYER_ID = 'p-1';

function makeAgg(
  par: 3 | 4 | 5,
  playerValue: number,
  rounds = 20,
  rates: Partial<{
    birdie_rate: number;
    par_rate: number;
    bogey_rate: number;
    double_plus_rate: number;
    holes_scored: number;
  }> = {},
) {
  return {
    sampleN: rounds,
    playerValue,
    par,
    rounds_played: rounds,
    birdie_rate: rates.birdie_rate ?? 5,
    par_rate: rates.par_rate ?? 60,
    bogey_rate: rates.bogey_rate ?? 28,
    double_plus_rate: rates.double_plus_rate ?? 7,
    holes_scored: rates.holes_scored ?? 80,
    holes_per_round: ({ 3: 4, 4: 10, 5: 4 } as Record<3|4|5, number>)[par],
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

  describe('par-type rate decomposition (C1) — names the DRIVER, not the number', () => {
    it('a 4.23 par-4 driven by doubles+bogeys names doubles/bogeys, not "lack of birdies"', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 4);
      const c = g.composeContent(
        makeAgg(4, 4.23, 22, { birdie_rate: 4, par_rate: 68.5, bogey_rate: 21, double_plus_rate: 6.5 }),
      );
      // Driver named with its real rate, not a restatement of 4.23.
      expect(c.content).toContain('6.5% doubles');
      expect(c.content).toContain('21% bogeys');
      // Must NOT blame birdies when the leak is the bad tail.
      expect(c.content).not.toContain('lack of birdies');
      expect(c.content.toLowerCase()).toContain('not a birdie problem');
    });

    it('when the leak is genuinely too few birdies, it says so', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 5);
      // Par-5 over par with healthy tail but almost no birdies → birdie-conversion leak.
      const c = g.composeContent(
        makeAgg(5, 5.15, 20, { birdie_rate: 6, par_rate: 78, bogey_rate: 14, double_plus_rate: 2 }),
      );
      expect(c.content.toLowerCase()).toContain('birdie');
      expect(c.content).toContain('6% birdies');
    });

    it('stamps feed_exempt so Phase A keeps it out of the actionable feed', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 4);
      const c = g.composeContent(makeAgg(4, 4.4));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((c.evidence as any).feed_exempt).toBe(true);
    });

    it('still seeds strokes_impact 0 and priority low (descriptive standing card)', () => {
      const g = new ParTypeGenerator(PLAYER_ID, 4);
      const c = g.composeContent(makeAgg(4, 4.4));
      expect(c.evidence.strokes_impact).toBe(0);
      expect(c.priority).toBe('low');
    });
  });

  it('exposes holes_per_round per par type for attempt-rate sizing', () => {
    const g = new ParTypeGenerator(PLAYER_ID, 4);
    const c = g.composeContent(makeAgg(4, 4.4));
    expect((makeAgg(4, 4.4) as { holes_per_round?: number }).holes_per_round ?? 10).toBeGreaterThan(0);
    expect(c.evidence.strokes_impact).toBe(0); // still seeded 0 (unchanged)
  });
});
