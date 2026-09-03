/**
 * DatePicker — the month arrows must actually change the month.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Reported from Shenandoah 2026-08-19: "Calendar is glitching and won't let him
 * change months", with a screenshot of the event editor's Start-date popover
 * stuck on the selected date's month.
 *
 * The cause was in CalendarSurface: the entrance animation bumped a `key` on
 * the wrapper div holding <DayPicker>. DayPicker is UNCONTROLLED here (no
 * `month` / `defaultMonth` prop), so it owns the displayed month in internal
 * state — and remounting discarded it. Every arrow click advanced the month and
 * instantly reverted it, so from the user's side the nav simply did nothing.
 *
 * The fix (55ac0bea7) replays the CSS animation on a ref instead of keying the
 * wrapper. But it was verified against CalendarSurface in isolation, and there
 * was NO test anywhere under src/components/fairway/calendar/ — so nothing
 * pinned the behavior at the level the bug was actually reported at: the
 * DatePicker popover, which is what `DateChooser` renders for the event
 * editor's Start/End date fields.
 *
 * This test drives the real composition (DatePicker -> CalendarSurface ->
 * DayPicker) through the popover, which is why it would have caught the
 * original bug: it asserts the caption after a click, not that a handler fired.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from '../date-picker';

// The month arrows are relative to TODAY, and two of these cases assert an
// absolute date ("September 4th, 2026") reached by clicking `next month` once.
// That only holds while the real clock says August 2026 — so this file was a
// date bomb, and it went off early in the east: the shifted-timezone CI matrix
// runs at Pacific/Kiritimati (UTC+14), where 2026-09-03 19:00 UTC is already
// 2026-09-04 local, `next month` lands on OCTOBER, and the September 4th button
// does not exist. It failed there while passing in every other zone, and would
// have failed everywhere within days.
//
// Pinned to mid-August so no UTC offset in the -12..+14 range can push it into
// another month. `toFake: ['Date']` fakes the clock ONLY — userEvent drives
// real timers for its pointer sequences and hangs if those are faked too.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** The month/year heading react-day-picker renders in its caption. */
function currentCaption(): string {
  // The caption is the grid's accessible name in rdp v10.
  const grid = screen.getByRole('grid');
  return grid.getAttribute('aria-label') ?? '';
}

async function openPicker() {
  const user = userEvent.setup();
  render(<DatePicker defaultValue={new Date(2026, 7, 19)} aria-label="Start date" />);
  await user.click(screen.getByRole('button', { name: /start date|august/i }));
  return user;
}

describe('DatePicker — month navigation', () => {
  it('advances to the next month when the next arrow is clicked', async () => {
    const user = await openPicker();

    expect(currentCaption()).toMatch(/August 2026/i);

    const nav = screen.getByRole('button', { name: /next month/i });
    await user.click(nav);

    // The assertion that fails on the original bug: the grid must now BE
    // September. Under the remount bug this snapped straight back to August.
    expect(currentCaption()).toMatch(/September 2026/i);
  });

  it('goes back a month, and keeps going — repeated clicks accumulate', async () => {
    const user = await openPicker();

    const prev = screen.getByRole('button', { name: /previous month/i });
    await user.click(prev);
    expect(currentCaption()).toMatch(/July 2026/i);

    // Two clicks in a row is the case the remount bug hid best: the first
    // click's month was discarded, so the second one started over from August
    // and the view never travelled.
    await user.click(prev);
    expect(currentCaption()).toMatch(/June 2026/i);
  });

  it('keeps the nav button focused across a click, so keyboard travel works', async () => {
    const user = await openPicker();

    const nav = screen.getByRole('button', { name: /next month/i });
    nav.focus();
    await user.click(nav);

    // The remount destroyed the focused button on every click, so a keyboard
    // user had to re-find the arrow each time. Same root cause, separate
    // symptom — pinned separately so a partial regression can't hide.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /next month/i }),
    );
  });

  it('still selects a day from a month the user navigated TO', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: /next month/i }));

    const grid = screen.getByRole('grid');
    // The day button's own accessible name, in full — a looser pattern matches
    // every cell whose number contains a 4.
    const day = within(grid).getByRole('button', { name: 'Friday, September 4th, 2026' });
    await user.click(day);

    // Navigating and then picking is the whole point of the arrows; asserting
    // only the caption would let a "month changes but days don't" regression
    // through. Picking a single date also closes the popover, so the trigger's
    // VISIBLE label is what carries the result — its accessible name stays the
    // supplied `aria-label` ("Start date"), so match on text, not role name.
    const trigger = document.querySelector('[data-slot="date-picker-trigger"]');
    expect(trigger?.textContent).toContain('September 4th, 2026');
  });
});
