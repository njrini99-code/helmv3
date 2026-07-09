/**
 * Shared editorial score-to-par formatter for Fairway rounds surfaces.
 *
 * "E" at level par, signed otherwise — and the signed minus is the Unicode
 * minus sign (U+2212 "−"), not the ASCII hyphen-minus ("-"), matching the
 * round-detail hero's `formatToPar` (FairwayRoundDetail.tsx) so a to-par
 * figure reads identically whether it's on the hero, the round card, or the
 * ledger row.
 */
export function formatToPar(stp: number | null): string {
  if (stp == null) return '—';
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `−${Math.abs(stp)}`;
}
