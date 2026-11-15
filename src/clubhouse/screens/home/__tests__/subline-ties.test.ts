import { describe, expect, it } from 'vitest';
import { homeSubline, type ChSublineRow } from '../model';

/**
 * F-0016 (audit 2026-11-13): a team-wide quiet spell names its longest only when one player is strictly longest. Seven players
 * tied at 48 days read "Cole the longest at 48", which picked one of seven for no reason.
 */
const quiet = (name: string, days: number): ChSublineRow => ({ name, status: 'steady', quietDays: days });

describe('the subline when several players are quiet', () => {
  it('F-0016 all tied: one sentence about the team, with no "longest" and no "+"', () => {
    const rows = ['Cole Avery', 'Mason Diaz', 'Owen Park', 'Ethan Shaw', 'Jackson Lee', 'Dylan Ross', 'Tyler Ng'].map((n) => quiet(n, 48));
    expect(homeSubline(rows, { roundsError: false, nextCompetition: null })).toBe('7 players haven’t posted a round in 48 days.');
  });

  it('F-0016 one strictly longest: still named, with the shortest as the floor', () => {
    const rows = [quiet('Cole Avery', 30), quiet('Mason Diaz', 15), quiet('Owen Park', 15)];
    expect(homeSubline(rows, { roundsError: false, nextCompetition: null })).toBe('3 players haven’t posted a round in 15+ days, Cole the longest at 30.');
  });
});
