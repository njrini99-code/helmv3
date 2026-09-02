/**
 * Accepting a schedule-conflict suggestion must not move the event a day.
 *
 * `selectSuggestedTime` derived the DATE from `toISOString()` (UTC) and the
 * TIME from `toTimeString()` (local) off the same instant. West of Greenwich
 * those disagree for the last hours of every local day: at 22:36 EDT the date
 * read tomorrow while the time read 22:36 tonight.
 *
 * That is the same shape localDayIso() exists to replace, and the same window
 * in which the Guilford coach hit two calendar failures on 2026-09-01 (02:36Z
 * and 02:39Z — 22:36 and 22:39 his time on 31 August).
 *
 * This pins the rule the fix relies on: for one instant, the date and the time
 * handed to the form must describe the SAME wall clock.
 */
import { describe, it, expect } from 'vitest';
import { localDayIso } from '@/lib/golf/local-day';

/** The old derivation, kept only so the difference is visible in the failure. */
const utcDay = (d: Date) => d.toISOString().split('T')[0];

describe('suggested-time date derivation', () => {
  it('agrees with the local clock for a late-evening instant', () => {
    // 2026-08-31 22:36 in a UTC-4 zone === 2026-09-01 02:36Z.
    const instant = new Date('2026-09-01T02:36:00.000Z');
    const localTime = instant.toTimeString().slice(0, 5);
    const localDate = localDayIso(instant);

    // The invariant: the date and the time describe one wall clock. Rebuilding
    // the instant from the pair must land back on the same moment.
    const rebuilt = new Date(`${localDate}T${localTime}:00`);
    expect(rebuilt.getFullYear()).toBe(instant.getFullYear());
    expect(rebuilt.getMonth()).toBe(instant.getMonth());
    expect(rebuilt.getDate()).toBe(instant.getDate());
    expect(rebuilt.getHours()).toBe(instant.getHours());
    expect(rebuilt.getMinutes()).toBe(instant.getMinutes());
  });

  it('is stable across a full day of instants', () => {
    for (let h = 0; h < 24; h++) {
      const d = new Date(2026, 8, 1, h, 30, 0);
      expect(localDayIso(d)).toBe(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
  });

  it('documents when the OLD UTC derivation diverged, so the regression is legible', () => {
    // Only meaningful in a zone with a non-zero offset; in UTC the two agree
    // and this asserts nothing, which is honest rather than a false green.
    const instant = new Date('2026-09-01T02:36:00.000Z');
    if (instant.getTimezoneOffset() !== 0) {
      expect(utcDay(instant)).not.toBe(localDayIso(instant));
    } else {
      expect(utcDay(instant)).toBe(localDayIso(instant));
    }
  });
});
