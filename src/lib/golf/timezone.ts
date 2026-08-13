/**
 * Wall-clock ↔ instant conversion for a named IANA zone.
 *
 * Extracted from `src/app/golf/actions/calendar-sync.ts`, which is a
 * `'use server'` module — exporting a non-async helper from one registers it as
 * a server action (the class of bug that killed golf messaging). Zone maths is
 * pure, so it belongs here, and now BOTH the calendar sync and the availability
 * layer share one implementation instead of the availability layer having none.
 */

/**
 * The UTC offset, in minutes west of UTC (the `getTimezoneOffset()` sign
 * convention), that `timeZone` was actually at on a given local date + time.
 *
 * Evaluated PER OCCURRENCE rather than once at save time, which is what makes a
 * semester-long series survive a daylight-saving change. Returns null for an
 * unknown zone so the caller can fall back rather than silently guess.
 */
export function offsetMinutesFor(date: string, time: string, timeZone: string): number | null {
  try {
    // Interpret the wall-clock reading as if it were UTC, then ask what that
    // instant looks like in the target zone. The difference between the two is
    // the zone's offset near that date — correct on both sides of a DST change.
    const asUtc = new Date(`${date}T${time}Z`);
    if (Number.isNaN(asUtc.getTime())) return null;

    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(asUtc)) p[part.type] = part.value;
    // Intl renders midnight as hour 24 in some locales/zones.
    const hour = p.hour === '24' ? '00' : p.hour;

    const localAsUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(hour), Number(p.minute), Number(p.second),
    );
    if (Number.isNaN(localAsUtc)) return null;

    // Positive west of UTC, matching Date.getTimezoneOffset().
    return Math.round((asUtc.getTime() - localAsUtc) / 60_000);
  } catch {
    // Invalid IANA name — the caller falls back.
    return null;
  }
}

/** Local calendar date of a Date, in the RUNTIME's zone. Used only to name the
 *  day being expanded, never to decide an instant. */
function runtimeDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The instant at which `HH:MM[:SS]` occurs on `day`, read as WALL-CLOCK TIME IN
 * `timeZone`.
 *
 * Why this exists: the obvious `new Date(day); d.setHours(h, m)` resolves in the
 * RUNTIME's zone. On Vercel that is UTC, so a player's 09:05 class became a busy
 * block at 09:05 UTC — 05:05 in America/New_York, four hours early — and the
 * "find a time" slot generator therefore reported the real class hour as free
 * and let a coach schedule practice straight over it.
 *
 * `timeZone` null/unknown falls back to the runtime zone, which is the previous
 * behaviour: wrong on a server, right in a browser or a test.
 */
export function wallClockInZone(day: Date, time: string, timeZone: string | null | undefined): Date {
  const [rawH, rawM] = time.split(':');
  const hours = Number(rawH ?? 0);
  const minutes = Number(rawM ?? 0);

  if (timeZone) {
    const dateKey = runtimeDateKey(day);
    const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const offset = offsetMinutesFor(dateKey, hhmm, timeZone);
    if (offset !== null) {
      // `${dateKey}T${hhmm}Z` is the wall clock read as UTC; adding the offset
      // west of UTC converts it to the real instant.
      const asUtc = new Date(`${dateKey}T${hhmm}Z`).getTime();
      return new Date(asUtc + offset * 60_000);
    }
  }

  const result = new Date(day);
  result.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return result;
}
