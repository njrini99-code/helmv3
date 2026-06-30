import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calculateHoleStatsFromShots, calculateStatsFromShots, type HoleInfo } from '@/lib/utils/golf-stats-calculator-shots';

const round = {
  id: 'property-round',
  round_date: '2026-06-01',
  course_name: 'Property Course',
  round_type: 'practice' as const,
  holes_played: 18,
  course_par: 72,
};

const holeArb = fc.record({
  par: fc.integer({ min: 3, max: 5 }),
  score: fc.integer({ min: 1, max: 12 }),
  putts: fc.integer({ min: 0, max: 6 }),
  gir: fc.boolean(),
});

function holesFromFacts(facts: Array<{ par: number; score: number; putts: number; gir: boolean }>): HoleInfo[] {
  return facts.map((fact, index) => ({
    round_id: round.id,
    hole_number: index + 1,
    par: fact.par,
    yardage: null,
    score: fact.score,
    putts: fact.putts,
    fairway_hit: fact.par >= 4 ? index % 2 === 0 : null,
    gir: fact.gir,
  }));
}

describe('Golf stats property contracts', () => {
  it('GH-STATS-001 and GH-STATS-002 preserve gross score and score-to-par for complete 18-hole facts', () => {
    fc.assert(
      fc.property(fc.array(holeArb, { minLength: 18, maxLength: 18 }), (facts) => {
        const holes = holesFromFacts(facts);
        const stats = calculateStatsFromShots([], holes, [round]);
        const gross = facts.reduce((sum, fact) => sum + fact.score, 0);
        const par = facts.reduce((sum, fact) => sum + fact.par, 0);

        expect(stats.scoringAverage18).toBe(gross);
        expect(stats.avgScoreToPar).toBe(gross - par);
      }),
      { numRuns: 100 },
    );
  });

  it('GH-STATS-003 and GH-STATS-004 classify 3-putts from putt count boundaries', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), (putts) => {
        const hole = calculateHoleStatsFromShots(
          [],
          { hole_number: 1, par: 4, score: 4, putts, fairway_hit: true, gir: true },
        );

        expect(hole.threePutts).toBe(putts >= 3);
      }),
      { numRuns: 100 },
    );
  });

  it('GH-STATS-007 and GH-STATS-008 never create scrambling opportunities on GIR holes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 3, max: 5 }), (score, par) => {
        const hole = calculateHoleStatsFromShots(
          [],
          { hole_number: 1, par, score, putts: 2, fairway_hit: par >= 4, gir: true },
        );

        expect(hole.scrambleAttempt).toBe(false);
        expect(hole.scrambleMade).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
