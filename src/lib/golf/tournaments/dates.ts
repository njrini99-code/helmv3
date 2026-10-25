/**
 * P-5: a tournament's days in words, on calendar dates (YYYY-MM-DD, no zone). One implementation for the calendar
 * editor's receipt and lock line and for the invitation copy the server action writes.
 */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const dow = (d: string) => DOW[at(d).getUTCDay()]!;
const mon = (d: string) => MON[at(d).getUTCMonth()]!;
const dnum = (d: string) => at(d).getUTCDate();

/** "Thu 5 Nov". */
export const shortDay = (d: string) => `${dow(d)} ${dnum(d)} ${mon(d)}`;

/** "Thu 5 to Sat 7 Nov", "Sat 31 Oct to Mon 2 Nov", or one day "Thu 5 Nov". */
export function rangeText(first: string, last: string): string {
  if (first === last) return shortDay(first);
  return mon(first) === mon(last) ? `${dow(first)} ${dnum(first)} to ${shortDay(last)}` : `${shortDay(first)} to ${shortDay(last)}`;
}
