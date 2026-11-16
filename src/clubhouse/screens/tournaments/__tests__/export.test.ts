import { describe, expect, it } from 'vitest';
import { resultsCount, resultsCsv } from '../export';
import { event, pr, ROSTER } from '../import/__tests__/fixtures';
import type { ChTourFieldTeam } from '../types';

/** Launch readiness F-02: an event's results as one spreadsheet, from the desk's own figures. */
const team = (over: Partial<ChTourFieldTeam> & { id: string; name: string }): ChTourFieldTeam => ({
  us: false,
  squad: 'A',
  sameDivision: true,
  seed: null,
  rounds: [null, null],
  total: null,
  toPar: null,
  place: null,
  placeN: null,
  thru: null,
  enteredAt: null,
  source: 'coach',
  ...over,
});

describe('resultsCsv', () => {
  it('lists the field in finishing order, then our players with their rounds, to par and rounds counted', () => {
    const ev = event({
      playerRounds: [
        pr({ playerId: 'ava', roundNumber: 1, total: 70, toPar: -2, count: 'counted' }),
        pr({ playerId: 'ava', roundNumber: 2, total: 71, toPar: -1, count: 'counted' }),
        pr({ playerId: 'theo', roundNumber: 1, slot: 2, total: 76, toPar: 4, count: 'dropped' }),
        pr({ playerId: 'theo', roundNumber: 2, slot: 2, total: null, status: 'wd', count: 'dropped' }),
      ],
      field: {
        size: 3,
        entered: 3,
        teams: [
          team({ id: 'f2', name: 'Elon', rounds: [290, 291], total: 581, toPar: 5, place: '2', placeN: 2 }),
          team({ id: 'f1', name: 'Demo University', us: true, rounds: [286, 287], total: 573, toPar: -3, place: '1', placeN: 1 }),
          team({ id: 'f3', name: 'Furman', squad: 'B', rounds: [300, null], total: null, toPar: null }),
        ],
        line: null,
        asOf: null,
      },
    });
    const f = resultsCsv({ event: ev, players: ROSTER, teamName: 'Demo University' }, '2026-11-15');
    expect(f.name).toBe('fall-invitational-results-2026-11-15.csv');
    expect(f.head).toEqual(['Row', 'Place', 'Name', 'Team', 'Role', 'R1', 'R2', 'Total', 'To par', 'Rounds counted']);
    expect(f.rows.slice(0, 3)).toEqual([
      ['Team', 1, 'Demo University', null, null, 286, 287, 573, -3, null],
      ['Team', 2, 'Elon', null, null, 290, 291, 581, 5, null],
      ['Team', null, 'Furman B', null, null, 300, null, null, null, null],
    ]);
    expect(f.rows[3]).toEqual(['Player', null, 'Ava Lindqvist', 'Demo University', 'Lineup', 70, 71, 141, -3, '2 of 2']);
    // A withdrawal is said in its round; the total and to par are over the rounds finished.
    expect(f.rows[4]).toEqual(['Player', null, 'Theo Marchetti', 'Demo University', 'Lineup', 76, 'WD', 76, 4, '0 of 2']);
    // The alternate is listed, with no rounds and nothing counted.
    expect(f.rows.at(-1)).toEqual(['Player', null, 'William Harper', 'Demo University', 'Alternate', null, null, null, null, null]);
    expect(resultsCount(f)).toBe('3 teams, 6 players');
  });

  it('with no field, writes our team alone from our cards', () => {
    const ev = event({
      status: 'complete',
      finish: { place: '4', placeN: 4, of: 12 },
      team: {
        rounds: [
          {
            roundNumber: 1,
            roundEventId: 'r1',
            par: 288,
            kind: 'complete',
            total: 290,
            toPar: 2,
            counting: [],
            dropped: [],
            tiedAtBoundary: [],
            missing: [],
          },
          {
            roundNumber: 2,
            roundEventId: 'r2',
            par: 288,
            kind: 'complete',
            total: 285,
            toPar: -3,
            counting: [],
            dropped: [],
            tiedAtBoundary: [],
            missing: [],
          },
        ],
        result: { kind: 'complete', total: 575, toPar: -1, rounds: [], droppedTotal: null },
      },
    });
    const f = resultsCsv({ event: ev, players: ROSTER, teamName: null }, '2026-11-15');
    expect(f.rows[0]).toEqual(['Team', 4, 'Our team', null, null, 290, 285, 575, -1, null]);
  });
});
