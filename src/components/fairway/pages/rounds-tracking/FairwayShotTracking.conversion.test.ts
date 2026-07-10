/**
 * Unit tests for resolveDistanceAfterShot — the write-time conversion
 * boundary in FairwayShotTracking.tsx's handleNextShot.
 *
 * CONFIRMED P1 (production-readiness mission, 2026-07-09): the Fairway
 * shot-tracking path ignored the player's meters distance-unit preference —
 * a meters-preference player's raw typed value (e.g. "9" meaning 9 meters)
 * was written straight into distanceToHoleAfter as if it were already the
 * canonical yards/feet unit, corrupting shot distance, approach proximity
 * and GIR-adjacent stats. These tests lock in the fix: the player's typed
 * value must be converted from their active preference to the canonical
 * DB unit (yards for distance-remaining, feet for putts/on-green proximity)
 * before it is ever persisted.
 *
 * No time, no I/O, no rendering — pure function only.
 */

import { describe, it, expect } from 'vitest';
import { resolveDistanceAfterShot } from './FairwayShotTracking';

describe('resolveDistanceAfterShot — yards-mode (unchanged legacy behavior)', () => {
  it('a non-putt, non-green result is canonical yards, unrounded input rounds to nearest int', () => {
    const out = resolveDistanceAfterShot({
      rawInput: '150',
      isMeters: false,
      isPutting: false,
      resultOfShot: 'fairway',
    });
    expect(out).toEqual({ distanceAfter: 150, unitAfter: 'yards' });
  });

  it('a putt is canonical feet', () => {
    const out = resolveDistanceAfterShot({
      rawInput: '10',
      isMeters: false,
      isPutting: true,
      resultOfShot: 'green',
    });
    expect(out).toEqual({ distanceAfter: 10, unitAfter: 'feet' });
  });

  it('a non-putt shot that lands on the green is canonical feet (proximity)', () => {
    const out = resolveDistanceAfterShot({
      rawInput: '25',
      isMeters: false,
      isPutting: false,
      resultOfShot: 'green',
    });
    expect(out).toEqual({ distanceAfter: 25, unitAfter: 'feet' });
  });
});

describe('resolveDistanceAfterShot — meters-mode conversion boundary (the corruption fix)', () => {
  it('converts a meters-typed distance-remaining value to canonical yards', () => {
    // 137 m ≈ 150 yds (a typical approach-shot leave distance).
    const out = resolveDistanceAfterShot({
      rawInput: '137',
      isMeters: true,
      isPutting: false,
      resultOfShot: 'fairway',
    });
    expect(out.unitAfter).toBe('yards');
    expect(out.distanceAfter).toBe(150);
  });

  it('converts a meters-typed putt leave distance to canonical feet, NOT a literal feet value', () => {
    // Before the fix: "3" (meters) was written as 3 feet. 3 m is really ~10 ft
    // — understating putt leave distance by 3x and corrupting putting stats.
    const out = resolveDistanceAfterShot({
      rawInput: '3',
      isMeters: true,
      isPutting: true,
      resultOfShot: 'green',
    });
    expect(out.unitAfter).toBe('feet');
    expect(out.distanceAfter).toBe(10);
    expect(out.distanceAfter).not.toBe(3);
  });

  it('converts a meters-typed on-green proximity value to canonical feet, NOT a literal feet value', () => {
    // Before the fix: "9" (meters) was written as 9 feet. 9 m is really ~30 ft
    // — a 3x understatement of approach proximity / GIR-adjacent stats.
    const out = resolveDistanceAfterShot({
      rawInput: '9',
      isMeters: true,
      isPutting: false,
      resultOfShot: 'green',
    });
    expect(out.unitAfter).toBe('feet');
    expect(out.distanceAfter).toBe(30);
    expect(out.distanceAfter).not.toBe(9);
  });
});

describe('resolveDistanceAfterShot — invalid/edge input', () => {
  it('bails to 0 on an empty string, regardless of unit preference', () => {
    expect(resolveDistanceAfterShot({ rawInput: '', isMeters: false, isPutting: false, resultOfShot: 'fairway' }).distanceAfter).toBe(0);
    expect(resolveDistanceAfterShot({ rawInput: '', isMeters: true, isPutting: false, resultOfShot: 'fairway' }).distanceAfter).toBe(0);
  });

  it('bails to 0 on a negative number', () => {
    expect(resolveDistanceAfterShot({ rawInput: '-5', isMeters: true, isPutting: true, resultOfShot: 'green' }).distanceAfter).toBe(0);
  });

  it('bails to 0 on a non-numeric string', () => {
    expect(resolveDistanceAfterShot({ rawInput: 'abc', isMeters: true, isPutting: false, resultOfShot: 'fairway' }).distanceAfter).toBe(0);
  });

  it('trims surrounding whitespace before parsing', () => {
    const out = resolveDistanceAfterShot({ rawInput: '  150  ', isMeters: false, isPutting: false, resultOfShot: 'fairway' });
    expect(out.distanceAfter).toBe(150);
  });

  it('unitAfter is derived from context even when the parsed value bails to 0', () => {
    // The locked-unit rule must hold regardless of parse validity — the
    // caller relies on unitAfter to decide whether to bail, not the reverse.
    const out = resolveDistanceAfterShot({ rawInput: 'nope', isMeters: false, isPutting: true, resultOfShot: 'green' });
    expect(out.unitAfter).toBe('feet');
  });
});
