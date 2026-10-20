/**
 * Shared editorial score-to-par formatter for Fairway rounds surfaces.
 *
 * "E" at level par, signed otherwise — and the signed minus is the Unicode
 * minus sign (U+2212 "−"), not the ASCII hyphen-minus ("-"). Currently
 * imported by FairwayRoundCard and FairwayQualifierLeaderboard, and matches
 * the Unicode-minus convention FairwayRoundDetail and FairwayQualifierDetail
 * independently reimplement in their own local `formatToPar` copies. A few
 * other local copies (FairwayMyQualifiers, RosterTable) still stringify the
 * raw negative number and so render an ASCII hyphen instead — this file
 * doesn't guarantee every surface stays in sync, it's the convention
 * new/rebuilt call sites should import rather than reimplement.
 */
export function formatToPar(stp: number | null | undefined, digits?: number): string {
  if (stp == null || Number.isNaN(stp)) return '—';
  // Whole numbers print as they are; an average prints one decimal unless the
  // caller asks for more, and anything that rounds to zero is level par.
  const d = digits ?? (Number.isInteger(stp) ? 0 : 1);
  const rounded = Number(stp.toFixed(d));
  if (rounded === 0) return 'E';
  return (rounded > 0 ? '+' : '−') + Math.abs(rounded).toFixed(d);
}
