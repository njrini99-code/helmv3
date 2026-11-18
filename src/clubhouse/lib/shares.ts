/**
 * Whole percents that add up to exactly 100, for shares that sit together (a split bar's labels, a table's share column,
 * a grid of sectors). Rounding each share on its own can print 99% or 102%. Largest remainder: each exact share is
 * floored, and the points left over go to the shares with the largest remainders. A tie goes to the larger share, then
 * to the earlier one. No share moves a whole point or more from its exact value.
 *
 * `weights` can be counts or percents: each is read as its part of their sum, and a negative one as 0. With nothing to
 * share (an empty list, or every weight 0), every share is 0.
 *
 * Pure: the screens and loaders both import it.
 */
export function wholePercents(weights: readonly number[]): number[] {
  const parts = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = parts.reduce((a, w) => a + w, 0);
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((w) => (w / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e), e })).sort((a, b) => b.r - a.r || b.e - a.e || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}
