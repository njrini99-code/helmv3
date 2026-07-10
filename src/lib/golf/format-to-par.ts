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
export function formatToPar(stp: number | null): string {
  if (stp == null) return '—';
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `−${Math.abs(stp)}`;
}
