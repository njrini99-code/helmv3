/**
 * Slice 5b counted families: par-3 tee split, SG per approach, lag leave,
 * under-reading, and the three-putt link. Synthetic rounds only.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import { ANGLE_FAMILIES, type AngleHole, type AngleRound, type AngleShot } from '../angle-data';
import {
  ApproachSgGenerator,
  Par3TeeGenerator,
  composeSgFamily,
  computeSgFamily,
  poolOf,
  sgGapInput,
  toSgAggregate,
} from '../approach-sg';
import { extractApproaches, extractPutts, sideOfMiss, depthOfMiss, type TeamShotData, type TeammateShots } from '../counted-shots';
import { composeLagLeave, computeLagLeave, lagLinkLine, lagLinkOf, lowerShareZ, toLagAggregate } from '../lag-leave';
import { composeUnderReading, computeUnderReading, toUnderReadingAggregate } from '../under-reading';
import { composeThreePuttChain, computeThreePuttChain, toThreePuttAggregate, type ThreePuttBenchmark } from '../three-putt-chain';
import { bandApproachShots } from '@/lib/coachhelm/v3/generators/approach-miss';
import type { ApproachShot } from '@/lib/coachhelm/v3/engine/shot-source';
import { buildCandidate } from '@/lib/coachhelm/v3/support/candidate';
import { expectFamilyContract } from './contract';
import { PLAYER, mkData, mkHole, mkRound, mkShot, stubLoaders } from './fixtures';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface World {
  rounds: AngleRound[];
  holes: AngleHole[];
  shots: AngleShot[];
}

/**
 * `n` rounds; holes 1–4 are par 3s (tee shot from 150–170 yd), holes 5–18
 * par 4s with an approach from 90–119 yd. `good` approaches and tee shots
 * find the green 12–20 ft away; bad ones miss short into the rough 20–34 yd
 * out.
 */
function approachWorld(prefix: string, n: number, good: boolean): World {
  const w: World = { rounds: [], holes: [], shots: [] };
  for (let i = 0; i < n; i++) {
    const r = mkRound(i, { id: `${prefix}r${i}` });
    w.rounds.push(r);
    for (let h = 1; h <= 18; h++) {
      const par = h <= 4 ? 3 : 4;
      w.holes.push(mkHole(r.id, h, { par }));
      const d = par === 3 ? 150 + ((h * 7 + i) % 21) : 90 + ((h * 3 + i) % 30);
      const finish = good
        ? { lie_after: 'green', result: 'green', distance_to_hole_after: 12 + ((h + i) % 9), distance_unit_after: 'feet' }
        : { lie_after: 'rough', result: 'rough', distance_to_hole_after: 20 + ((h + i) % 15), distance_unit_after: 'yards', miss_direction: 'short' };
      if (par === 3) {
        w.shots.push(mkShot(r.id, h, 1, { shot_type: 'approach', lie_before: 'tee', distance_to_hole_before: d, ...finish }));
      } else {
        w.shots.push(mkShot(r.id, h, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, lie_after: 'fairway', result: 'fairway', distance_to_hole_after: d, distance_unit_after: 'yards' }));
        w.shots.push(mkShot(r.id, h, 2, { shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: d, ...finish }));
      }
    }
  }
  return w;
}

function teammate(id: string, w: World): TeammateShots {
  return {
    player_id: id,
    rounds: w.rounds.map((r) => ({ id: r.id, date: r.date, holes: r.holes })),
    holes: w.holes,
    shots: w.shots.filter((s) => s.shot_type === 'approach' || s.shot_type === 'putting' || s.shot_type === 'penalty'),
  };
}

function team(count: number, build: (p: number) => World): TeamShotData {
  return { teammates: Array.from({ length: count }, (_, p) => teammate(`peer-${p}`, build(p))) };
}

/**
 * `n` rounds of 18 holes, each starting with a 40 ft first putt. `insideShare`
 * of the lags finish 3 ft away (2 putts); the rest finish 9 ft away and every
 * other one of those becomes a 3-putt. `brk` and `lowShare` tag the first
 * (missed) putt as a breaking putt that missed low or high.
 */
function puttWorld(
  prefix: string,
  n: number,
  insideShare: number,
  opts: { lowShare?: number; tagged?: number } = {},
): World {
  const w: World = { rounds: [], holes: [], shots: [] };
  let k = 0;
  for (let i = 0; i < n; i++) {
    const r = mkRound(i, { id: `${prefix}r${i}` });
    w.rounds.push(r);
    for (let h = 1; h <= 18; h++) {
      k += 1;
      const inside = (k % 100) / 100 < insideShare;
      const three = !inside && k % 2 === 0;
      const putts = three ? 3 : 2;
      w.holes.push(mkHole(r.id, h, { putts }));
      const low = ((k * 37) % 100) / 100 < (opts.lowShare ?? 0.5);
      const tagged = ((k * 53) % 100) / 100 < (opts.tagged ?? 1);
      const base = { shot_type: 'putting', lie_before: 'green', distance_unit_before: 'feet' } as const;
      w.shots.push(
        mkShot(r.id, h, 2, {
          ...base,
          putt_distance_feet: 40,
          distance_to_hole_before: 40,
          putt_made: false,
          putt_break: h % 2 === 0 ? 'left_to_right' : 'right_to_left',
          miss_direction: tagged ? (low ? 'low' : 'high') : null,
        }),
      );
      const leave = inside ? 3 : 9;
      w.shots.push(mkShot(r.id, h, 3, { ...base, putt_distance_feet: leave, distance_to_hole_before: leave, putt_made: !three, putt_break: 'straight' }));
      if (three) w.shots.push(mkShot(r.id, h, 4, { ...base, putt_distance_feet: 2, distance_to_hole_before: 2, putt_made: true }));
    }
  }
  return w;
}

const dataOf = (w: World) => mkData(w.rounds, w.holes, w.shots);

// ---------------------------------------------------------------------------
// Counted shots
// ---------------------------------------------------------------------------

describe('extractApproaches', () => {
  it('par-3 tee shots are their own list and never in an approach band', () => {
    const w = approachWorld('a', 2, true);
    const x = extractApproaches({ ...w, scale: 1 });
    expect(x.par3).toHaveLength(8);
    expect(x.bands['50_125']).toHaveLength(28);
    expect(x.bands['125_175']).toHaveLength(0);
    expect(x.excluded.tee_approaches).toBe(8);
  });

  it('says nothing without an SG scale', () => {
    const w = approachWorld('a', 2, true);
    const x = extractApproaches({ ...w, scale: null });
    expect(x.par3).toHaveLength(0);
    expect(x.bands['50_125']).toHaveLength(0);
  });

  it('charges a penalty row to the shot before it, and a re-tee to the par-3 tee shot', () => {
    const r = mkRound(0);
    const holes = [mkHole(r.id, 1, { par: 3 }), mkHole(r.id, 2, { par: 4 })];
    const shots = [
      mkShot(r.id, 1, 1, { lie_before: 'tee', distance_to_hole_before: 160, lie_after: 'other', result: 'other', distance_to_hole_after: 150, distance_unit_after: 'yards' }),
      mkShot(r.id, 1, 2, { shot_type: 'penalty', is_penalty: true, lie_before: 'other', distance_to_hole_before: 150, distance_to_hole_after: 150, distance_unit_after: 'yards' }),
      mkShot(r.id, 1, 3, { lie_before: 'tee', distance_to_hole_before: 160, distance_to_hole_after: 15 }),
      mkShot(r.id, 2, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, lie_after: 'fairway', distance_to_hole_after: 100, distance_unit_after: 'yards' }),
      mkShot(r.id, 2, 2, { lie_before: 'fairway', distance_to_hole_before: 100, lie_after: 'other', result: 'other', distance_to_hole_after: 95, distance_unit_after: 'yards' }),
      mkShot(r.id, 2, 3, { shot_type: 'penalty', is_penalty: true, lie_before: 'other', distance_to_hole_before: 95, distance_to_hole_after: 95, distance_unit_after: 'yards' }),
    ];
    const x = extractApproaches({ rounds: [r], holes, shots, scale: 1 });
    expect(x.par3).toHaveLength(1);
    // Tee shot, penalty and re-tee: well over two strokes lost.
    expect(x.par3[0]!.sg).toBeLessThan(-1.5);
    expect(x.bands['50_125']).toHaveLength(1);
    expect(x.bands['50_125']![0]!.sg).toBeLessThan(-1);
  });

  it('reads the depth of a miss and the side of a putt miss from compound tags', () => {
    expect(depthOfMiss('short_left')).toBe('short');
    expect(depthOfMiss('long_right')).toBe('long');
    expect(depthOfMiss('left')).toBeNull();
    expect(sideOfMiss('high_long')).toBe('high');
    expect(sideOfMiss('short_low')).toBe('low');
    expect(sideOfMiss('short')).toBeNull();
  });
});

describe('extractPutts', () => {
  it('counts lag leaves from 30+ ft, holed lags as inside, and a missing leave as excluded', () => {
    const r = mkRound(0);
    const holes = [mkHole(r.id, 1, { putts: 1 }), mkHole(r.id, 2, { putts: 2 }), mkHole(r.id, 3, { putts: 2 })];
    const p = { shot_type: 'putting', lie_before: 'green' } as const;
    const shots = [
      mkShot(r.id, 1, 2, { ...p, putt_distance_feet: 45, putt_made: true }),
      mkShot(r.id, 2, 2, { ...p, putt_distance_feet: 32, putt_made: false }),
      mkShot(r.id, 2, 3, { ...p, putt_distance_feet: 7, putt_made: true }),
      mkShot(r.id, 3, 2, { ...p, putt_distance_feet: 31, putt_made: false }),
      mkShot(r.id, 3, 3, { ...p, putt_distance_feet: null, distance_to_hole_before: null, putt_made: true }),
    ];
    const x = extractPutts({ rounds: [r], holes, shots, scale: null });
    expect(x.lag.map((l) => [l.first_ft, l.leave_ft, l.inside])).toEqual(
      expect.arrayContaining([
        [45, 0, true],
        [32, 7, false],
      ]),
    );
    expect(x.lag).toHaveLength(2);
    expect(x.excluded.lag_leave_missing).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SG per approach and par-3 tee shots
// ---------------------------------------------------------------------------

describe('SG per approach (50–125 yd) vs the team pool', () => {
  const player = approachWorld('me', 6, false);
  const peers = team(5, (p) => approachWorld(`p${p}`, 6, true));

  it('qualifies, with a Welch gap input against the pooled team mean and split halves', () => {
    const r = computeSgFamily('approach_sg_50_125', dataOf(player), peers)!;
    expect(r.qualifies).toBe(true);
    expect(r.n).toBe(84);
    expect(r.team!.players).toBe(5);
    expect(r.team!.attempts).toBe(420);
    expect(r.gap!).toBeGreaterThan(0.3);
    expect(r.z!).toBeGreaterThan(1.645);
    expect(r.strokes_per_round!).toBeGreaterThan(0.3);
    expect(r.drivers.green_pct).toBe(0);
    expect(r.drivers.short_pct).toBe(100);
    expect(r.split_half).not.toBeNull();
    expect(r.split_half!.n_old + r.split_half!.n_new).toBe(84);
    const gi = sgGapInput(r)!;
    expect(gi.kind).toBe('mean');
    expect(gi.polarity).toBe('higher_better');
  });

  it('writes the family contract and is rated by the support pass on the weak side', () => {
    const agg = toSgAggregate(computeSgFamily('approach_sg_50_125', dataOf(player), peers), 74)!;
    const composed = composeSgFamily(agg);
    expectFamilyContract(composed, 'approach_sg_50_125', { roundsN: 6, newestRoundId: 'mer5', insightType: 'approach' });
    const ev = composed.evidence as unknown as { comparison: { primary: { source: string } }; stability?: unknown; metric: string };
    expect(ev.comparison.primary.source).toBe('team_pool');
    expect(ev.stability).toBeDefined();
    expect(composed.content).toContain('Par-3 tee shots are counted on their own');
    const c = buildCandidate({ id: 'x', insight_type: 'approach', evidence: JSON.parse(JSON.stringify(composed.evidence)) });
    expect(c.family).toBe('approach_sg_50_125');
    expect(c.untestableReason).toBeNull();
    expect(c.direction).toBe('weakness');
    expect(c.splitHalf).not.toBeNull();
  });

  it('no team pool below five teammates: no comparison, no read', () => {
    const four = team(4, (p) => approachWorld(`p${p}`, 6, true));
    const r = computeSgFamily('approach_sg_50_125', dataOf(player), four)!;
    expect(r.team).toBeNull();
    expect(r.qualifies).toBe(false);
    expect(poolOf([])).toBeNull();
  });

  it('a player level with the team does not qualify', () => {
    const r = computeSgFamily('approach_sg_50_125', dataOf(approachWorld('me', 6, true)), peers)!;
    expect(r.qualifies).toBe(false);
  });

  it('the player is never in their own pool', () => {
    const withSelf: TeamShotData = { teammates: [...peers.teammates, teammate(PLAYER, player)] };
    const r = computeSgFamily('approach_sg_50_125', dataOf(player), withSelf)!;
    expect(r.team!.players).toBe(5);
  });

  it('the generator reads the team through the injected loaders', async () => {
    const loaders = stubLoaders(dataOf(player), { teamShots: peers });
    const agg = await new ApproachSgGenerator(PLAYER, loaders, '50_125').aggregate();
    expect(agg).not.toBeNull();
    expect(loaders.calls.teamShots).toBe(1);
    expect(await new ApproachSgGenerator(PLAYER, loaders, '125_175').aggregate()).toBeNull();
  });
});

describe('par-3 tee shots as their own family', () => {
  const player = approachWorld('me', 6, false);
  const peers = team(5, (p) => approachWorld(`p${p}`, 6, true));

  it('qualifies with GIR by length beside the team', async () => {
    const r = computeSgFamily('par3_tee', dataOf(player), peers)!;
    expect(r.n).toBe(24);
    expect(r.qualifies).toBe(true);
    expect(r.bands.map((b) => b.band)).toEqual(['lt150', '150_175', '175_plus']);
    expect(r.bands.find((b) => b.band === '150_175')!.player.attempts).toBe(24);
    expect(r.bands.find((b) => b.band === '150_175')!.team!.green_pct).toBe(100);
    const composed = composeSgFamily(toSgAggregate(r, 74)!);
    expectFamilyContract(composed, 'par3_tee', { roundsN: 6, newestRoundId: 'mer5', insightType: 'approach' });
    expect(composed.title).toBe('Par-3 tee shots lose strokes to your team');
    expect(composed.signature).toBe('par3_tee:all');
    const agg = await new Par3TeeGenerator(PLAYER, stubLoaders(dataOf(player), { teamShots: peers })).aggregate();
    expect(agg!.sampleN).toBe(24);
  });

  it('below 20 tee shots says nothing', () => {
    const r = computeSgFamily('par3_tee', dataOf(approachWorld('me', 4, false)), peers)!;
    expect(r.n).toBe(16);
    expect(r.qualifies).toBe(false);
  });
});

describe('approach-miss bands leave out par-3 tee shots only with the angles flag on', () => {
  const shot = (lie: string): ApproachShot =>
    ({ round_id: 'r', hole_number: 1, shot_number: 1, distance_to_hole_before: 150, distance_to_hole_after: 20, distance_unit_after: 'feet', distance_unit_before: 'yards', lie_before: lie, lie_after: 'green', result: 'green', is_penalty: false, miss_direction: null, par: 3 }) as ApproachShot;
  it('off: unchanged; on: tee rows dropped', () => {
    const shots = [shot('tee'), shot('fairway'), shot('rough')];
    expect(bandApproachShots(shots, false)).toHaveLength(3);
    expect(bandApproachShots(shots, true).map((s) => s.lie_before)).toEqual(['fairway', 'rough']);
  });
});

// ---------------------------------------------------------------------------
// Lag leave and the three-putt link
// ---------------------------------------------------------------------------

describe('lag leave from 30+ ft', () => {
  const player = puttWorld('me', 6, 0.2);
  const peers = team(5, (p) => puttWorld(`p${p}`, 6, 0.8));

  it('qualifies against the pooled team share, sized as a rough estimate', () => {
    const r = computeLagLeave(dataOf(player), peers)!;
    expect(r.lag.n).toBe(108);
    expect(r.team!.players).toBe(5);
    expect(r.team!.pct!).toBeGreaterThan(70);
    expect(r.z!).toBeGreaterThan(1.645);
    expect(r.conversion.basis).toBe('own');
    expect(r.qualifies).toBe(true);
    const composed = composeLagLeave(toLagAggregate(r)!);
    expectFamilyContract(composed, 'lag_leave', { roundsN: 6, newestRoundId: 'mer5', insightType: 'putting' });
    expect((composed.evidence.detail as { linked_family: string }).linked_family).toBe('three_putt_chain');
    expect(composed.evidence.estimated).toBe(true);
  });

  it('a lag at the team share does not qualify', () => {
    expect(computeLagLeave(dataOf(puttWorld('me', 6, 0.8)), peers)!.qualifies).toBe(false);
  });

  it('pooled z is null on empty sides and positive when the player is lower', () => {
    expect(lowerShareZ(0, 0, 10, 20)).toBeNull();
    expect(lowerShareZ(5, 20, 80, 100)!).toBeGreaterThan(1.645);
  });

  it('the three-putt row carries the lag counts as its counted path', () => {
    const data = dataOf(player);
    const bench: ThreePuttBenchmark = { source: 'team_pool', rate: 0.05, label: "your teammates' median (5 players)", n: 5, citation: 'test' };
    const tp = computeThreePuttChain(data, bench)!;
    expect(tp.qualifies).toBe(true);
    const link = lagLinkOf(computeLagLeave(data, peers))!;
    const composed = composeThreePuttChain(toThreePuttAggregate(tp, 74, link)!);
    expect(composed.content).toContain(lagLinkLine(link));
    expect(lagLinkLine(link)).toMatch(/^Lag leave from 30\+ ft: \d+ of 108 inside 5 ft \(\d+(\.\d)?%; team \d+(\.\d)?%\)\.$/);
    expect((composed.evidence.detail as { lag_leave: unknown }).lag_leave).toEqual(link);
  });
});

// ---------------------------------------------------------------------------
// Under-reading
// ---------------------------------------------------------------------------

describe('breaking-putt misses on the low side', () => {
  it('qualifies with 60%+ tag coverage and a low share above an even split', () => {
    const r = computeUnderReading(dataOf(puttWorld('me', 6, 0.5, { lowShare: 0.8 })), null)!;
    expect(r.all.misses).toBe(108);
    expect(r.coverage).toBe(1);
    expect(r.all.low_pct!).toBeGreaterThan(70);
    expect(r.qualifies).toBe(true);
    const composed = composeUnderReading(toUnderReadingAggregate(r)!);
    expectFamilyContract(composed, 'under_reading', { roundsN: 6, newestRoundId: 'mer5', insightType: 'putting' });
    // Unsized: no strokes, so the support pass keeps it with the coach.
    expect(composed.evidence.strokes_impact).toBe(0);
    const c = buildCandidate({ id: 'x', insight_type: 'putting', evidence: JSON.parse(JSON.stringify(composed.evidence)) });
    expect(c.family).toBe('under_reading');
    expect(c.strokesRaw).toBeNull();
  });

  it('below 60% tag coverage the row says nothing (the data-gap prompt is Slice 8a)', () => {
    const r = computeUnderReading(dataOf(puttWorld('me', 6, 0.5, { lowShare: 0.9, tagged: 0.4 })), null)!;
    expect(r.coverage).toBeLessThan(0.6);
    expect(r.data_gap).toBe(true);
    expect(toUnderReadingAggregate(r)).toBeNull();
  });

  it('an even split does not qualify', () => {
    expect(computeUnderReading(dataOf(puttWorld('me', 6, 0.5, { lowShare: 0.5 })), null)!.qualifies).toBe(false);
  });

  it('carries the team pooled low share as context when the pool clears its floors', () => {
    const peers = team(5, (p) => puttWorld(`p${p}`, 6, 0.5, { lowShare: 0.5 }));
    const r = computeUnderReading(dataOf(puttWorld('me', 6, 0.5, { lowShare: 0.8 })), peers)!;
    expect(r.team!.players).toBe(5);
  });
});

describe('registry', () => {
  it('every Slice 5b family has its metric, sample unit and floors', () => {
    for (const id of ['par3_tee', 'approach_sg_50_125', 'approach_sg_125_175', 'approach_sg_175_plus', 'lag_leave', 'under_reading'] as const) {
      const f = ANGLE_FAMILIES[id];
      expect(f.family).toBe(id);
      expect(f.floor).toBe(20);
      expect(f.round_floor).toBeGreaterThanOrEqual(3);
      expect(f.citations.length).toBeGreaterThan(0);
    }
  });
});
