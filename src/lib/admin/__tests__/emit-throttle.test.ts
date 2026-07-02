import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  shouldEmit,
  drainCollapsedCount,
  __resetEmitThrottleForTests,
} from '@/lib/admin/emit-throttle';

describe('emit-throttle', () => {
  beforeEach(() => {
    __resetEmitThrottleForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first emit for a fresh key', () => {
    expect(shouldEmit('demo:ECONNRESET')).toBe(true);
  });

  it('collapses subsequent emits for the same key inside the window', () => {
    expect(shouldEmit('demo:X', 60_000)).toBe(true);
    expect(shouldEmit('demo:X', 60_000)).toBe(false);
    expect(shouldEmit('demo:X', 60_000)).toBe(false);
    expect(drainCollapsedCount('demo:X')).toBe(2);
  });

  it('drainCollapsedCount resets to 0 after reading', () => {
    shouldEmit('demo:Y', 60_000);
    shouldEmit('demo:Y', 60_000);
    expect(drainCollapsedCount('demo:Y')).toBe(1);
    expect(drainCollapsedCount('demo:Y')).toBe(0);
  });

  it('allows a new emit once the window elapses, carrying the collapsed count', () => {
    expect(shouldEmit('demo:Z', 60_000)).toBe(true); // emit #1
    for (let i = 0; i < 98; i++) {
      expect(shouldEmit('demo:Z', 60_000)).toBe(false); // collapsed
    }
    vi.advanceTimersByTime(61_000);
    expect(shouldEmit('demo:Z', 60_000)).toBe(true); // emit #2 — window elapsed
    expect(drainCollapsedCount('demo:Z')).toBeGreaterThanOrEqual(98);
  });

  it('100 immediate identical failures produce <=2 allowed emits, second carries collapsed_count >= 98', () => {
    const key = 'savePartialRound:23505';
    let allowedCount = 0;
    let secondCallCollapsed = 0;
    for (let i = 0; i < 99; i++) {
      if (shouldEmit(key)) {
        allowedCount++;
      }
    }
    vi.advanceTimersByTime(61_000);
    if (shouldEmit(key)) {
      allowedCount++;
      secondCallCollapsed = drainCollapsedCount(key);
    }
    expect(allowedCount).toBeLessThanOrEqual(2);
    expect(allowedCount).toBe(2);
    expect(secondCallCollapsed).toBeGreaterThanOrEqual(98);
  });

  it('distinct keys are independent (one key collapsing does not affect another)', () => {
    expect(shouldEmit('a', 60_000)).toBe(true);
    expect(shouldEmit('a', 60_000)).toBe(false);
    expect(shouldEmit('b', 60_000)).toBe(true);
    expect(drainCollapsedCount('a')).toBe(1);
    expect(drainCollapsedCount('b')).toBe(0);
  });

  it('drainCollapsedCount for an unknown key is 0 (never throws)', () => {
    expect(drainCollapsedCount('never-seen')).toBe(0);
  });

  it('LRU-caps at 500 entries — oldest keys are evicted, not newest', () => {
    for (let i = 0; i < 550; i++) {
      shouldEmit(`key-${i}`, 60_000);
    }
    // The earliest keys should have been evicted.
    expect(shouldEmit('key-0', 60_000)).toBe(true); // re-admitted as a "new" key
    // The most recent keys should still be tracked (collapse, not fresh-allow).
    expect(shouldEmit('key-549', 60_000)).toBe(false);
  });

  it('never throws even under pathological input', () => {
    expect(() => shouldEmit('', 0)).not.toThrow();
    expect(() => drainCollapsedCount('')).not.toThrow();
  });
});
