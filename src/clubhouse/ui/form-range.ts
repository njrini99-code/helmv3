// Plain (not a client module), so a server component's header can say the range its client form lines share.

/**
 * The shared range's ends in words, for the column header over the lines (row 102): the lowest and highest score the drawn
 * lines hold ("70 to 84"); null when no line draws. `earlyBelow` matches the FormRange's.
 */
export function formRangeWords(trends: Array<readonly number[] | null | undefined>, earlyBelow = 2): string | null {
  const all = trends.filter((t) => (t?.length ?? 0) >= earlyBelow).flatMap((t) => t ?? []);
  if (!all.length) return null;
  return `${Math.round(Math.min(...all))} to ${Math.round(Math.max(...all))}`;
}
