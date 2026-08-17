/**
 * `src/lib/utils/date-only.ts` had NO direct test — no test file imported it —
 * while eight modules consume it, including the baseball task surfaces that
 * decide whether a task is overdue.
 *
 * IT IS NOT THE SAME MODULE AS `@/lib/golf/date-only`, AND THE DIFFERENCE IS
 * THE WHOLE POINT.
 *
 *   @/lib/golf/date-only   — pins UTC. Its job is a calendar day that reads
 *                            identically in every zone (round dates, schedules).
 *   @/lib/utils/date-only  — pins LOCAL midnight. Its job is a Date you can
 *                            compare against `new Date()` in the viewer's zone.
 *
 * Both export a `parseDateOnly`. Importing the wrong one is silent — the types
 * differ (parts object vs Date) in one direction and not the other, and the
 * behaviour only diverges at a zone boundary.
 *
 * The subtler trap, and the reason this file exists: `anchorDateOnly` only
 * touches a BARE `YYYY-MM-DD`. A full timestamp passes through UNCHANGED, so
 * `parseDateOnly` returns local midnight for one input shape and an exact
 * instant for the other. I misread that three cycles ago — read the baseball
 * overdue check as "local midnight < now", concluded a task due today was
 * flagged all day, and wrote a regression on the strength of it. The column is
 * `timestamptz`, every value carries a real time, and the comparison was
 * always instant-vs-instant. `Pacific/Midway` caught it; the schema explained it.
 *
 * Expectations below are written to hold in ANY zone — local getters for the
 * local-anchored path, exact epoch equality for the pass-through path — so the
 * suite is meaningful under TZ=UTC, Pacific/Kiritimati and Pacific/Midway
 * rather than merely passing in one of them.
 */
import { describe, it, expect } from 'vitest';
import { isDateOnlyString, anchorDateOnly, parseDateOnly } from '@/lib/utils/date-only';

describe('isDateOnlyString', () => {
  it('accepts exactly YYYY-MM-DD', () => {
    expect(isDateOnlyString('2026-08-02')).toBe(true);
  });

  it('rejects anything carrying a time, an offset, or the wrong shape', () => {
    for (const v of [
      '2026-08-02T00:00:00',
      '2026-08-02T09:00:00Z',
      '2026-8-2',
      '26-08-02',
      '2026-08-02 ',
      'not-a-date',
      '',
      null,
      undefined,
      20260802,
      new Date(),
    ]) {
      expect(isDateOnlyString(v), JSON.stringify(v)).toBe(false);
    }
  });
});

describe('anchorDateOnly', () => {
  it('appends a LOCAL midnight time to a bare date', () => {
    // No trailing Z — that is what makes it local rather than UTC.
    expect(anchorDateOnly('2026-08-02')).toBe('2026-08-02T00:00:00');
  });

  it('passes ANYTHING ELSE through untouched', () => {
    // The trap. A full timestamp is not anchored, so the caller gets an instant
    // back, not a local midnight.
    expect(anchorDateOnly('2026-08-02T09:00:00Z')).toBe('2026-08-02T09:00:00Z');
    const d = new Date('2026-08-02T09:00:00Z');
    expect(anchorDateOnly(d)).toBe(d);
    expect(anchorDateOnly(1_754_000_000_000)).toBe(1_754_000_000_000);
  });
});

describe('parseDateOnly — a bare date becomes LOCAL midnight', () => {
  it('lands on the same calendar day in every zone', () => {
    // Local getters, so this holds under UTC, +14 and -11 alike. Using UTC
    // getters here instead would make the test zone-dependent and useless.
    const d = parseDateOnly('2026-08-02');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-indexed: 7 is August
    expect(d.getDate()).toBe(2);
  });

  it('lands at midnight, not some other hour', () => {
    const d = parseDateOnly('2026-08-02');
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('does NOT shift the day the way `new Date(bare)` does west of UTC', () => {
    // `new Date('2026-08-02')` is UTC midnight, which reads as Aug 1 in the
    // Americas. That is the bug this module exists to avoid.
    expect(parseDateOnly('2026-08-02').getDate()).toBe(2);
  });
});

describe('parseDateOnly — a timestamp keeps its exact instant', () => {
  it('preserves the epoch value rather than flattening to midnight', () => {
    // The half I got wrong. This is why the baseball overdue comparison was
    // already correct: its column is timestamptz.
    const iso = '2026-08-02T09:00:00.000Z';
    expect(parseDateOnly(iso).getTime()).toBe(Date.parse(iso));
  });

  it('round-trips a Date unchanged', () => {
    const d = new Date('2026-08-02T09:00:00.000Z');
    expect(parseDateOnly(d).getTime()).toBe(d.getTime());
  });

  it('accepts an epoch number', () => {
    expect(parseDateOnly(1_754_000_000_000).getTime()).toBe(1_754_000_000_000);
  });
});

describe('parseDateOnly — degenerate input', () => {
  it('returns an Invalid Date rather than throwing', () => {
    // Callers render inside components; a throw here would blank a page.
    expect(Number.isNaN(parseDateOnly('not-a-date').getTime())).toBe(true);
    expect(Number.isNaN(parseDateOnly('').getTime())).toBe(true);
  });
});
