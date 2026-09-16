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

/** Task 16 — the round setting. Tournament and qualifier rounds play in
 * Competition Mode and cannot opt out; a practice round may opt in. */
export type RoundTypeLike = 'practice' | 'tournament' | 'qualifier' | (string & {}) | null | undefined;
export interface PlayModeResolution { mode: PlayMode; locked: boolean; basis: 'round_type' | 'player_choice' | 'default' }
export function playModeForRound(roundType: RoundTypeLike, override: PlayMode | null | undefined = null): PlayModeResolution {
  if (roundType === 'tournament' || roundType === 'qualifier') return { mode: 'competition', locked: true, basis: 'round_type' };
  if (override === 'competition' || override === 'practice') return { mode: override, locked: false, basis: 'player_choice' };
  return { mode: 'practice', locked: false, basis: 'default' };
}
/** Shown wherever the mode is set or explained. The app never asserts that a
 * device is permitted: a Local Rule (Model Local Rule G-5) can prohibit
 * distance-measuring devices altogether. */
export const LOCAL_RULE_CAVEAT = Object.freeze({
  title: 'Competition Mode',
  body: 'Distance and direction only — no elevation, plays-like, club or line advice. A Local Rule may still prohibit distance-measuring devices; check with the Committee before play.',
  locked: 'On for tournament and qualifier rounds.',
  practice: 'Practice rounds may show elevation to the green.',
});
/** Everything a readout could add beyond distance and direction. Each field
 * exists only so the policy can be applied to it; a field the policy forbids
 * is null before it reaches any component. */
export interface ReadoutAdvice { elevationDeltaM: number | null; playsLikeM: number | null; club: string | null; line: string | null }
export const NO_ADVICE: Readonly<ReadoutAdvice> = Object.freeze({ elevationDeltaM: null, playsLikeM: null, club: null, line: null });
export function permittedAdvice(advice: ReadoutAdvice, policy: CompetitionPolicy): ReadoutAdvice {
  return { elevationDeltaM: policy.elevationDelta ? advice.elevationDeltaM : null, playsLikeM: policy.playsLike ? advice.playsLikeM : null,
    club: policy.clubRecommendation ? advice.club : null, line: policy.targetLineAdvice ? advice.line : null };
}
