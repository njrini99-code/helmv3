// Shared stat-formatting helpers for the box score entry form and the
// box score view — keeps the "no data" placeholder and decimal
// formatting identical in both places instead of each component
// inventing its own glyph (entry used '---', view used '—').

/** Single canonical "no data" placeholder used by every formatter below. */
export const EMPTY_STAT = '—';

/**
 * Formats a batting-average-style ratio (AVG/OBP/SLG): three decimals,
 * leading zero stripped (".300" not "0.300"). Pass `null`/`undefined`
 * when the underlying denominator (e.g. AB) is zero.
 */
export function formatAvg(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EMPTY_STAT;
  return value.toFixed(3).replace(/^0/, '');
}

/**
 * Formats OPS (OBP + SLG): three decimals, leading zero kept since OPS
 * commonly exceeds 1.000.
 */
export function formatOps(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EMPTY_STAT;
  return value.toFixed(3);
}

/** Formats ERA: two decimals, leading digit kept. */
export function formatEra(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EMPTY_STAT;
  return value.toFixed(2);
}

/** Formats WHIP: three decimals, leading digit kept. */
export function formatWhip(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EMPTY_STAT;
  return value.toFixed(3);
}
