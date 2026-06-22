/**
 * Unit tests for the P1-12 effectiveness ledger PURE derivation helpers.
 *
 * These pin the status ladder (`deriveTrustStatus`) and the recent-trend
 * sign-logic (`deriveTrend`) exactly to the shared contract. Both are pure —
 * no database, no clock, no randomness — so the tests are fully deterministic.
 *
 * Run: npm test -- event-ledger
 */
import { describe, test, expect } from 'vitest';
import {
  deriveTrustStatus,
  deriveTrend,
  RECENT_TREND_WINDOW,
  type TrustStatus,
} from './event-ledger';

describe('deriveTrustStatus — the status ladder', () => {
  test('zero measured outcomes → new_hypothesis (no evidence)', () => {
    expect(deriveTrustStatus(0, 0)).toBe<TrustStatus>('new_hypothesis');
    // worked is ignored when nothing was measured.
    expect(deriveTrustStatus(0, 5)).toBe<TrustStatus>('new_hypothesis');
  });

  test('1 or 2 measured → needs_validation (too few to trust)', () => {
    expect(deriveTrustStatus(1, 0)).toBe<TrustStatus>('needs_validation');
    expect(deriveTrustStatus(1, 1)).toBe<TrustStatus>('needs_validation');
    expect(deriveTrustStatus(2, 2)).toBe<TrustStatus>('needs_validation');
  });

  test('measured >= 3 and rate >= 0.6 → proven', () => {
    expect(deriveTrustStatus(3, 3)).toBe<TrustStatus>('proven'); // 1.0
    expect(deriveTrustStatus(3, 2)).toBe<TrustStatus>('proven'); // 0.666…
    expect(deriveTrustStatus(5, 3)).toBe<TrustStatus>('proven'); // 0.6 boundary
    expect(deriveTrustStatus(10, 6)).toBe<TrustStatus>('proven'); // 0.6 boundary
  });

  test('measured >= 3 and 0.4 <= rate < 0.6 → promising', () => {
    expect(deriveTrustStatus(5, 2)).toBe<TrustStatus>('promising'); // 0.4 boundary
    expect(deriveTrustStatus(10, 5)).toBe<TrustStatus>('promising'); // 0.5
    expect(deriveTrustStatus(10, 5).valueOf()).not.toBe('proven');
    // just under 0.6 stays promising
    expect(deriveTrustStatus(100, 59)).toBe<TrustStatus>('promising'); // 0.59
  });

  test('measured >= 3 and rate < 0.4 → underperforming', () => {
    expect(deriveTrustStatus(3, 0)).toBe<TrustStatus>('underperforming'); // 0
    expect(deriveTrustStatus(3, 1)).toBe<TrustStatus>('underperforming'); // 0.333…
    expect(deriveTrustStatus(100, 39)).toBe<TrustStatus>('underperforming'); // 0.39
  });

  test('boundary values are inclusive on the high side', () => {
    // exactly 0.6 → proven (>=), exactly 0.4 → promising (>=)
    expect(deriveTrustStatus(5, 3)).toBe('proven');
    expect(deriveTrustStatus(5, 2)).toBe('promising');
  });

  test('hardened against malformed counts (clamp + floor + non-finite)', () => {
    // worked > measured is clamped to measured → rate caps at 1.0, never NaN.
    expect(deriveTrustStatus(3, 99)).toBe<TrustStatus>('proven');
    // negative worked clamps to 0.
    expect(deriveTrustStatus(3, -5)).toBe<TrustStatus>('underperforming');
    // negative / NaN measured reads as zero evidence.
    expect(deriveTrustStatus(-1, 0)).toBe<TrustStatus>('new_hypothesis');
    expect(deriveTrustStatus(Number.NaN, 0)).toBe<TrustStatus>('new_hypothesis');
    // fractional inputs floor before the ratio.
    expect(deriveTrustStatus(3.9, 3.9)).toBe<TrustStatus>('proven');
  });

  test('deterministic — same inputs always yield same status', () => {
    for (let i = 0; i < 50; i++) {
      expect(deriveTrustStatus(7, 4)).toBe('promising');
    }
  });
});

describe('deriveTrend — recent outcome direction (newest-first)', () => {
  test('empty list → null (no measured outcomes)', () => {
    expect(deriveTrend([])).toBeNull();
  });

  test('net-positive recent improvements → up', () => {
    expect(deriveTrend([1, 2, 3])).toBe('up');
    expect(deriveTrend([0.5, -0.1, 0.2])).toBe('up'); // 2 pos vs 1 neg
  });

  test('net-negative recent improvements → down', () => {
    expect(deriveTrend([-1, -2, -3])).toBe('down');
    expect(deriveTrend([-0.5, 0.1, -0.2])).toBe('down'); // 2 neg vs 1 pos
  });

  test('tie between positive and negative → flat', () => {
    expect(deriveTrend([1, -1])).toBe('flat');
    expect(deriveTrend([2, -2, 0])).toBe('flat'); // 1 pos, 1 neg, 1 zero
  });

  test('all-zero improvements (present but flat) → flat', () => {
    expect(deriveTrend([0, 0, 0])).toBe('flat');
  });

  test('null/undefined/non-finite entries are ignored', () => {
    // single real positive among nulls → up
    expect(deriveTrend([null, 5, undefined])).toBe('up');
    // all entries null → no signed evidence → null
    expect(deriveTrend([null, null, null])).toBeNull();
    expect(deriveTrend([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  test('only the most-recent RECENT_TREND_WINDOW entries count', () => {
    expect(RECENT_TREND_WINDOW).toBe(3);
    // 3 negatives up front outweigh later positives that fall outside the window.
    expect(deriveTrend([-1, -1, -1, 10, 10, 10])).toBe('down');
    // 3 positives up front → up regardless of older regressions.
    expect(deriveTrend([1, 1, 1, -10, -10])).toBe('up');
  });

  test('zero exactly at the worked-threshold is neither up nor down', () => {
    // a single 0 is "present but unsigned" → flat (not null, an outcome existed).
    expect(deriveTrend([0])).toBe('flat');
  });

  test('non-array input → null (defensive)', () => {
    // @ts-expect-error — exercising the runtime guard against bad callers.
    expect(deriveTrend(null)).toBeNull();
    // @ts-expect-error — exercising the runtime guard against bad callers.
    expect(deriveTrend(undefined)).toBeNull();
  });

  test('deterministic — same series always yields same trend', () => {
    for (let i = 0; i < 50; i++) {
      expect(deriveTrend([3, -1, 2])).toBe('up');
    }
  });
});
