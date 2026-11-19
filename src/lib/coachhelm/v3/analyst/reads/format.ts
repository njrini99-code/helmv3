/**
 * CoachHelm reads: how a number is written, once. Pure.
 *
 * `Figures` records every formatted value a sentence uses, by name, so the payload carries the exact strings the
 * words were built from. Nothing in the words is formatted anywhere else.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** One decimal, never "-0.0". */
export function oneDecimal(n: number): string {
  const v = Math.round(n * 10) / 10;
  return (Object.is(v, -0) ? 0 : v).toFixed(1);
}

/** A whole number. */
export function whole(n: number): string {
  const v = Math.round(n);
  return String(Object.is(v, -0) ? 0 : v);
}

/** "13 Oct" from YYYY-MM-DD (a calendar day; no zone arithmetic). */
export function dayText(ymd: string): string {
  const [, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** "74 (+2)", "70 (-2)", "72 (even)". */
export function scoreText(total: number | null, toPar: number | null): string | null {
  if (total == null) return null;
  if (toPar == null) return String(total);
  return `${total} (${toPar === 0 ? 'even' : toPar > 0 ? `+${toPar}` : String(toPar)})`;
}

/** Every number written into a card, by name. `put` returns the string so a sentence is built from it. */
export class Figures {
  readonly all: Record<string, string> = {};
  put(name: string, value: string): string {
    this.all[name] = value;
    return value;
  }
}

/** The numbers in a piece of text ("1.4", "31", "13"), for the check that each one is a payload figure. */
export function numbersIn(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}
