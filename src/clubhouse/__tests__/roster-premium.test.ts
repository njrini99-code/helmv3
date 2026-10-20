import { describe, expect, it } from 'vitest';
import type { ChRosterPlayer } from '../data/roster';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { earlyNeed, rosterPeek, rosterStandings, teamInSentence } from '../screens/roster/format';

const p = (id: string, avg: number | null, rounds: number, status: ChRosterPlayer['status'] = 'active'): ChRosterPlayer => ({
  ...PREVIEW_ROSTER.players[0]!,
  id,
  name: id,
  avg,
  rounds,
  status,
});

describe('roster standings (P003 #2, #3)', () => {
  it('ranks the active roster, whatever a search leaves on screen', () => {
    const players = [p('a', 71, 8), p('b', 72, 8), p('c', 73, 8), p('d', 74, 8)];
    const { byId } = rosterStandings(players);
    // Searching for "d" shows one row; it is still 4th of 4, not "Avg".
    expect(byId.get('d')).toEqual({ place: 4, of: 4 });
  });

  it('leaves inactive players and early reads out of the ranks', () => {
    const players = [p('a', 71, 8), p('b', 72, 8), p('off', 68, 9, 'inactive'), p('early', 70, 2)];
    const { avgs, byId } = rosterStandings(players);
    expect(avgs).toEqual([71, 72]);
    expect(byId.get('a')).toEqual({ place: 1, of: 2 });
    expect(byId.has('off')).toBe(false);
    expect(byId.has('early')).toBe(false);
    expect(earlyNeed(2)).toBe('Needs 1 more');
    expect(earlyNeed(3)).toBeNull();
  });

  it('ties share the better place', () => {
    const { byId } = rosterStandings([p('a', 72, 5), p('b', 72, 5), p('c', 73, 5)]);
    expect(byId.get('b')).toEqual({ place: 1, of: 3 });
    expect(byId.get('c')).toEqual({ place: 3, of: 3 });
  });
});

describe('the team inside a sentence (P003 #8)', () => {
  it('is "your team" when the team row did not load', () => {
    expect(teamInSentence({ teamName: 'Your team', teamError: true })).toBe('your team');
    expect(teamInSentence({ teamName: 'Finley Men', teamError: false })).toBe('Finley Men');
  });
});

describe('the roster player peek (P003-C1)', () => {
  it('maps what the roster holds, with the newest round and a warning as the reason', () => {
    const jonah = PREVIEW_ROSTER.players.find((x) => x.id === 'jonah')!;
    const peek = rosterPeek(jonah);
    expect(peek.lastRound?.score).toBe(jonah.recent[0]!.score);
    expect(peek.reason).toBe(jonah.attention?.tone === 'warning' ? jonah.attention.text : null);
  });
});
