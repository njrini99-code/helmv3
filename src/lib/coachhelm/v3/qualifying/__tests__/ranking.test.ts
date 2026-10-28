/**
 * The one qualifier order (owner, 2026-10-28: "the server decides qualifier tie order once, and both Clubhouse and
 * Fairway use it"). `rankStandings` places every scored player with rank, position and tie, by the board's rule:
 * a card a round short below every full card, then to par, strokes, more rounds, name.
 */
import { describe, expect, it } from 'vitest';
import { rankStandings, type StandingKey } from '../ranking';

const k = (name: string, played: number, total: number, toPar: number): StandingKey => ({ name, played, total, toPar });
const place = (keys: StandingKey[]) =>
  rankStandings(keys, (x) => x).map((p) => [p.item.name, p.rank, p.position, p.tied, p.short]);

describe('rankStandings: ties', () => {
  it('equal to par and strokes share a position; the next one skips (1, T2, T2, 4)', () => {
    expect(place([k('d', 2, 150, 6), k('b', 2, 146, 2), k('c', 2, 146, 2), k('a', 2, 140, -4)])).toEqual([
      ['a', 1, 1, false, false],
      ['b', 2, 2, true, false],
      ['c', 3, 2, true, false],
      ['d', 4, 4, false, false],
    ]);
  });

  it('inside a tie the display order is the board rule’s last key (name), whatever the input order', () => {
    const keys = [k('Zoe', 2, 146, 2), k('Amy', 2, 146, 2), k('Max', 2, 146, 2)];
    for (const input of [keys, [...keys].reverse(), [keys[1]!, keys[2]!, keys[0]!]]) {
      expect(place(input).map((p) => p[0])).toEqual(['Amy', 'Max', 'Zoe']);
      expect(place(input).map((p) => p[2])).toEqual([1, 1, 1]);
    }
  });

  it('level on to par but not strokes is no tie: fewer strokes first', () => {
    expect(place([k('b', 2, 144, 0), k('a', 2, 142, 0)])).toEqual([
      ['a', 1, 1, false, false],
      ['b', 2, 2, false, false],
    ]);
  });

  it('equal totals but different to par are no tie: to par decides first', () => {
    expect(place([k('a', 1, 72, 1), k('b', 1, 72, 0)]).map((p) => p[0])).toEqual(['b', 'a']);
  });
});

describe('rankStandings: a card a round short (owner decision 10)', () => {
  it('ranks below every full card, whatever its to par', () => {
    expect(place([k('short', 1, 68, -4), k('full1', 2, 150, 6), k('full2', 2, 144, 0)])).toEqual([
      ['full2', 1, 1, false, false],
      ['full1', 2, 2, false, false],
      ['short', 3, 3, false, true],
    ]);
  });

  it('a full and a short card level on to par and strokes are in different groups: no shared position', () => {
    expect(place([k('short', 1, 148, 4), k('full', 2, 148, 4)])).toEqual([
      ['full', 1, 1, false, false],
      ['short', 2, 2, false, true],
    ]);
  });

  it('short cards rank among themselves by the same rule, ties included', () => {
    const rows = place([k('full', 3, 216, 0), k('s2a', 2, 146, 2), k('s1', 1, 70, -2), k('s2b', 2, 146, 2)]);
    expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual([
      ['full', 1, false],
      ['s1', 2, false],
      ['s2a', 3, true],
      ['s2b', 3, true],
    ]);
  });

  it('does not mutate its input and handles an empty field', () => {
    const input = [k('b', 1, 74, 2), k('a', 1, 70, -2)];
    rankStandings(input, (x) => x);
    expect(input.map((x) => x.name)).toEqual(['b', 'a']);
    expect(rankStandings([], (x: StandingKey) => x)).toEqual([]);
  });
});
