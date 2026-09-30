import { describe, it, expect } from 'vitest';
import { calculateStatsFromShots } from '../golf-stats-calculator-shots';
import type { RawShot } from '../golf-stats-calculator-shots';
import { makeRawShot, makeHoleInfo, makeRoundInfo } from '@/test/fixtures/golf-shots';
import fixtures from './fixtures/sg-shot-rules.json';

/**
 * TS <-> SQL strokes-gained parity (Q-89, migration
 * 20260930150000_golf_sg_penalty_charged_to_earning_shot.sql). The fixtures are
 * one hole each; `expected` is what the production SQL function returns for
 * exactly those shots, and supabase/tests/rls/strokes_gained_shot_rules.sql
 * asserts the same numbers, so the two engines cannot drift apart silently:
 *   - a penalty is charged to the shot that earned it (previous real shot, else
 *     the next one, else the row itself);
 *   - a shot ends where the next non-penalty shot starts, so a hole's SG is
 *     expected(first shot) - strokes.
 */

type FixtureShot = Record<string, string | number | boolean | null>;
interface FixtureCase {
  id: string;
  par: number;
  note: string;
  shots: FixtureShot[];
  expected: { off_tee: number; approach: number; around_green: number; putting: number; total: number };
}

function sgFor(c: FixtureCase) {
  const shots: RawShot[] = c.shots.map((s) =>
    makeRawShot({
      club_type: null,
      shot_distance: null,
      ...(s as Partial<RawShot>),
      hole_id: 'hole-1',
      hole_number: 1,
    }),
  );
  const putts = c.shots.filter((s) => s.shot_type === 'putting').length;
  const stats = calculateStatsFromShots(
    shots,
    [makeHoleInfo({ id: 'hole-1', hole_number: 1, par: c.par, score: c.shots.length, putts })],
    [makeRoundInfo({ id: 'round-1', holes_played: 1 })],
  );
  return {
    off_tee: stats.strokesGainedTee ?? 0,
    approach: stats.strokesGainedApproach ?? 0,
    around_green: stats.strokesGainedAroundGreen ?? 0,
    putting: stats.strokesGainedPutting ?? 0,
    total: stats.strokesGainedTotal ?? 0,
  };
}

describe('strokes gained: shot rules shared with the SQL functions', () => {
  for (const c of fixtures.cases as unknown as FixtureCase[]) {
    it(`${c.id}: ${c.note}`, () => {
      const sg = sgFor(c);
      expect(sg.off_tee).toBeCloseTo(c.expected.off_tee, 2);
      expect(sg.approach).toBeCloseTo(c.expected.approach, 2);
      expect(sg.around_green).toBeCloseTo(c.expected.around_green, 2);
      expect(sg.putting).toBeCloseTo(c.expected.putting, 2);
      expect(sg.total).toBeCloseTo(c.expected.total, 2);
    });
  }

  it('a hole whose shots chain (a lie break between two shots) telescopes to expected(first shot) - strokes', () => {
    // The lie-break fixture is also the only hole whose per-shot ends disagree
    // with the next shot's start; with the next-shot-start rule its total does
    // not depend on where that break sits.
    const c = (fixtures.cases as unknown as FixtureCase[]).find((x) => x.id === 'lie-break-between-shots')!;
    const relabelled: FixtureCase = {
      ...c,
      shots: c.shots.map((s, i) => (i === 0 ? { ...s, lie_after: 'fairway', distance_to_hole_after: 155 } : s)),
    };
    expect(sgFor(c).total).toBeCloseTo(sgFor(relabelled).total, 3);
  });
});
