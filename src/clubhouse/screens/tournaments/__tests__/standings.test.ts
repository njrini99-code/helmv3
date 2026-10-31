import { describe, expect, it } from 'vitest';
import {
  addRecords,
  formatPct,
  formatRecord,
  meetsFiveHundred,
  ncaaPlayerTiebreak,
  ncaaTeamTiebreak,
  placeField,
  recordFromFinish,
  recordPct,
  type ChTourFieldTeam,
  type ChTourTeamTieInput,
} from '../standings';

describe('placeField', () => {
  it('lets ties stand by default, with a T, and gives no place without a total', () => {
    const places = placeField(
      [
        { id: 'a', total: 850 },
        { id: 'b', total: 858 },
        { id: 'c', total: 858 },
        { id: 'd', total: 860 },
        { id: 'e', total: null },
      ],
      'ties_stand',
    );
    expect(places.map((p) => [p.id, p.label])).toEqual([
      ['a', '1'],
      ['b', 'T2'],
      ['c', 'T2'],
      ['d', '4'],
      ['e', '—'],
    ]);
    expect(places.find((p) => p.id === 'e')!.place).toBeNull();
  });

  it('breaks team ties the NCAA way: dropped total first', () => {
    const rows: ChTourTeamTieInput[] = [
      { id: 'x', total: 858, droppedTotal: 230, countingByRound: [[70, 71, 72, 74]] },
      { id: 'y', total: 858, droppedTotal: 225, countingByRound: [[70, 71, 72, 74]] },
    ];
    expect(placeField(rows, 'ncaa', ncaaTeamTiebreak).map((p) => [p.id, p.label])).toEqual([
      ['y', '1'],
      ['x', '2'],
    ]);
  });

  it('then the sum of each round’s lowest counting score, then the next lowest, then seed', () => {
    const base = { total: 572, droppedTotal: 150 };
    const low: ChTourTeamTieInput = { id: 'low', ...base, countingByRound: [[68, 72, 72, 74], [70, 72, 72, 72]] };
    const high: ChTourTeamTieInput = { id: 'high', ...base, countingByRound: [[70, 71, 72, 73], [70, 72, 72, 72]] };
    expect(ncaaTeamTiebreak(low, high)).toBeLessThan(0);
    const a: ChTourTeamTieInput = { id: 'a', ...base, countingByRound: [[70, 70, 72, 74]], seed: 4 };
    const b: ChTourTeamTieInput = { id: 'b', ...base, countingByRound: [[70, 71, 71, 74]], seed: 1 };
    expect(ncaaTeamTiebreak(a, b)).toBeLessThan(0);
    const same: ChTourTeamTieInput = { id: 's', ...base, countingByRound: [[70, 70, 72, 74]], seed: 2 };
    expect(ncaaTeamTiebreak(a, same)).toBeGreaterThan(0);
  });

  it('breaks individual ties on the most recent round, then the one before', () => {
    expect(ncaaPlayerTiebreak({ id: 'a', total: 213, rounds: [70, 72, 71] }, { id: 'b', total: 213, rounds: [71, 70, 72] })).toBeLessThan(0);
    expect(ncaaPlayerTiebreak({ id: 'a', total: 213, rounds: [70, 72, 71] }, { id: 'b', total: 213, rounds: [72, 70, 71] })).toBeGreaterThan(0);
  });

  it('uses the entered order for a playoff and shares what it leaves level', () => {
    const places = placeField(
      [
        { id: 'a', total: 210, playoffOrder: 2 },
        { id: 'b', total: 210, playoffOrder: 1 },
        { id: 'c', total: 212 },
        { id: 'd', total: 212 },
      ],
      'playoff',
    );
    expect(places.map((p) => p.label)).toEqual(['1', '2', 'T3', 'T3']);
  });
});

describe('records', () => {
  const field: ChTourFieldTeam[] = [
    { id: 'us', place: 3 },
    { id: 'a', place: 1 },
    { id: 'b', place: 2 },
    { id: 'c', place: 3 },
    { id: 'd', place: 5 },
    { id: 'e', place: 6 },
    { id: 'usB', place: 7, isBTeam: true },
    { id: 'naia', place: 8, sameDivision: false },
    { id: 'dq', place: null },
  ];

  it('turns a finish into wins, losses and ties against the field', () => {
    expect(recordFromFinish('us', field)).toEqual({ wins: 2, losses: 2, ties: 1 });
  });

  it('adds nothing without our own place', () => {
    expect(recordFromFinish('dq', field)).toEqual({ wins: 0, losses: 0, ties: 0 });
    expect(recordFromFinish('missing', field)).toEqual({ wins: 0, losses: 0, ties: 0 });
  });

  it('gives a 14-team field 13 results', () => {
    const big = Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, place: i + 1 }));
    const r = recordFromFinish('t3', big);
    expect(r.wins + r.losses + r.ties).toBe(13);
    expect(r).toEqual({ wins: 10, losses: 3, ties: 0 });
  });

  it('formats records and percentages the college way', () => {
    const season = addRecords([
      { wins: 10, losses: 3, ties: 0 },
      { wins: 1, losses: 0, ties: 1 },
    ]);
    expect(formatRecord(season)).toBe('11-3-1');
    expect(formatPct(recordPct(season))).toBe('.767');
    expect(formatPct(recordPct({ wins: 3, losses: 0, ties: 0 }))).toBe('1.000');
    expect(formatPct(recordPct({ wins: 0, losses: 0, ties: 0 }))).toBe('—');
  });

  it('meets the .500 rule at any one checkpoint', () => {
    expect(meetsFiveHundred([{ wins: 40, losses: 45, ties: 0 }, { wins: 48, losses: 46, ties: 0 }, null])).toBe(true);
    expect(meetsFiveHundred([{ wins: 40, losses: 45, ties: 0 }, null, null])).toBe(false);
    expect(meetsFiveHundred([{ wins: 5, losses: 5, ties: 0 }])).toBe(true);
    expect(meetsFiveHundred([null, null, null])).toBeNull();
  });
});
