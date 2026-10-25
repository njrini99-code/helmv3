import { describe, expect, it } from 'vitest';

/**
 * A7: Fairways, GIR, Scrambling and Sand saves are held to their floors. Under the show floor the row has no value and
 * says what it needs; between show and early it keeps the value with an early-read tag; from early it is plain.
 */

import { rate, rateSample, type ChRoundCache } from '../data/stats-common';
import { floorRate } from '../lib/stats-signal';

const round = (over: Partial<ChRoundCache>): ChRoundCache => ({ round_id: 'r', ...over }) as ChRoundCache;
/** One round per bunker shot list entry: `made` of `att` sand saves. */
const sandRounds = (rounds: Array<[number, number]>) => rounds.map(([made, att]) => round({ sand_saves: made, sand_attempts: att }));
const sand = (rows: ChRoundCache[]) => floorRate('scramble', rateSample(rows, 'sand_attempts', 'chance'), rate(rows, 'sand_saves', 'sand_attempts'));

describe('rate floors (A7)', () => {
  it('one sand attempt needs more chances: no "100% sand saves"', () => {
    const r = sand(sandRounds([[1, 1]]));
    expect(r.state).toBe('none');
    expect(r.value).toBeNull();
    expect(r.needs).toBe('Needs 10 chances');
  });

  it('twelve attempts are an early read with the value kept', () => {
    const r = sand(sandRounds([[3, 4], [2, 4], [1, 4]]));
    expect(r.state).toBe('early');
    expect(r.value).toBe(50);
    expect(r.early).toBe('Early read · 12 chances');
  });

  it('forty attempts read plain', () => {
    const r = sand(sandRounds(Array.from({ length: 10 }, () => [2, 4] as [number, number])));
    expect(r.state).toBe('steady');
    expect(r.value).toBe(50);
    expect(r.early).toBeUndefined();
    expect(r.needs).toBeUndefined();
  });

  it('fairways and greens count rounds with a chance, not the chances', () => {
    const one = [round({ fairways_hit: 7, fairways_total: 14 })];
    expect(rateSample(one, 'fairways_total', 'round')).toBe(1);
    expect(floorRate('fraction', 1, rate(one, 'fairways_hit', 'fairways_total')).needs).toBe('Needs 2 rounds');
    const three = [...one, round({ fairways_hit: 7, fairways_total: 14 }), round({ fairways_hit: 0, fairways_total: 0 })];
    // A round with no fairway to hit is not a chance at one.
    expect(rateSample(three, 'fairways_total', 'round')).toBe(2);
    expect(floorRate('fraction', 2, 50).early).toBe('Early read · 2 rounds');
    expect(floorRate('fraction', 5, 50).state).toBe('steady');
  });

  it('no attempts at all stay empty, with no "needs" line pretending a rate was read', () => {
    const r = sand([round({})]);
    expect(r.value).toBeNull();
    expect(r.needs).toBeUndefined();
  });
});
