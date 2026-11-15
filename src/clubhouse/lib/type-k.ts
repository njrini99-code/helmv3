/** The Text Size factor, as `--ch-type-k` computes it: the time column is placed by it, so the drag must reach as far. */
export function readTypeK(el: Element): number {
  const scale = Number.parseFloat(getComputedStyle(el).getPropertyValue('--ch-type-scale')) || 1;
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return (scale * root) / 16;
}
