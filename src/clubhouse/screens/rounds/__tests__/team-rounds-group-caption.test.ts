import { describe, expect, it } from 'vitest';
import type { ChTeamRound } from '../../../data/team-rounds-shape';
import { groupMetaText } from '../TeamRounds';

// DF-C-14: a group's caption says how many rounds its average is over when that is fewer than the rounds it counts.
const r = (score: number, over: Partial<ChTeamRound> = {}) => ({ score, holes: 18, countable: true, type: 'tournament', averaged: true, ...over }) as unknown as ChTeamRound;

describe('groupMetaText', () => {
  it('names the basis when practice or nine-hole rounds are left out of the average', () => {
    expect(groupMetaText({ rounds: [r(72), r(76), r(70, { type: 'practice' }), r(38, { holes: 9 })] })).toBe('4 rounds · avg 74.0 over 2');
  });

  it('says only the count and average when every round is in it', () => {
    expect(groupMetaText({ rounds: [r(72), r(76)] })).toBe('2 rounds · avg 74.0');
  });

  it('says only the count when no round is averaged', () => {
    expect(groupMetaText({ rounds: [r(38, { holes: 9 })] })).toBe('1 round');
  });
});
