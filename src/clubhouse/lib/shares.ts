/**
 * Whole-number percentages for a set of shares shown together, by largest remainder, so they add to exactly 100
 * (coach audit 13 Nov: Left 20 + Fairway 60 + Right 19, first putts 102%). `values` are counts or percentages; each is
 * taken as its part of their sum. A tie on the remainder goes to the earlier value. An all-zero set stays all zero.
 */
export function roundShares(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(total > 0)) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / total) * 100);
  const out = exact.map(Math.floor);
  let spare = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (spare <= 0) break;
    out[i]! += 1;
    spare -= 1;
  }
  return out;
}

/**
 * Whole-number percentages for some parts of a whole (`total`), rounded together with the rest of the whole that is not
 * shown, so parts plus rest add to 100 (drives left, fairway and right, with the misses that had no side logged).
 */
export function roundSplit(parts: readonly number[], total: number): number[] {
  const rest = Math.max(0, total - parts.reduce((a, b) => a + Math.max(0, b), 0));
  return roundShares([...parts, rest]).slice(0, parts.length);
}
