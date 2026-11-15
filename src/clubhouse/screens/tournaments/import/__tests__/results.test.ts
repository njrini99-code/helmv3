import { describe, expect, it } from 'vitest';
import { findLayout, intOf, mapColumns, personName, placeOf, readResults, statusOf, withColumn } from '../results';
import type { ChResultsSheet } from '../sheets';

const HOLES = Array.from({ length: 18 }, (_, i) => String(i + 1));
const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5].map(String);
const card = (base: number) => Array.from({ length: 18 }, (_, i) => String(Number(PARS[i]) + (i === base % 18 ? 1 : 0)));
const sum = (xs: readonly string[]) => xs.reduce((a, b) => a + Number(b), 0);

describe('results import: finding the columns', () => {
  it('maps a Golf Genius style hole-by-hole sheet: title rows above, a Round column, Out, In and Total', () => {
    const sheet: ChResultsSheet = {
      name: 'Tournament Hole-by-Hole Scores',
      rows: [
        ['Fall Invitational', '', ''],
        ['Pinehurst No. 2', '', ''],
        ['Player Name', 'Team', 'Round', ...HOLES.slice(0, 9), 'Out', ...HOLES.slice(9), 'In', 'Total'],
      ],
    };
    const layout = findLayout(sheet, 0);
    expect(layout.header).toBe(2);
    expect(layout.kind).toBe('holes');
    expect(layout.columns.name).toBe(0);
    expect(layout.columns.team).toBe(1);
    expect(layout.columns.round).toBe(2);
    expect(layout.columns.holes[0]).toBe(3);
    // Out sits between 9 and 10: hole 10 is after it.
    expect(layout.columns.holes[9]).toBe(13);
    expect(layout.columns.total).toBe(23);
  });

  it('reads bare numbers as rounds when the values under them are round scores', () => {
    const rows = [
      ['Pos', 'Player', 'School', '1', '2', '3', 'Tot'],
      ['1', 'Ava Lind', 'Demo', '70', '71', '69', '210'],
      ['2', 'Bo Kim', 'Elon', '72', '70', '70', '212'],
    ];
    const map = mapColumns(rows, 0);
    expect(map.rounds.slice(0, 3)).toEqual([3, 4, 5]);
    expect(map.holes.every((h) => h == null)).toBe(true);
  });

  it('lets the coach move a column, and says what kind of sheet that makes', () => {
    const layout = findLayout({ name: 'S', rows: [['Golfer', 'Score']] }, 0);
    expect(layout.kind).toBe('rounds');
    const moved = withColumn(layout, 'total', null);
    expect(moved.kind).toBe('none');
    expect(withColumn(moved, { round: 1 }, 1).kind).toBe('rounds');
  });
});

describe('results import: reading the rows', () => {
  it('reads holes per player per round, skipping the par row and repeated headers, and turning "Last, First" round', () => {
    const header = ['Player', 'Team', 'Round', ...HOLES, 'Total'];
    const ava1 = card(3);
    const ava2 = card(7);
    const sheet: ChResultsSheet = {
      name: 'Scores',
      rows: [header, ['Par', '', '', ...PARS, '72'], ['LINDQVIST, AVA', 'Demo University', '1', ...ava1, String(sum(ava1))], header, ['Lindqvist, Ava', 'Demo University', '2', ...ava2, String(sum(ava2))], ['Kim, Bo', 'Elon', '1', ...card(1), 'WD']],
    };
    const read = readResults([sheet]);
    expect(read.holes).toBe(18);
    expect(read.pars?.slice(0, 4)).toEqual([4, 4, 3, 4]);
    expect(read.rounds).toEqual([1, 2]);
    const ava = read.players.find((p) => p.name === 'Ava Lindqvist')!;
    expect(ava.team).toBe('Demo University');
    expect(ava.rounds[1]!.holes![3]).toBe(5);
    expect(ava.rounds[2]!.total).toBe(sum(ava2));
    expect(read.players.find((p) => p.name === 'Bo Kim')!.rounds[1]!.status).toBe('wd');
    expect(read.warnings).toEqual([]);
  });

  it('takes the round from a "Round 2" line over a block, or from the sheet’s name', () => {
    const header = ['Player', ...HOLES];
    const stacked: ChResultsSheet = { name: 'All rounds', rows: [['Round 1'], header, ['Ava Lind', ...card(0)], ['Round 2'], header, ['Ava Lind', ...card(1)]] };
    expect(Object.keys(readResults([stacked]).players[0]!.rounds)).toEqual(['1', '2']);
    const named: ChResultsSheet = { name: 'Rd 3', rows: [header, ['Ava Lind', ...card(0)]] };
    expect(Object.keys(readResults([named]).players[0]!.rounds)).toEqual(['3']);
  });

  it('holes for one round with no round anywhere go to round 0: the check step asks which round', () => {
    const read = readResults([{ name: 'Card', rows: [['Name', ...HOLES], ['Ava Lind', ...card(0)]] }]);
    expect(read.rounds).toEqual([0]);
  });

  it('reads a leaderboard of round scores with positions, WD in a round, and the written total', () => {
    const read = readResults([
      {
        name: 'Individual',
        rows: [
          ['Pos', 'Player', 'Team', 'R1', 'R2', 'R3', 'Total'],
          ['T1', 'Ava Lind', 'Demo', '70', '71', '69', '210'],
          ['', 'Bo Kim', 'Elon', '72', 'WD', '', 'WD'],
        ],
      },
    ]);
    const ava = read.players[0]!;
    expect(ava.pos).toEqual({ n: 1, tied: true });
    expect(ava.rounds[3]).toEqual({ holes: null, total: 69, status: 'ok' });
    expect(ava.total).toBe(210);
    expect(read.players[1]!.rounds[2]).toEqual({ holes: null, total: null, status: 'wd' });
  });

  it('reads a team leaderboard with no player column as teams', () => {
    const read = readResults([
      {
        name: 'Team',
        rows: [
          ['Place', 'Team', 'Rd 1', 'Rd 2', 'Total'],
          ['1', 'Elon', '285', '288', '573'],
          ['T2', 'Demo University', '290', '286', '576'],
        ],
      },
    ]);
    expect(read.players).toEqual([]);
    expect(read.teams.map((t) => [t.name, t.rounds[1], t.rounds[2], t.pos?.n])).toEqual([
      ['Elon', 285, 288, 1],
      ['Demo University', 290, 286, 2],
    ]);
  });

  it('says when the holes don’t add up to the total written, and uses the holes', () => {
    const c = card(0);
    const read = readResults([{ name: 'R1', rows: [['Player', ...HOLES, 'Total'], ['Ava Lind', ...c, String(sum(c) + 1)]] }]);
    expect(read.warnings[0]).toMatch(/don’t add up to the total written for Ava Lind/);
  });
});

describe('results import: cells', () => {
  it('names', () => {
    expect(personName('SMITH, John (a)')).toEqual({ name: 'John Smith', team: null });
    expect(personName('John Smith (Demo University)')).toEqual({ name: 'John Smith', team: 'Demo University' });
    expect(personName("o'neil, sean*")).toEqual({ name: "Sean O'Neil", team: null });
    expect(personName('McKenzie Lee')).toEqual({ name: 'McKenzie Lee', team: null });
  });
  it('places, statuses and numbers', () => {
    expect(placeOf('T3')).toEqual({ n: 3, tied: true });
    expect(placeOf('12')).toEqual({ n: 12, tied: false });
    expect(placeOf('1st')).toEqual({ n: 1, tied: false });
    expect(placeOf('WD')).toBeNull();
    expect(statusOf('W/D')).toBe('wd');
    expect(statusOf('DQ')).toBe('dq');
    expect(statusOf('72')).toBeNull();
    expect(intOf('72.0')).toBe(72);
    expect(intOf('+3')).toBeNull();
    expect(intOf('E')).toBeNull();
  });
});
