/**
 * One plural rule (CONS-14), English's own: "1 round", "0 rounds", "2 rounds". `plural` gives the count and the word;
 * `pluralWord` the word alone, for a sentence that sets the number itself.
 */
const RULES = new Intl.PluralRules('en-US');
const GROUPED = new Intl.NumberFormat('en-US');

export function pluralWord(n: number, one: string, other = `${one}s`): string {
  return RULES.select(n) === 'one' ? one : other;
}

export function plural(n: number, one: string, other = `${one}s`): string {
  // Thousands are grouped like every other count in Clubhouse ("1,801 putts", L-043).
  return `${Math.abs(n) >= 1000 ? GROUPED.format(n) : n} ${pluralWord(n, one, other)}`;
}
