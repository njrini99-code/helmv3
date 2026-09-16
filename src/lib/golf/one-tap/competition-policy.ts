/** Competition Mode (master plan executive summary / go-no-go gates). Current
 * R&A/USGA DMD guidance permits distance and direction information but not
 * measured elevation change or interpreted advice (lines, clubs, roll).
 * Elevation still feeds rendering and post-round analytics. The version is
 * re-reviewed at every material release rather than frozen. */
export const COMPETITION_POLICY_VERSION = 'dmd-rules-review-2026-09';
export type PlayMode = 'practice' | 'competition';
export interface CompetitionPolicy {
  version: string;
  mode: PlayMode;
  distances: true;
  direction: true;
  elevationDelta: boolean;
  playsLike: boolean;
  slopeAdjustment: boolean;
  clubRecommendation: boolean;
  rollRecommendation: boolean;
  targetLineAdvice: boolean;
  basis: 'randa_usga_dmd_guidance';
}
export function competitionPolicy(mode: PlayMode): CompetitionPolicy {
  const advice = mode === 'practice';
  // `playsLike` stays off in both modes: no calibrated carry model exists and
  // a generic distance + elevation × constant is not marketed as physics.
  return { version: COMPETITION_POLICY_VERSION, mode, distances: true, direction: true, elevationDelta: advice, playsLike: false,
    slopeAdjustment: advice, clubRecommendation: advice, rollRecommendation: false, targetLineAdvice: advice, basis: 'randa_usga_dmd_guidance' };
}
/** Ground-roll tendency model inputs. μ is UNSPECIFIED for Peek'n Peak until
 * physically calibrated; the model never runs from imagery or turf colour. */
export const ROLLING_RESISTANCE_MU = 'UNSPECIFIED' as const;
export function stoppingDistanceM(v0: number, slopeRadians: number, mu: number | typeof ROLLING_RESISTANCE_MU, g = 9.80665): number | null {
  if (mu === ROLLING_RESISTANCE_MU) return null;
  const denominator = 2 * g * (mu * Math.cos(slopeRadians) - Math.sin(slopeRadians));
  return denominator > 0 ? v0 * v0 / denominator : null;
}
