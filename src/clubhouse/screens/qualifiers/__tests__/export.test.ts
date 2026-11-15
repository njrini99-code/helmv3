import { describe, expect, it } from 'vitest';
import { standingsCsv } from '../export';
import type { ChQRow } from '../model';

/** Launch readiness F-02: a qualifier's standings as one spreadsheet, in the board's order. */
const row = (over: Partial<ChQRow> & { playerId: string; name: string }): ChQRow => ({
  classYear: 'Junior',
  position: null,
  tied: false,
  played: 0,
  toPar: null,
  total: null,
  avg: null,
  shortRounds: 0,
  move: null,
  missed: false,
  state: null,
  rounds: [],
  ...over,
});
const rd = (number: number, total: number, toPar: number) => ({
  id: `${number}`,
  playerId: 'x',
  number,
  total,
  toPar,
  date: '2026-10-01',
  course: null,
  holesPlayed: 18,
});

describe('standingsCsv', () => {
  it('writes place, each round, total, to par, rounds, average and standing, then the entrants with no round', () => {
    const board = {
      rows: [
        row({
          playerId: 'a',
          name: 'Ava Lindqvist',
          position: 1,
          played: 3,
          total: 213,
          toPar: -3,
          avg: 71,
          state: 'qualifying',
          rounds: [rd(1, 70, -2), rd(2, 72, 0), rd(3, 71, -1)],
        }),
        row({
          playerId: 't',
          name: 'Theo Marchetti',
          position: 2,
          tied: true,
          played: 3,
          total: 216,
          toPar: 0,
          avg: 72,
          state: 'tie',
          rounds: [rd(1, 72, 0), rd(2, 73, 1), rd(3, 71, -1)],
        }),
        row({
          playerId: 's',
          name: 'Sofia Alvarez',
          position: 2,
          tied: true,
          played: 2,
          total: 147,
          toPar: 3,
          avg: 73.456,
          missed: true,
          state: 'bubble',
          rounds: [rd(1, 74, 2), rd(3, 73, 1)],
        }),
      ],
      unscored: [row({ playerId: 'e', name: 'Eli Brandt', classYear: null })],
    };
    const f = standingsCsv({ name: 'Spring Qualifier', board, numRounds: 3, day: '2026-11-15' });
    expect(f.name).toBe('spring-qualifier-standings-2026-11-15.csv');
    expect(f.head).toEqual(['Place', 'Player', 'Class', 'R1', 'R2', 'R3', 'Total', 'To par', 'Rounds', 'Average', 'Standing']);
    expect(f.rows).toEqual([
      [1, 'Ava Lindqvist', 'Junior', 70, 72, 71, 213, -3, 3, 71, 'Qualifying'],
      ['T2', 'Theo Marchetti', 'Junior', 72, 73, 71, 216, 0, 3, 72, 'Tie at cut'],
      ['T2', 'Sofia Alvarez', 'Junior', 74, null, 73, 147, 3, 2, 73.5, 'Missed a round'],
      [null, 'Eli Brandt', null, null, null, null, null, null, 0, null, null],
    ]);
  });

  it('adds a column for a round numbered past the qualifier’s rounds, so no score is dropped', () => {
    const f = standingsCsv({
      name: 'Q',
      board: { rows: [row({ playerId: 'a', name: 'Ava', position: 1, rounds: [rd(4, 70, -2)] })], unscored: [] },
      numRounds: 3,
      day: '2026-11-15',
    });
    expect(f.head).toContain('R4');
    expect(f.rows[0]![6]).toBe(70);
  });
});
