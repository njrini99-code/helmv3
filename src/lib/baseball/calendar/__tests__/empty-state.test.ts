// =============================================================================
// The Calendar's no-team empty state, under and after the recruiting sunset.
//
// This is a demo-path bug, not a theoretical one. A college coach who has not
// set up a team yet — an ordinary first-login state — opened Calendar and read
// "Your recruiting calendar is empty / Camp visits and official visit windows
// will appear here", under a **Browse prospects** button pointing at
// /baseball/dashboard/discover, which the sunset blocks. The module the product
// is currently not selling got the first word, and its CTA was a dead end.
//
// Both directions are asserted, deliberately. The sunset's whole design is that
// hiding is reversible, so a test that only proved "recruiting is hidden" would
// pass equally well against code that had deleted the narrative outright — and
// would give no warning the day someone flips the flag back.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

const moduleFlags = vi.hoisted(() => ({ recruitingEnabled: false }));

vi.mock('@/lib/baseball/product-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
  return { ...actual, isRecruitingEnabled: () => moduleFlags.recruitingEnabled };
});

import { resolveCalendarEmptyState } from '../empty-state';

describe('resolveCalendarEmptyState — recruiting sunset', () => {
  it('gives a college coach the generic no-team state, not the recruiting one', () => {
    moduleFlags.recruitingEnabled = false;

    expect(resolveCalendarEmptyState(true)).toEqual({
      recruitingEmpty: false,
      noTeamEmpty: true,
    });
  });

  it('never shows the recruiting state to a non-college coach', () => {
    moduleFlags.recruitingEnabled = false;

    expect(resolveCalendarEmptyState(false)).toEqual({
      recruitingEmpty: false,
      noTeamEmpty: true,
    });
  });

  it('always returns exactly one state — never both, never neither', () => {
    // CalendarFairway documents these as mutually exclusive and branches on
    // recruitingEmpty first. Both-true would silently swallow the generic
    // state; both-false renders the full calendar shell with nothing in it.
    for (const enabled of [true, false]) {
      moduleFlags.recruitingEnabled = enabled;
      for (const isCollegeCoach of [true, false]) {
        const state = resolveCalendarEmptyState(isCollegeCoach);
        expect(state.recruitingEmpty).not.toBe(state.noTeamEmpty);
      }
    }
  });
});

describe('resolveCalendarEmptyState — restoration path', () => {
  it('restores the recruiting narrative for a college coach when the module is re-enabled', () => {
    // The sunset preserves rather than deletes. Flipping
    // PRODUCT_MODULES.recruiting.enabled must bring this back with no edit to
    // the calendar page — this asserts the gate is the only thing holding it.
    moduleFlags.recruitingEnabled = true;

    expect(resolveCalendarEmptyState(true)).toEqual({
      recruitingEmpty: true,
      noTeamEmpty: false,
    });
  });

  it('still withholds it from non-college coaches once re-enabled', () => {
    moduleFlags.recruitingEnabled = true;

    expect(resolveCalendarEmptyState(false)).toEqual({
      recruitingEmpty: false,
      noTeamEmpty: true,
    });
  });
});
