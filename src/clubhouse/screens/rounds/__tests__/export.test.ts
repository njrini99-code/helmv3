import { describe, expect, it } from 'vitest';
import type { ChLibraryRound } from '../../../data/rounds-shape';
import { previewHoles, previewReadRoundHoles } from '../../../preview/export-holes';
import { inAverages, roundsCsv } from '../export';

/** Launch readiness F-02: rounds with their holes, one row a round (Rounds, Team rounds). */
const round = (over: Partial<ChLibraryRound> & { id: string }): ChLibraryRound => ({
  date: '2026-10-12',
  course: 'Finley GC',
  tee: 'Blue tees',
  teeColor: 'blue',
  type: 'qualifier',
  holes: 18,
  score: 74,
  toPar: 2,
  out: 37,
  inn: 37,
  fairways: { hit: 9, of: 14 },
  greens: { hit: 10, of: 18 },
  putts: 31,
  countable: true,
  ...over,
});

const PARS = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

describe('roundsCsv', () => {
  it('writes a round, its figures and each hole’s score and par', () => {
    const r = round({ id: 'r1' });
    const holes = { r1: PARS.map((par, i) => ({ n: i + 1, par, score: par + (i < 2 ? 1 : 0) })) };
    const f = roundsCsv({ rounds: [r], holes, team: false, name: ['rounds', '2026-11-15'] });
    expect(f.name).toBe('rounds-2026-11-15.csv');
    expect(f.head.slice(0, 16)).toEqual([
      'Date',
      'Course',
      'Tees',
      'Type',
      'Holes',
      'Score',
      'To par',
      'Out',
      'In',
      'Putts',
      'Fairways hit',
      'Fairways',
      'Greens hit',
      'Greens',
      'In averages',
      'Hole 1',
    ]);
    expect(f.head).toHaveLength(15 + 36);
    expect(f.head.at(-1)).toBe('Par 18');
    const row = f.rows[0]!;
    expect(row.slice(0, 15)).toEqual(['2026-10-12', 'Finley GC', 'Blue tees', 'Qualifier', 18, 74, 2, 37, 37, 31, 9, 14, 10, 18, true]);
    expect(row.slice(15, 18)).toEqual([5, 6, 4]);
    expect(row.slice(33, 36)).toEqual([4, 5, 4]);
  });

  it('adds the player first for a coach, and keeps the order it was given', () => {
    const f = roundsCsv({
      rounds: [
        { ...round({ id: 'b' }), player: 'Theo Marchetti' },
        { ...round({ id: 'a' }), player: 'Ava Lindqvist' },
      ],
      holes: {},
      team: true,
      name: ['Demo University', 'rounds'],
    });
    expect(f.head[0]).toBe('Player');
    expect(f.rows.map((r) => r[0])).toEqual(['Theo Marchetti', 'Ava Lindqvist']);
    expect(f.name).toBe('demo-university-rounds.csv');
  });

  it('leaves holes 10 to 18 empty on a nine, and a total-only round has no holes even if some were read', () => {
    const nine = round({ id: 'n', holes: 9, score: 38, toPar: 2, inn: null });
    const total = round({ id: 't', totalOnly: true });
    const holes = { n: PARS.slice(0, 9).map((par, i) => ({ n: i + 1, par, score: par })), t: [{ n: 1, par: 4, score: 9 }] };
    const f = roundsCsv({ rounds: [nine, total], holes, team: false, name: ['rounds'] });
    expect(f.rows[0]!.slice(15, 33)).toEqual([...PARS.slice(0, 9), ...Array(9).fill(undefined)]);
    expect(f.rows[0]![14]).toBe(false);
    expect(f.rows[1]!.slice(15)).toEqual(Array(36).fill(undefined));
  });

  it('says a practice round or a round that doesn’t count isn’t in the averages', () => {
    expect(inAverages(round({ id: 'x' }))).toBe(true);
    expect(inAverages(round({ id: 'x', type: 'practice', averaged: false }))).toBe(false);
    expect(inAverages(round({ id: 'x', countable: false }))).toBe(false);
    expect(inAverages(round({ id: 'x', holes: 9 }))).toBe(false);
  });
});

describe('the preview’s made-up holes', () => {
  it('add up to the round’s score and par, the same every time', async () => {
    for (const r of [
      round({ id: 'r1', score: 74, toPar: 2 }),
      round({ id: 'r2', score: 67, toPar: -4 }),
      round({ id: 'r3', score: 80, toPar: 9 }),
      round({ id: 'r4', holes: 9, score: 40, toPar: 4 }),
    ]) {
      const h = previewHoles(r);
      expect(h).toHaveLength(r.holes);
      expect(h.reduce((a, x) => a + (x.score ?? 0), 0)).toBe(r.score);
      expect(h.reduce((a, x) => a + x.par, 0)).toBe(r.score - r.toPar!);
      expect(previewHoles(r)).toEqual(h);
    }
    expect(previewHoles(round({ id: 't', totalOnly: true }))).toEqual([]);
    const read = previewReadRoundHoles([round({ id: 'r1' })]);
    await expect(read(['r1', 'gone'])).resolves.toMatchObject({ success: true, data: { r1: expect.any(Array) } });
  });
});
