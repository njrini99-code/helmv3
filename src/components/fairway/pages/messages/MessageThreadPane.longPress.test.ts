/* ============================================================================
 * MessageThreadPane · long-press slop
 *
 * WHY THIS FILE EXISTS
 *
 * The long-press menu shipped cancelling on the FIRST pointermove. That reads
 * as correct — "they moved, so they meant to scroll" — and it passes every
 * check we had: jsdom emits no spurious pointermove, and a screenshot cannot
 * photograph a gesture. On real touch hardware a resting finger emits a steady
 * dribble of sub-pixel moves for the whole press, so the deliberate stationary
 * hold the feature is FOR was the one gesture guaranteed to be cancelled.
 *
 * The fix is a distance threshold. These tests pin the threshold itself, so a
 * later "simplification" back to cancel-on-any-move fails here instead of on
 * someone's phone.
 * ========================================================================== */

import { describe, it, expect } from 'vitest';
import { exceedsLongPressSlop } from './MessageThreadPane';

const origin = { x: 100, y: 200 };

describe('exceedsLongPressSlop', () => {
  it('does not cancel on a finger that has not moved', () => {
    expect(exceedsLongPressSlop(origin, { x: 100, y: 200 })).toBe(false);
  });

  it('does not cancel on digitizer jitter — the bug this replaces', () => {
    // The shape of a real resting press: a few px of drift in both axes.
    for (const point of [
      { x: 101, y: 200 },
      { x: 100, y: 203 },
      { x: 97, y: 198 },
      { x: 104, y: 206 },
    ]) {
      expect(exceedsLongPressSlop(origin, point)).toBe(false);
    }
  });

  it('holds right up to the threshold, inclusive', () => {
    expect(exceedsLongPressSlop(origin, { x: 110, y: 210 })).toBe(false);
  });

  it('cancels once either axis passes the threshold', () => {
    expect(exceedsLongPressSlop(origin, { x: 111, y: 200 })).toBe(true);
    expect(exceedsLongPressSlop(origin, { x: 100, y: 211 })).toBe(true);
  });

  it('cancels on a real scroll in either direction', () => {
    expect(exceedsLongPressSlop(origin, { x: 100, y: 260 })).toBe(true);
    expect(exceedsLongPressSlop(origin, { x: 100, y: 140 })).toBe(true);
    expect(exceedsLongPressSlop(origin, { x: 40, y: 200 })).toBe(true);
  });

  it('uses a threshold in the platform range (8–12px), not zero', () => {
    // Zero tolerance is the defect; anything past ~12px stops feeling like a
    // hold and starts swallowing real scrolls.
    let threshold = 0;
    while (threshold < 100 && !exceedsLongPressSlop(origin, { x: origin.x + threshold, y: origin.y })) {
      threshold += 1;
    }
    expect(threshold).toBeGreaterThanOrEqual(9);
    expect(threshold).toBeLessThanOrEqual(13);
  });
});
