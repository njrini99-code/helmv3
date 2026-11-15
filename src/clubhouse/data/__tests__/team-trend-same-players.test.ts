import { describe, expect, it } from 'vitest';
import { roundHalves } from '../stats-weight';
import { teamTrendReading } from '../../screens/stats/StatsTeamPhone';

// Prod audit 2026-11-15, NP-01: "Down 5.5 strokes a round, newer half vs older half" set five one-player days against seven-round
// qualifier days, so the reading measured who played, not how the team played. A team trend compares each player with themselves.

type R = { player_id: string; total_score: number; holes_played: number };
const r = (player_id: string, total_score: number): R => ({ player_id, total_score, holes_played: 18 });
const score = (x: R) => x.total_score;
const who = (x: R) => x.player_id;

describe('a team trend compares the same players (NP-01)', () => {
  it('reads no change when the newer half is only a different, better player', () => {
    // Older days: the whole team, averaging 80. Newer days: only Ann, who always shoots 72. Pooled, that is "down 8".
    const older = [
      [r('ann', 72), r('ben', 84), r('cal', 84)],
      [r('ann', 72), r('ben', 84), r('cal', 84)],
    ];
    const newer = [[r('ann', 72)], [r('ann', 72)]];
    const groups = [...older, ...newer];
    expect(roundHalves(groups, score, 'score')!.delta).toBeCloseTo(-8);
    // Only one player has rounds in both halves: under three, there is no change to read.
    expect(roundHalves(groups, score, 'score', who)).toBeNull();
  });

  it('averages each player’s own change, over the players with two rounds on each side', () => {
    const groups = [
      [r('ann', 74), r('ben', 80), r('cal', 82), r('dee', 90)],
      [r('ann', 74), r('ben', 80), r('cal', 82)],
      [r('ann', 72), r('ben', 79), r('cal', 79), r('dee', 70)],
      [r('ann', 72), r('ben', 79), r('cal', 79)],
    ];
    const h = roundHalves(groups, score, 'score', who)!;
    // Ann −2, Ben −1, Cal −3; Dee has one round a side and is left out.
    expect(h.delta).toBeCloseTo(-2);
    expect(h.se).not.toBeNull();
  });

  it('says why when the same players are too few, rather than "no clear change"', () => {
    expect(teamTrendReading({ daysHalves: null }, 6).reading).toBe('Not enough of the same players on both halves to read a change.');
    expect(teamTrendReading({ daysHalves: null }, 2).reading).toBe('No clear change across these round days.');
    expect(teamTrendReading({ daysHalves: { delta: -2.04, se: 0.3 } }, 6).reading).toBe('Down 2.0 strokes a round, same players, newer half vs older half.');
  });
});
