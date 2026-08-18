import { describe, it, expect, afterAll } from 'vitest';
import { localDayIso } from '../local-day';

/**
 * A date input pre-filled with "today" must show the day the USER is having,
 * not the day UTC is having.
 *
 * `/golf/dashboard/rounds/new` sets its round-date default on mount precisely
 * so it can read the client's zone — and then called
 * `new Date().toISOString().split('T')[0]`, which renders that instant in UTC
 * and slices UTC's calendar day back out. The deferral to the client bought
 * nothing.
 *
 * Each case below is a real instant paired with the wall-clock day a user in
 * that zone is actually living. `utcSlice` is what the app shipped; `expected`
 * is what the user should see.
 */

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** The expression the app shipped, kept verbatim so the gap stays visible. */
function shippedUtcSlice(now: Date): string {
  return now.toISOString().split('T')[0]!;
}

interface Case {
  zone: string;
  instant: string;
  /** The calendar day on the wall in `zone` at `instant`. */
  expected: string;
  /** What the UTC slice produces there — 'same' when the two agree. */
  utcSlice: string;
  note: string;
}

const CASES: Case[] = [
  {
    zone: 'UTC',
    instant: '2026-08-19T00:30:00.000Z',
    expected: '2026-08-19',
    utcSlice: '2026-08-19',
    note: 'on the server zone the two agree, which is why this shipped',
  },
  {
    zone: 'America/New_York',
    instant: '2026-08-19T00:30:00.000Z',
    expected: '2026-08-18',
    utcSlice: '2026-08-19',
    note: '20:30 EDT — a player logging an evening round is offered TOMORROW',
  },
  {
    zone: 'Pacific/Midway',
    instant: '2026-08-19T00:30:00.000Z',
    expected: '2026-08-18',
    utcSlice: '2026-08-19',
    note: '13:30 on Midway (-11) — wrong from early afternoon onward',
  },
  {
    zone: 'Pacific/Kiritimati',
    instant: '2026-08-18T12:00:00.000Z',
    expected: '2026-08-19',
    utcSlice: '2026-08-18',
    note: '02:00 on Kiritimati (+14) — east of UTC it inverts to YESTERDAY',
  },
];

describe('localDayIso — the day on the user’s wall, not UTC’s', () => {
  for (const c of CASES) {
    it(`${c.zone}: ${c.note}`, () => {
      process.env.TZ = c.zone;
      const now = new Date(c.instant);

      expect(
        localDayIso(now),
        `${c.zone} at ${c.instant} should read ${c.expected}`,
      ).toBe(c.expected);
    });
  }

  it('disagrees with the shipped UTC slice exactly where the user is misled', () => {
    for (const c of CASES) {
      process.env.TZ = c.zone;
      const now = new Date(c.instant);
      expect(shippedUtcSlice(now), `${c.zone} utc slice`).toBe(c.utcSlice);
      if (c.utcSlice !== c.expected) {
        expect(
          localDayIso(now),
          `${c.zone}: the fix must not reproduce the UTC slice`,
        ).not.toBe(shippedUtcSlice(now));
      }
    }
  });

  it('pads single-digit months and days so the string is sortable', () => {
    process.env.TZ = 'UTC';
    expect(localDayIso(new Date('2026-01-05T12:00:00.000Z'))).toBe('2026-01-05');
  });

  it('is stable across a full day of hourly instants in a western zone', () => {
    process.env.TZ = 'America/New_York';
    // 2026-08-18 local runs from 04:00Z that day to 04:00Z the next.
    for (let h = 4; h < 28; h++) {
      const now = new Date(Date.UTC(2026, 7, 18, h, 0, 0));
      expect(localDayIso(now), `hour ${h}Z`).toBe('2026-08-18');
    }
  });
});
