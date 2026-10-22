import type { ChClock } from './clock-cookie';

/**
 * Times as the device's clock preference writes them (Settings › Time format). Pure: nothing here reads the clock, the
 * cookie or the browser; `use-clock.tsx` supplies the preference and these draw with it.
 *
 * Every time Clubhouse stores or computes is 24-hour in the team's zone. Two kinds of text reach the screen:
 *
 * - a time the client holds as minutes or decimal hours (the calendar, a time field): `clockFromMinutes`;
 * - a label the server has already written in 12 hours ("3:30 PM", "Thu 16 · 7:30 PM", "3:00–4:15 PM"): `restyleClock`
 *   rewrites the clock times in it and leaves every other word alone.
 *
 * 12-hour is the default and what every label already says, so `restyleClock(text, '12')` returns `text` untouched.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "3:30 PM" or "15:30" for minutes after midnight. `meridiem: false` drops the AM or PM in 12 hours ("3:30", for a place
 * where the half is said next to it); a 24-hour time has none to drop. A value of 24:00 or more reads as the next day's
 * hour ("00:00"), which is how an end at midnight reads in 24 hours.
 */
export function clockFromMinutes(minutes: number, clock: ChClock, meridiem = true): string {
  const t = Math.round(minutes);
  const h = Math.floor(t / 60);
  const m = t - h * 60;
  if (clock === '24') return `${pad(h % 24)}:${pad(m)}`;
  return `${((h + 11) % 12) + 1}:${pad(m)}${meridiem ? (h < 12 ? ' AM' : ' PM') : ''}`;
}

/** The same for decimal hours (the calendar's own unit): 15.5 is "3:30 PM" or "15:30". */
export function clockFromHour(hour: number, clock: ChClock, meridiem = true): string {
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  return clockFromMinutes(hh * 60 + mm, clock, meridiem);
}

/** The half of the day a decimal hour is in, as the calendar draws it beside a bare time: " AM" or " PM". Empty in 24 hours. */
export function meridiemOfHour(hour: number, clock: ChClock): string {
  return clock === '24' ? '' : hour < 12 ? ' AM' : ' PM';
}

/** An hour on a time grid's edge: "7 AM", "12 PM", or "07:00". */
export function clockHourLabel(hour: number, clock: ChClock): string {
  if (clock === '24') return `${pad(hour % 24)}:00`;
  return `${((hour + 11) % 12) + 1} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** An hour on a small axis, where room is tight: "7a", "12p", or "07". */
export function clockAxisLabel(hour: number, clock: ChClock): string {
  if (clock === '24') return pad(hour % 24);
  return `${((hour + 11) % 12) + 1}${hour < 12 ? 'a' : 'p'}`;
}

function to24(hour: number, half: string): number {
  return (hour % 12) + (half.toLowerCase().startsWith('p') ? 12 : 0);
}

/**
 * A clock time in text: `h:mm` with an optional AM or PM, or an hour with one ("7 AM"). Any space, including Intl's U+202F,
 * may sit before the half. The character before it is captured (no lookbehind: the iOS 15 web view refuses one at parse
 * time) so a digit, colon or dot in front means it is part of a longer number, not a time.
 */
const CLOCK = /(^|[^\d:.])(?:(\d{1,2}):(\d{2})(?![\d:])(?:\s?([AaPp])[Mm](?![A-Za-z]))?|(\d{1,2})\s?([AaPp])[Mm](?![A-Za-z]))/g;

/**
 * What may sit between the two ends of a range, then the end's own hour and half: "9:00–10:15 AM" gives the start its half
 * from the end. The hour is kept to tell a start that crosses noon or midnight from one in the same half.
 */
const RANGE_END = /^\s*(?:–|—|-|to)\s*(\d{1,2}):\d{2}\s?([AaPp])[Mm]\b/;

/**
 * The half a range's start takes when it names none: its end's, unless the start's hour is later on the clock face than the
 * end's (12 counts as 0), which puts it in the half before ("11:30–12:45 PM" starts in the AM, "11:30–12:45 AM" in the PM).
 */
function rangeStartHalf(startHour: number, after: string): string | undefined {
  const end = RANGE_END.exec(after);
  if (!end) return undefined;
  const endHalf = end[2]!;
  if (startHour % 12 <= Number(end[1]) % 12) return endHalf;
  return endHalf.toLowerCase() === 'p' ? 'a' : 'p';
}

/**
 * Rewrites the clock times in a server-written 12-hour label to 24 hours:
 *
 *   "3:30 PM"                         "15:30"
 *   "Thu 16 · 7:30 PM · Carolina Inn" "Thu 16 · 19:30 · Carolina Inn"
 *   "3:00–4:15 PM"                    "15:00–16:15"   (the start has no half of its own; the end's is its)
 *   "11:30 AM–12:45 PM"               "11:30–12:45"
 *   "Between 7 AM and 8 PM"           "Between 07:00 and 20:00"
 *   "12:00 AM", "12:30 PM"            "00:00", "12:30"
 *
 * A `h:mm` with no half and no range end after it is not a clock time here (a ratio, a score, a duration) and is left
 * alone. In 12 hours the text comes back as it is.
 */
export function restyleClock(text: string, clock: ChClock): string {
  if (clock === '12' || !text) return text;
  return text.replace(CLOCK, (whole, pre: string, h1: string | undefined, m1: string | undefined, half1: string | undefined, h2: string | undefined, half2: string | undefined, offset: number) => {
    if (h2 !== undefined) {
      const h = Number(h2);
      return h >= 1 && h <= 12 ? `${pre}${pad(to24(h, half2!))}:00` : whole;
    }
    const h = Number(h1);
    const m = Number(m1);
    if (m > 59) return whole;
    const half = half1 ?? rangeStartHalf(h, text.slice(offset + whole.length));
    if (!half) return whole;
    return h >= 1 && h <= 12 ? `${pre}${pad(to24(h, half))}:${pad(m)}` : whole;
  });
}
