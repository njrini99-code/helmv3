import { describe, expect, it } from 'vitest';
import { normalizeShots, type RawShotRow } from '../normalize';
import {
  approachInBand,
  approachSummary,
  bucketMeans,
  chipSummary,
  filterRounds,
  playerThemeSg,
  puttSummary,
  teeSummary,
  themeSummary,
  worstFirst,
} from '../aggregate';
import type { IntelRound } from '../types';

function shot(p: Partial<RawShotRow> & Pick<RawShotRow, 'hole_number' | 'shot_number' | 'shot_type'>): RawShotRow {
  return {
    round_id: 'r1',
    club_type: null,
    penalty_type: null,
    lie_before: null,
    lie_after: null,
    result: null,
    miss_direction: null,
    is_penalty: false,
    distance_to_hole_before: null,
    distance_unit_before: 'yards',
    distance_to_hole_after: null,
    distance_unit_after: 'yards',
    putt_distance_feet: null,
    putt_made: null,
    putt_break: null,
    putt_slope: null,
    ...p,
  };
}

const index = new Map([['r1', 0]]);

describe('normalizeShots', () => {
  it('reads a drive into the fairway, a sided miss, an untagged miss and a penalty', () => {
    const { tee } = normalizeShots(
      [
        shot({ hole_number: 1, shot_number: 1, shot_type: 'tee', lie_after: 'fairway', distance_to_hole_before: 400, distance_to_hole_after: 130 }),
        shot({ hole_number: 2, shot_number: 1, shot_type: 'tee', lie_after: 'rough', miss_direction: 'right' }),
        shot({ hole_number: 3, shot_number: 1, shot_type: 'tee', lie_after: 'rough' }),
        shot({ hole_number: 4, shot_number: 1, shot_type: 'tee', lie_after: 'rough', miss_direction: 'left' }),
        shot({ hole_number: 4, shot_number: 2, shot_type: 'penalty' }),
      ],
      index,
    );
    expect(tee.map((t) => t.zone)).toEqual(['fairway', 'right', 'miss', 'penalty']);
    expect(tee[0]!.yards).toBe(270);
  });

  it('keeps the club, a fairway bunker, the penalty kind, and drops a par 3 keyed as a drive', () => {
    const { tee } = normalizeShots(
      [
        shot({ hole_number: 1, shot_number: 1, shot_type: 'tee', club_type: 'driver', lie_after: 'sand', miss_direction: 'left' }),
        shot({ hole_number: 2, shot_number: 1, shot_type: 'tee', club_type: 'non_driver', lie_after: 'rough', miss_direction: 'right' }),
        shot({ hole_number: 3, shot_number: 1, shot_type: 'tee', club_type: 'driver', lie_after: 'other' }),
        shot({ hole_number: 3, shot_number: 2, shot_type: 'penalty', penalty_type: 'water' }),
        shot({ hole_number: 4, shot_number: 1, shot_type: 'tee', club_type: 'non_driver', lie_after: 'green' }),
      ],
      index,
    );
    expect(tee).toHaveLength(3);
    expect(tee[0]).toMatchObject({ zone: 'left', lie: 'sand', club: 'driver', penaltyType: null });
    expect(tee[1]).toMatchObject({ zone: 'right', lie: 'rough', club: 'other' });
    expect(tee[2]).toMatchObject({ zone: 'penalty', lie: null, penaltyType: 'water' });
  });

  it('keeps where an approach was played from and where a missed green finished', () => {
    const { approach } = normalizeShots(
      [
        shot({ hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'rough', distance_to_hole_before: 150, lie_after: 'sand', distance_to_hole_after: 20, miss_direction: 'short' }),
        shot({ hole_number: 2, shot_number: 1, shot_type: 'approach', lie_before: 'tee', distance_to_hole_before: 160, lie_after: 'green', distance_to_hole_after: 30, distance_unit_after: 'feet' }),
      ],
      index,
    );
    expect(approach[0]).toMatchObject({ lie: 'rough', finish: 'sand', onGreen: false });
    expect(approach[1]).toMatchObject({ lie: 'tee', finish: null, onGreen: true });
  });

  it('keeps an approach proximity in feet and all eight miss directions', () => {
    const { approach } = normalizeShots(
      [
        shot({ hole_number: 1, shot_number: 2, shot_type: 'approach', distance_to_hole_before: 150, lie_after: 'green', distance_to_hole_after: 24, distance_unit_after: 'feet' }),
        shot({ hole_number: 2, shot_number: 2, shot_type: 'approach', distance_to_hole_before: 160, lie_after: 'rough', distance_to_hole_after: 12, miss_direction: 'short_right' }),
      ],
      index,
    );
    expect(approach[0]).toMatchObject({ onGreen: true, leaveFeet: 24, miss: null });
    expect(approach[1]).toMatchObject({ onGreen: false, leaveFeet: 36, miss: 'short_right' });
  });

  it('reads where an older row finished from `result` when lie_after is empty', () => {
    const { approach } = normalizeShots(
      [shot({ hole_number: 1, shot_number: 2, shot_type: 'approach', distance_to_hole_before: 140, result: 'green', distance_to_hole_after: 18, distance_unit_after: 'feet' })],
      index,
    );
    expect(approach[0]).toMatchObject({ onGreen: true, leaveFeet: 18, miss: null });
  });

  it('scores an up-and-down from the first chip only', () => {
    const { chips } = normalizeShots(
      [
        shot({ hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 15, lie_after: 'green', distance_to_hole_after: 3, distance_unit_after: 'feet' }),
        shot({ hole_number: 1, shot_number: 4, shot_type: 'putting', putt_distance_feet: 3, putt_made: true }),
        shot({ hole_number: 2, shot_number: 3, shot_type: 'around_green', lie_before: 'sand', distance_to_hole_before: 12, lie_after: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
        shot({ hole_number: 2, shot_number: 4, shot_type: 'putting', putt_distance_feet: 20, putt_made: false }),
        shot({ hole_number: 2, shot_number: 5, shot_type: 'putting', putt_distance_feet: 2, putt_made: true }),
      ],
      index,
    );
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ lie: 'rough', leaveFeet: 3, saved: true });
    expect(chips[1]).toMatchObject({ lie: 'sand', leaveFeet: 20, saved: false });
  });

  it('marks the first putt of a three-putt hole, break, slope and miss sides', () => {
    const { putts } = normalizeShots(
      [
        shot({ hole_number: 1, shot_number: 2, shot_type: 'putting', putt_distance_feet: 40, putt_made: false, putt_break: 'right_to_left', putt_slope: 'downhill', miss_direction: 'low_short' }),
        shot({ hole_number: 1, shot_number: 3, shot_type: 'putting', putt_distance_feet: 5, putt_made: false, putt_break: 'multiple', putt_slope: 'severe' }),
        shot({ hole_number: 1, shot_number: 4, shot_type: 'putting', putt_distance_feet: 1, putt_made: true }),
      ],
      index,
    );
    expect(putts[0]).toMatchObject({ first: true, threePutt: true, brk: 'rl', slope: 'down', side: 'low', depth: 'short', leaveFeet: 5 });
    expect(putts[1]).toMatchObject({ first: false, threePutt: false, brk: null, slope: null });
    expect(putts[2]).toMatchObject({ made: true, side: null, leaveFeet: null });
  });

  it('drops shots of rounds outside the payload', () => {
    const out = normalizeShots([shot({ round_id: 'other', hole_number: 1, shot_number: 1, shot_type: 'tee', lie_after: 'fairway' })], index);
    expect(out.tee).toHaveLength(0);
  });
});

function round(id: string, playerId: string, date: string, sg: number, type: IntelRound['type'] = 'practice'): IntelRound {
  return { id, playerId, date, type, sg: { tee: sg, app: sg * 2, atg: null, putt: -sg } };
}

describe('rounds and strokes gained', () => {
  const rounds = [
    round('a', 'p1', '2026-04-01', -1, 'tournament'),
    round('b', 'p1', '2026-05-01', 0),
    round('c', 'p2', '2026-09-20', 1),
    round('d', 'p2', '2025-10-01', 5),
  ];

  it('keeps the season (calendar year up to today) or the last 30 days, and a round type', () => {
    expect(filterRounds(rounds, { window: 'season', type: 'all', today: '2026-09-28' }).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterRounds(rounds, { window: '30d', type: 'all', today: '2026-09-28' }).map((r) => r.id)).toEqual(['c']);
    expect(filterRounds(rounds, { window: 'season', type: 'tournament', today: '2026-09-28' }).map((r) => r.id)).toEqual(['a']);
  });

  it('averages the stored SG per round and never reads a null as zero', () => {
    const season = filterRounds(rounds, { window: 'season', type: 'all', today: '2026-09-28' });
    expect(themeSummary(season, 'tee').sg).toBe(0);
    expect(themeSummary(season, 'atg')).toMatchObject({ sg: null, rounds: 0, series: [], change: null });
    const byPlayer = worstFirst(playerThemeSg(season, ['p1', 'p2', 'p3'], 'app'));
    expect(byPlayer.map((p) => [p.playerId, p.sg])).toEqual([['p1', -1], ['p2', 2], ['p3', null]]);
  });

  it('buckets a chronological series into near-equal runs', () => {
    expect(bucketMeans([1, 2, 3, 4, 5, 6], 3)).toEqual([1.5, 3.5, 5.5]);
    expect(bucketMeans([1, 2], 6)).toEqual([1, 2]);
  });
});

describe('shot summaries', () => {
  it('reads fairways, miss side and drive length', () => {
    const d = { club: 'driver' as const, lie: 'rough' as const, penaltyType: null };
    const s = teeSummary([
      { ...d, ri: 0, zone: 'fairway', yards: 280, lie: null },
      { ...d, ri: 0, zone: 'right', yards: 300 },
      { ...d, ri: 0, zone: 'right', yards: null },
      { ...d, ri: 0, zone: 'left', yards: 260 },
    ]);
    expect(s).toMatchObject({ n: 4, fairwayPct: 25, avgYards: 280, missSide: 'right' });
  });

  it('bands approaches and reads proximity, greens hit and the main miss', () => {
    const base = { ri: 0, lie: 'fairway' as const, finish: 'rough' as const };
    const shots = [
      { ...base, fromYards: 130, onGreen: true, finish: null, leaveFeet: 20, miss: null },
      { ...base, fromYards: 140, onGreen: false, leaveFeet: 40, miss: 'short_left' as const },
      { ...base, fromYards: 145, onGreen: false, leaveFeet: 30, miss: 'short_left' as const },
      { ...base, fromYards: 210, onGreen: false, leaveFeet: null, miss: 'long' as const },
      { ...base, fromYards: 260, onGreen: false, leaveFeet: null, miss: 'long' as const },
    ];
    expect(approachInBand(shots, '125')).toHaveLength(3);
    // All is 50 to 250 yd: the 260 yd lay-up is outside it.
    expect(approachInBand(shots, 'all')).toHaveLength(4);
    const s = approachSummary(approachInBand(shots, '125'));
    expect(s).toMatchObject({ n: 3, proximity: 30, missed: 2, mainMiss: 'short_left' });
    // A short-left miss counts toward both short and left.
    expect(s.misses).toEqual({ short: 2, long: 0, left: 2, right: 0 });
    expect(s.byDirection.short_left).toBe(2);
  });

  it('reads up-and-down, inside 4 ft and the median leave', () => {
    const s = chipSummary([
      { ri: 0, fromYards: 5, lie: 'rough', leaveFeet: 2, saved: true, miss: null },
      { ri: 0, fromYards: 15, lie: 'rough', leaveFeet: 9, saved: false, miss: null },
      { ri: 0, fromYards: 25, lie: 'sand', leaveFeet: null, saved: false, miss: 'long' },
    ]);
    expect(s).toMatchObject({ n: 3, inside4Pct: 50, medianLeave: 5.5 });
    expect(s.upAndDownPct).toBeCloseTo(33.33, 1);
  });

  it('reads make %, 3-putts per first putt, and tagged miss sides only', () => {
    const base = { ri: 0, brk: null, slope: null, threePutt: false, first: false, leaveFeet: null };
    const s = puttSummary([
      { ...base, feet: 30, made: false, first: true, threePutt: true, side: 'low', depth: 'short' },
      { ...base, feet: 4, made: false, side: null, depth: null },
      { ...base, feet: 1, made: true, side: null, depth: null },
      { ...base, feet: 12, made: true, first: true, side: null, depth: null },
    ]);
    expect(s).toMatchObject({ n: 4, makePct: 50, threePuttPct: 50, misses: 2, lowPct: 100, shortPct: 100 });
  });
});
