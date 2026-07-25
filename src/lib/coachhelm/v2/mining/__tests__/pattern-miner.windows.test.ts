import { describe, expect, it } from 'vitest';
import {
  resolveMinerWindows,
  ABSOLUTE_MIN_ROUNDS,
  WINDOW_DAYS,
} from '../pattern-miner';

/**
 * Contract for the coach-configurable mining windows (migration
 * 20260725140000). The important assertion is the ASYMMETRY: the lookback is a
 * straight override, but the round floor only ever RAISES the engine's own
 * technical floor. A coach setting "1 round" must not make the miner attempt
 * to mine patterns out of one round.
 */
describe('resolveMinerWindows', () => {
  it('falls back to the module constants when nothing is supplied', () => {
    expect(resolveMinerWindows()).toEqual({
      lookbackDays: WINDOW_DAYS,
      minRounds: ABSOLUTE_MIN_ROUNDS,
    });
    expect(resolveMinerWindows({})).toEqual({
      lookbackDays: WINDOW_DAYS,
      minRounds: ABSOLUTE_MIN_ROUNDS,
    });
  });

  it('honours a supplied lookback window', () => {
    expect(resolveMinerWindows({ lookbackDays: 30 }).lookbackDays).toBe(30);
    expect(resolveMinerWindows({ lookbackDays: 365 }).lookbackDays).toBe(365);
  });

  it('raises the round floor but never lowers it below the technical minimum', () => {
    // A coach who wants more evidence gets it.
    expect(resolveMinerWindows({ minRounds: 10 }).minRounds).toBe(10);
    // A coach who wants less does NOT get less — below ABSOLUTE_MIN_ROUNDS
    // there is nothing statistically mineable, whatever the setting says.
    expect(resolveMinerWindows({ minRounds: 1 }).minRounds).toBe(ABSOLUTE_MIN_ROUNDS);
    expect(resolveMinerWindows({ minRounds: 0 }).minRounds).toBe(ABSOLUTE_MIN_ROUNDS);
    expect(resolveMinerWindows({ minRounds: -5 }).minRounds).toBe(ABSOLUTE_MIN_ROUNDS);
  });

  it('ignores unusable values rather than propagating NaN into a date subtraction', () => {
    // `Date.now() - NaN * 86400_000` is an Invalid Date, which PostgREST would
    // reject — and the miner would return [] for reasons no log explains.
    expect(resolveMinerWindows({ lookbackDays: NaN }).lookbackDays).toBe(WINDOW_DAYS);
    expect(resolveMinerWindows({ lookbackDays: Infinity }).lookbackDays).toBe(WINDOW_DAYS);
    expect(resolveMinerWindows({ minRounds: NaN }).minRounds).toBe(ABSOLUTE_MIN_ROUNDS);
  });

  it('clamps a zero/negative lookback to at least one day', () => {
    expect(resolveMinerWindows({ lookbackDays: 0 }).lookbackDays).toBe(1);
    expect(resolveMinerWindows({ lookbackDays: -30 }).lookbackDays).toBe(1);
  });
});
