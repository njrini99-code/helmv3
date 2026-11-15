const NBSP = '\u00a0';
/** The longest fact kept on one line: a day ("Thu, Nov 5"), a time range ("10:00 to 11:30 AM"), a short place. At the largest Text Size that is
 *  still narrower than the narrowest phone's line, so nothing can run off it. */
const WHOLE = 20;

/**
 * "Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Club" for a line that may wrap. Each separator keeps to the words before it, as the page heads'
 * do, so a line never starts with the dot; and a short fact stays whole, so a line never ends "2:00 to 5:00" with "PM" under it, or "Lakeside"
 * with "Golf Club" under it. A longer fact (a long place, a drill's name) may still wrap inside, keeping only a clock with its AM or PM.
 */
export function wholeFacts(line: string): string {
  return line
    .split(' · ')
    .map((fact) => (fact.length <= WHOLE ? fact.replace(/ /g, NBSP) : fact.replace(/(\d) ([AP]M)\b/g, `$1${NBSP}$2`)))
    .join(`${NBSP}· `);
}
