/**
 * "SG <area>: Primary Stroke Sink" is the highest-priority insight the stats
 * generator emits — `analyzeStrokesGained` runs first, and the insight is
 * marked `critical` whenever the loss exceeds a stroke. It is the first thing
 * a coach reads about a player.
 *
 * Measured in production 2026-08-17 (`golf_coach_insights`):
 *
 *   title                              rows  distinct bodies  players
 *   SG Putting: Primary Stroke Sink      14                3        8
 *   SG Approach: Primary Stroke Sink      5                3        4
 *
 * Nine of those fourteen carry BYTE-IDENTICAL text:
 *
 *   "You're losing 3.9 strokes per round in putting. This is your biggest area
 *    for improvement and represents the best opportunity to lower your scores."
 *
 * Every body is exactly 147 characters. The only thing that varies across the
 * whole set is the one substituted number; the second sentence is boilerplate
 * that restates that the worst area is the worst area.
 *
 * The generator already holds everything needed to say something diagnostic —
 * all four SG categories sorted, each one's benchmark, the best area, and
 * `roundsPlayed` — and passes none of it into the body.
 *
 * The test below is the sharp version of the complaint: two players whose SG
 * profiles demand COMPLETELY different coaching produce identical prose,
 * because the only input to the sentence is the magnitude of the worst area.
 */
import { describe, it, expect } from 'vitest';
import { StatsInsightGenerator } from '@/lib/coachhelm/v2/mining/stats-insight-generator';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

function makeStats(sg: {
  tee: number;
  approach: number;
  aroundGreen: number;
  putting: number;
  rounds?: number;
}): GolfStats {
  // `puttingByBreak` is required on GolfStats and dereferenced unguarded by
  // `analyzePuttingBreakWeakness`. The real calculator always populates it, so
  // an empty set here just makes that analyzer bail on its <30-putt floor and
  // leaves the stroke-sink path under test.
  const emptyBreak = {
    totalPutts: 0,
    makePct: null,
    avgPuttsPerHole: null,
    threePuttPct: null,
    byDistance: {},
  };
  return {
    roundsPlayed: sg.rounds ?? 18,
    sgTotalPerRound: sg.tee + sg.approach + sg.aroundGreen + sg.putting,
    sgTeePerRound: sg.tee,
    sgApproachPerRound: sg.approach,
    sgAroundGreenPerRound: sg.aroundGreen,
    sgPuttingPerRound: sg.putting,
    puttingByBreak: {
      left_to_right: emptyBreak,
      straight: emptyBreak,
      right_to_left: emptyBreak,
      multiple: emptyBreak,
    },
  } as unknown as GolfStats;
}

/** Putting is the ONE problem — everything else is essentially fine. */
const ISOLATED = makeStats({ tee: -0.1, approach: -0.2, aroundGreen: -0.1, putting: -3.9 });

/** Every part of the game is bleeding; putting is worst only by a hair. */
const UNIFORM = makeStats({ tee: -3.6, approach: -3.7, aroundGreen: -3.5, putting: -3.9 });

async function strokeSinkBody(stats: GolfStats): Promise<string> {
  const insights = await new StatsInsightGenerator('player-1').generateInsights(stats);
  const sink = insights.find((i) => i.headline.includes('Primary Stroke Sink'));
  if (!sink) throw new Error('no stroke-sink insight generated');
  return sink.body;
}

describe('SG stroke-sink insight body', () => {
  it('is generated for both profiles (guards the fixture itself)', async () => {
    await expect(strokeSinkBody(ISOLATED)).resolves.toContain('3.9');
    await expect(strokeSinkBody(UNIFORM)).resolves.toContain('3.9');
  });

  it('distinguishes an isolated weakness from a whole-game collapse', async () => {
    // Both players lose 3.9 strokes putting. One should be told to go fix their
    // putting; the other has a 3.5-stroke hole everywhere and needs to know
    // that putting is barely the worst of four problems. Identical prose for
    // these two is the defect.
    const isolated = await strokeSinkBody(ISOLATED);
    const uniform = await strokeSinkBody(UNIFORM);
    expect(isolated).not.toBe(uniform);
  });

  it('quantifies the gap to the next-worst area, not just the raw loss', async () => {
    // Isolated: next-worst is approach at -0.2, so putting is 3.7 clear.
    const isolated = await strokeSinkBody(ISOLATED);
    expect(isolated).toMatch(/3\.7/);
  });

  it('says how many rounds it is speaking for', async () => {
    // A claim this strong, made as the first thing a coach reads, has to carry
    // its own sample size — the coach cannot see it otherwise.
    const body = await strokeSinkBody(makeStats({ tee: -0.1, approach: -0.2, aroundGreen: -0.1, putting: -3.9, rounds: 7 }));
    expect(body).toMatch(/\b7\b/);
  });

  it('drops the content-free "biggest area for improvement" boilerplate', async () => {
    const body = await strokeSinkBody(ISOLATED);
    expect(body).not.toContain('represents the best opportunity to lower your scores');
  });
});
