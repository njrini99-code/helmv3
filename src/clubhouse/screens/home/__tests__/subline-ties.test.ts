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

  // Prod audit 2026-11-15, HOME-P-01: "Mason the longest at 50" while Roster listed four players at 50. Several at the top are
  // counted, and none of them is named.
  it('HOME-P-01 several tied at the top: counted, never one of them named', () => {
    const rows = [quiet('Mason Diaz', 50), quiet('Cole Avery', 50), quiet('Owen Park', 50), quiet('Ethan Shaw', 50), quiet('Jackson Lee', 30), quiet('Dylan Ross', 25), quiet('Tyler Ng', 25)];
    expect(homeSubline(rows, { roundsError: false, nextCompetition: null })).toBe('7 players haven’t posted a round in 25+ days, 4 of them for 50.');
  });
});
