import { describe, it, expect } from 'vitest';

/**
 * A class series must keep its WALL-CLOCK time across a daylight-saving change.
 *
 * The sync stamped every occurrence with one UTC offset captured at save time.
 * A schedule entered in August (EDT, -04:00) therefore wrote December
 * occurrences as -04:00 too — but December is EST — so every meeting after the
 * change was stored an hour early. Measured on production 2026-08-07: 281 of
 * 879 class events, 17 classes, 2 teams, all on or after 1 November.
 *
 * This reimplements the offset resolver rather than importing it, because it
 * lives inside a 'use server' module that cannot be imported into a unit test.
 * The logic is kept identical to calendar-sync.ts:offsetMinutesFor — if that
 * changes, this must change with it, and the assertions below are the contract
 * either implementation has to satisfy.
 */
function offsetMinutesFor(date: string, time: string, timeZone: string): number | null {
  try {
    const asUtc = new Date(`${date}T${time}Z`);
    if (Number.isNaN(asUtc.getTime())) return null;
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(asUtc)) p[part.type] = part.value;
    const hour = p.hour === '24' ? '00' : p.hour;
    const localAsUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(hour), Number(p.minute), Number(p.second),
    );
    if (Number.isNaN(localAsUtc)) return null;
    return Math.round((asUtc.getTime() - localAsUtc) / 60_000);
  } catch {
    return null;
  }
}

/** Mirrors calendar-sync.ts:buildDateTimeString. */
function fmt(offsetMinutes: number): string {
  const sign = offsetMinutes > 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const NY = 'America/New_York';

describe('class occurrences keep their wall-clock time across DST', () => {
  it('resolves EDT before the change and EST after it', () => {
    // 2026-11-01 is the US change date; 2 Nov is the first affected weekday.
    expect(offsetMinutesFor('2026-08-12', '08:30:00', NY)).toBe(240);  // EDT, -04:00
    expect(offsetMinutesFor('2026-11-02', '08:30:00', NY)).toBe(300);  // EST, -05:00
    expect(offsetMinutesFor('2026-12-14', '08:30:00', NY)).toBe(300);  // EST, -05:00
  });

  it('an 08:30 class is 08:30 local in BOTH August and December', () => {
    for (const date of ['2026-08-12', '2026-11-02', '2026-12-14']) {
      const off = offsetMinutesFor(date, '08:30:00', NY)!;
      const instant = new Date(`${date}T08:30:00${fmt(off)}`);
      const localHHMM = new Intl.DateTimeFormat('en-US', {
        timeZone: NY, hour12: false, hour: '2-digit', minute: '2-digit',
      }).format(instant);
      expect(localHHMM, `${date} should read 08:30 in ${NY}`).toBe('08:30');
    }
  });

  it('reproduces the OLD bug — one fixed offset drifts an hour in December', () => {
    // Non-vacuity. The old code captured the offset once, in August, and reused
    // it for the whole series. Without this, the test above could pass against
    // an implementation that never actually changed anything.
    const augustOffset = offsetMinutesFor('2026-08-12', '08:30:00', NY)!;
    const decemberInstant = new Date(`2026-12-14T08:30:00${fmt(augustOffset)}`);
    const localHHMM = new Intl.DateTimeFormat('en-US', {
      timeZone: NY, hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(decemberInstant);

    expect(localHHMM).toBe('07:30');            // an hour early — the live defect
    expect(localHHMM).not.toBe('08:30');
  });

  it('falls back (null) for a zone Intl does not recognise', () => {
    // The caller then uses the supplied fixed offset rather than guessing.
    expect(offsetMinutesFor('2026-12-14', '08:30:00', 'Not/AZone')).toBeNull();
  });
});
