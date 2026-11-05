import { describe, expect, it } from 'vitest';
import { playerRoundsLine } from '../coachhelm-team-shape';

describe('playerRoundsLine', () => {
  it('counts the rounds with hole scores first', () => {
    expect(playerRoundsLine({ rounds: 3, scoresOnly: 2 })).toBe('3 rounds');
    expect(playerRoundsLine({ rounds: 1 })).toBe('1 round');
  });

  it('never calls a player with total-only rounds roundless', () => {
    expect(playerRoundsLine({ rounds: 0, scoresOnly: 2 })).toBe('2 rounds, scores only');
    expect(playerRoundsLine({ rounds: 0, scoresOnly: 1 })).toBe('1 round, scores only');
  });

  it('says no rounds only when there are none', () => {
    expect(playerRoundsLine({ rounds: 0, scoresOnly: 0 })).toBe('no rounds yet');
    expect(playerRoundsLine({ rounds: 0 })).toBe('no rounds yet');
  });
});
