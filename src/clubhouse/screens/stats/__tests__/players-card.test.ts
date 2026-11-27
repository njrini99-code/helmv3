import { describe, expect, it } from 'vitest';
import { filterFor } from '../../../data/stats-filter';
import { chipLabel, playersCard, roundMeta } from '../StatsTeamPhoneShs';

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

  it('titles the card as a statement, whoever gains or loses (STATS-D-07)', () => {
    expect(playersCard([p('A', -1), p('B', -2)]).title).toBe('Strokes gained by player');
    expect(playersCard([p('A', 0.4), p('B', -2)]).title).toBe('Strokes gained by player');
    expect(playersCard([]).title).toBe('Strokes gained by player');
  });

  it('tones by rank when everyone loses: only the worst in loss amber (STATS-D-07)', () => {
    const card = playersCard([p('Tyler', -4.2), p('Mason', -4.2), p('Owen', -4.9), p('Ethan', -5.1), p('Cole', -5.8)]);
    expect(card.rows.map((r) => r.tone)).toEqual(['flat', 'flat', 'loss']);
    expect(playersCard([p('A', 0.4), p('B', -2)]).rows.map((r) => r.tone)).toEqual([undefined, undefined]);
  });

  it('scales the bars to the card’s largest figure, never below 2', () => {
    expect(playersCard([p('A', -4.2), p('B', -4.9)]).scale).toBe(4.9);
    expect(playersCard([p('A', 0.3), p('B', -0.5)]).scale).toBe(2);
  });

  it('keeps three or fewer as they are', () => {
    expect(playersCard([p('A', 1), p('B', -1), p('C', null)]).rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe('The round’s chips and meta (STATS-TS-07, STATS-TS-08)', () => {
  const last10 = { window: 'last10' as const, filter: filterFor('last10'), last: 10 as const };
  it('writes what each chip is measured against on the chip', () => {
    expect(chipLabel(last10)).toBe('vs prev 10');
    expect(chipLabel({ ...last10, window: 'season' as const, filter: filterFor('season') })).toBe('vs window before');
  });
  it('puts hole coverage in the meta only when some rounds lack holes', () => {
    expect(roundMeta('Last 10', 18, 25)).toBe('Last 10 · 18 of 25 with holes');
    expect(roundMeta('Last 10', 25, 25)).toBe('Last 10');
    expect(roundMeta('Last 10', null, 25)).toBe('Last 10');
  });
});
