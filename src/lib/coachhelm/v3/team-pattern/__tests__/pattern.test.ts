import { describe, expect, it } from 'vitest';
import {
  computeTeamPatterns,
  patternKeyOf,
  teamPatternBelowLine,
  teamPatternMembersLine,
  teamPatternPlayerLine,
  teamPatternStrokesLine,
  type TeamPatternRead,
} from '../pattern';

const ev = (over: Record<string, unknown> = {}) => ({
  metric: 'approach_proximity_50_125ft',
  metric_label: 'Wedges 50–125 yd',
  unit: 'percent',
  your_value: 60,
  ladder: 'likely',
  strokes_shrunk: 0.3,
  support: { family: 'approach_green_hit', direction: 'weakness' },
  detail: { worse_side: 'short' },
  diagnosis: { recommended_action: 'Carry-distance block.' },
  ...over,
});
const read = (player: string, over: Record<string, unknown> = {}, id = `${player}-r`): TeamPatternRead => ({
  id,
  player_id: player,
  insight_type: 'approach_miss',
  evidence: ev(over),
});
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const run = (reads: TeamPatternRead[], eligible: string[], rosterTotal = eligible.length) =>
  computeTeamPatterns({ teamId: 't', reads, rosterTotal, eligiblePlayerIds: new Set(eligible), now: new Date('2026-10-20T00:00:00Z') });

describe('computeTeamPatterns', () => {
  it('Example 8: 5 of 6 eligible players, Likely or above, is a pattern with the summed strokes', () => {
    const res = run(
      ['p0', 'p1', 'p2', 'p3', 'p4'].map((p, i) => read(p, { strokes_shrunk: [0.3, 0.25, 0.2, 0.2, 0.15][i], ladder: i === 0 ? 'observed' : 'likely' })),
      players(6),
      9,
    );
    expect(res.patterns).toHaveLength(1);
    const p = res.patterns[0]!;
    expect(p).toMatchObject({ family: 'approach_green_hit|approach_proximity_50_125ft|short', members: ['p0', 'p1', 'p2', 'p3', 'p4'], roster_with_reads: 6, roster_total: 9, strokes_sum: 1.1, common_next: 'Carry-distance block.', window_end: '2026-10-20' });
    expect(p.label).toBe('Wedges 50–125 yd · finishing short');
    expect(teamPatternMembersLine(p)).toBe('5 of 6 players with enough rounds');
    expect(teamPatternStrokesLine(p)).toBe('about 1.1 strokes a round across the team');
  });

  it('needs 3 players: two players is a coincidence, counted below the threshold', () => {
    const res = run([read('p0'), read('p1')], players(4));
    expect(res.patterns).toHaveLength(0);
    expect(res.below_threshold).toBe(1);
  });

  it('needs 30% of the eligible roster: 3 of 12 is not a team pattern', () => {
    expect(run([read('p0'), read('p1'), read('p2')], players(12)).patterns).toHaveLength(0);
    expect(run([read('p0'), read('p1'), read('p2')], players(10)).patterns).toHaveLength(1);
  });

  it('counts only Likely or above, weaknesses, eligible players and known families', () => {
    const res = run(
      [
        read('p0'),
        read('p1'),
        read('p2', { ladder: 'working_hypothesis' }),
        read('p3', { support: { family: 'approach_green_hit', direction: 'strength' } }),
        read('p4', { ladder: undefined }),
        read('p5'),
        read('p6', { support: { family: 'composite' } }),
      ],
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p6'],
    );
    expect(res.patterns).toHaveLength(0);
    expect(res.below_threshold).toBe(1);
  });

  it('a different miss side or band is a different family; a player counts once per family', () => {
    const res = run(
      [read('p0'), read('p1'), read('p2', { detail: { worse_side: 'long' } }), read('p0', { strokes_shrunk: 0.9 }, 'dup'), read('p3', { metric: 'approach_proximity_125_175ft' })],
      players(4),
    );
    expect(res.patterns).toHaveLength(0);
    expect(res.below_threshold).toBe(1);
  });

  it('caps at 4 rows, most strokes first, and counts the rest', () => {
    const fam = (k: number, s: number) => ['p0', 'p1', 'p2'].map((p) => read(p, { metric: `putts_made_m${k}_pct`, support: { family: 'putt_distance' }, detail: {}, strokes_shrunk: s }, `${p}-${k}`));
    const res = run([1, 2, 3, 4, 5].flatMap((k) => fam(k, k / 10)), players(5));
    expect(res.patterns.map((p) => p.metric)).toEqual(['putts_made_m5_pct', 'putts_made_m4_pct', 'putts_made_m3_pct', 'putts_made_m2_pct']);
    expect(res.below_threshold).toBe(1);
  });

  it('falls back to familyFor when the read has no support family', () => {
    expect(patternKeyOf(read('p0', { support: undefined, detail: {} }))?.base).toBe('approach_green_hit');
  });
});

describe('copy', () => {
  it('says nothing for zero strokes, nothing below, and never names a teammate', () => {
    expect(teamPatternStrokesLine({ strokes_sum: 0.04 })).toBeNull();
    expect(teamPatternBelowLine(0)).toBeNull();
    expect(teamPatternBelowLine(1)).toBe('1 more read is shared by too few players to call a team pattern.');
    expect(teamPatternPlayerLine(4)).toBe('The same read is open for 4 other players on the team.');
    expect(teamPatternPlayerLine(0)).toBeNull();
  });
});
