import { describe, expect, it } from 'vitest';
import { filterFor } from '../../../data/stats-filter';
import { playersCard, roundNote } from '../StatsTeamPhoneShs';

// W28 (owner's preview, 11 Nov 2026): everyone listed lost (−4.2, −4.2, −4.9) under "Who gains and loses"; the sentence named
// Cole as losing most though Cole was not among the three rows; −4.2 and −4.9 drew the same length on a fixed ±8.
const p = (name: string, value: number | null) => ({ id: name, name, value });

describe('Who gains and loses, the summary card (W28)', () => {
  it('shows the top two and the one who loses most at their own rank', () => {
    const card = playersCard([p('Tyler', -4.2), p('Mason', -4.2), p('Owen', -4.9), p('Ethan', -5.1), p('Cole', -5.8)]);
    expect(card.rows.map((r) => [r.row.name, r.rank])).toEqual([
      ['Tyler', 1],
      ['Mason', 2],
      ['Cole', 5],
    ]);
  });

  it('says so in the title when everyone loses, and not otherwise', () => {
    expect(playersCard([p('A', -1), p('B', -2)]).title).toBe('Who loses least and most');
    expect(playersCard([p('A', 0.4), p('B', -2)]).title).toBe('Who gains and loses');
    expect(playersCard([]).title).toBe('Who gains and loses');
  });

  it('scales the bars to the card’s largest figure, never below 2', () => {
    expect(playersCard([p('A', -4.2), p('B', -4.9)]).scale).toBe(4.9);
    expect(playersCard([p('A', 0.3), p('B', -0.5)]).scale).toBe(2);
  });

  it('keeps three or fewer as they are', () => {
    expect(playersCard([p('A', 1), p('B', -1), p('C', null)]).rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe('The round’s note (W29)', () => {
  const last10 = { window: 'last10' as const, filter: filterFor('last10'), last: 10 as const };
  it('labels the chips and says what grey means in one sentence', () => {
    expect(roundNote(last10, true, null, '7 active players, countable rounds only.')).toBe(
      'Chips: the change vs each player’s previous 10 rounds, grey when it is inside its likely error. 7 active players, countable rounds only.',
    );
  });
  it('says nothing about chips when there are none', () => {
    expect(roundNote(last10, false, 'Hole stats from 18 of 25 rounds', null)).toBe('Hole stats from 18 of 25 rounds.');
  });
});
