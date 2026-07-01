/**
 * format.ts — small baseball-native number formatters for the Living Annual kit.
 *
 * Pure, side-effect-free. Used by SlashLine / PlayerRowPlate / stat surfaces so
 * rate stats read the way a scorekeeper writes them.
 */

/**
 * Format a rate stat (AVG / OBP / SLG / OPS / PCT) the baseball way: drop the
 * leading zero when the magnitude is below 1 (`.341`, `-.012`) but KEEP it once
 * the value reaches 1 (`1.089` OPS). Non-finite → an em dash (honest empty).
 */
export function formatRate(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(decimals);
  const body = Math.abs(value) < 1 && fixed.startsWith('0') ? fixed.slice(1) : fixed;
  return value < 0 ? `-${body}` : body;
}

/**
 * Format an ERA / WHIP-style rate: fixed decimals, leading zero KEPT (`3.50`,
 * `0.98`). Non-finite → em dash.
 */
export function formatRatio(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimals);
}

/** Innings pitched display: whole innings + thirds as `.1`/`.2` (`6.1` = 6⅓). */
export function formatInnings(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const whole = Math.trunc(value);
  const thirds = Math.round((value - whole) * 3);
  return thirds === 0 ? `${whole}` : `${whole}.${thirds}`;
}
