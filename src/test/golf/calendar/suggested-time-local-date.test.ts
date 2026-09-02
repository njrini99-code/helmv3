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
 *
 * TEST-BUG HISTORY (2026-09-02): the third block below used to claim a single
 * hardcoded instant (2026-09-01T02:36:00.000Z) diverges from its UTC slice in
 * ANY zone with a non-zero offset. That is false — divergence depends on the
 * offset AND the time-of-day together, not the offset alone. At UTC+14
 * (Pacific/Kiritimati, the shifted-timezone CI job's east-of-Greenwich case)
 * 02:36Z is only 16:36 local — nowhere near a day boundary — so the two agree
 * and the old assertion failed on that CI shard. `localDayIso` itself was
 * never wrong: `src/lib/golf/__tests__/local-day.test.ts` already pins the
 * UTC+14 case correctly with an instant that actually crosses the boundary.
 * The block below is now a parametrized, per-zone table with `vi.setSystemTime`
 * pinning each instant explicitly, so no case depends on being run in the
 * "right" zone — a failure now points at the exact zone/instant pair.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localDayIso } from '@/lib/golf/local-day';

/** The old derivation, kept only so the difference is visible in the failure. */
const utcDay = (d: Date) => d.toISOString().split('T')[0];

const ORIGINAL_TZ = process.env.TZ;

describe('suggested-time date derivation', () => {
  afterEach(() => {
    vi.useRealTimers();
    // `process.env.TZ = undefined` coerces to the STRING "undefined" in Node,
    // which is not a valid zone — Node then falls back to UTC silently for
    // every later file in this worker. Delete the key instead when there was
    // no TZ to restore.
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it('agrees with the local clock for a late-evening instant', () => {
    process.env.TZ = 'America/New_York';
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
    process.env.TZ = 'America/New_York';
    for (let h = 0; h < 24; h++) {
      const d = new Date(2026, 8, 1, h, 30, 0);
      expect(localDayIso(d)).toBe(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
  });

  describe('documents when the OLD UTC derivation diverges from the local day — and when it does not', () => {
    interface Case {
      zone: string;
      /** UTC instant, pinned via vi.setSystemTime so `new Date()` reads exactly this. */
      instant: string;
      expectedLocal: string;
      expectedUtc: string;
      note: string;
    }

    // Every value below was computed directly (see the commit that added this
    // table) rather than asserted from the code under test, so a case that
    // regresses fails against a fixed expectation, not a moving target.
    const CASES: Case[] = [
      {
        zone: 'UTC',
        instant: '2026-09-01T23:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: '1hr before UTC midnight — zero offset never diverges',
      },
      {
        zone: 'UTC',
        instant: '2026-09-01T00:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: '1hr after UTC midnight — zero offset never diverges',
      },
      {
        zone: 'Pacific/Kiritimati',
        instant: '2026-09-01T23:30:00.000Z',
        expectedLocal: '2026-09-02',
        expectedUtc: '2026-09-01',
        note: '1hr before UTC midnight at +14 — local has already rolled to the next day',
      },
      {
        zone: 'Pacific/Kiritimati',
        instant: '2026-09-01T00:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: '1hr after UTC midnight at +14 — local is mid-afternoon, nowhere near the boundary',
      },
      {
        zone: 'Pacific/Kiritimati',
        instant: '2026-09-01T09:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: '1hr before LOCAL midnight at +14 — has not rolled over yet',
      },
      {
        zone: 'Pacific/Kiritimati',
        instant: '2026-08-31T10:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-08-31',
        note: '1hr after LOCAL midnight at +14 — local rolled over, UTC has not',
      },
      {
        zone: 'Pacific/Kiritimati',
        instant: '2026-09-01T02:36:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: 'THE ORIGINAL BUG INSTANT AT +14: does NOT diverge — this is exactly what made ' +
          'the old blanket "any non-zero offset diverges" assertion false on the ' +
          'Kiritimati CI shard (16:36 local, nowhere near a day boundary)',
      },
      {
        zone: 'Pacific/Midway',
        instant: '2026-09-01T23:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: '1hr before UTC midnight at -11 — local has already caught up to this UTC day',
      },
      {
        zone: 'Pacific/Midway',
        instant: '2026-09-01T00:30:00.000Z',
        expectedLocal: '2026-08-31',
        expectedUtc: '2026-09-01',
        note: '1hr after UTC midnight at -11 — local has not rolled over yet',
      },
      {
        zone: 'Pacific/Midway',
        instant: '2026-09-01T10:30:00.000Z',
        expectedLocal: '2026-08-31',
        expectedUtc: '2026-09-01',
        note: '1hr before LOCAL midnight at -11',
      },
      {
        zone: 'Pacific/Midway',
        instant: '2026-09-01T11:30:00.000Z',
        expectedLocal: '2026-09-01',
        expectedUtc: '2026-09-01',
        note: '1hr after LOCAL midnight at -11 — local has rolled to match UTC',
      },
      {
        zone: 'Pacific/Midway',
        instant: '2026-09-01T02:36:00.000Z',
        expectedLocal: '2026-08-31',
        expectedUtc: '2026-09-01',
        note: 'THE ORIGINAL BUG INSTANT AT -11: diverges (15:36 the previous afternoon, Midway time)',
      },
      {
        zone: 'America/New_York',
        instant: '2026-09-01T02:36:00.000Z',
        expectedLocal: '2026-08-31',
        expectedUtc: '2026-09-01',
        note: 'THE ORIGINAL BUG INSTANT AT -4 (EDT): diverges — this is the Guilford-coach case, ' +
          '22:36 the previous evening in ET',
      },
      {
        zone: 'America/New_York',
        instant: '2026-11-01T05:30:00.000Z',
        expectedLocal: '2026-11-01',
        expectedUtc: '2026-11-01',
        note: 'just before the 2026 fall-back DST transition (still EDT, -4)',
      },
      {
        zone: 'America/New_York',
        instant: '2026-11-01T07:30:00.000Z',
        expectedLocal: '2026-11-01',
        expectedUtc: '2026-11-01',
        note: 'just after the 2026 fall-back DST transition (now EST, -5) — the offset ' +
          'changed but the calendar day did not',
      },
      {
        zone: 'America/New_York',
        instant: '2026-03-08T06:30:00.000Z',
        expectedLocal: '2026-03-08',
        expectedUtc: '2026-03-08',
        note: 'just before the 2026 spring-forward DST transition (still EST, -5)',
      },
      {
        zone: 'America/New_York',
        instant: '2026-03-08T08:30:00.000Z',
        expectedLocal: '2026-03-08',
        expectedUtc: '2026-03-08',
        note: 'just after the 2026 spring-forward DST transition (now EDT, -4)',
      },
    ];

    beforeEach(() => {
      vi.useFakeTimers();
    });

    for (const c of CASES) {
      it(`${c.zone} @ ${c.instant} — ${c.note}`, () => {
        process.env.TZ = c.zone;
        vi.setSystemTime(new Date(c.instant));

        // No explicit argument: this exercises the same `new Date()` default
        // every other localDayIso() call site relies on.
        const local = localDayIso();
        const utc = utcDay(new Date());

        expect(local).toBe(c.expectedLocal);
        expect(utc).toBe(c.expectedUtc);
        expect(local === utc).toBe(c.expectedLocal === c.expectedUtc);
      });
    }
  });
});
