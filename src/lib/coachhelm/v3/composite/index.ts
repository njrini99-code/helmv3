/**
 * v3 composite barrel (W28 + W30.5).
 *
 * The COMPOSITE_RULES array itself now lives in the leaf `./registry` module
 * (extracted 2026-06-22 to break a runtime import cycle between this barrel and
 * `./synthesis` that surfaced as a TDZ in the bundled output — see
 * `./registry` header). This barrel re-exports it so existing import sites
 * (`@/lib/coachhelm/v3/composite`) keep working unchanged.
 */

export { COMPOSITE_RULES } from './registry';

export type {
  CompositeRule,
  EvidenceInsight,
  CompositeMatch,
  CompositeContent,
  CompositeContext,
  HoleScore,
  ShortGameShot,
  ApproachShotWithLie,
} from './types';
export { loadRecentInsightsForPlayer } from './loader';
export { loadCompositeContext, loadHoleScores, loadShortGameShots, loadFlyerLieShots } from './hole-sequence-loader';
export { synthesizeForPlayer } from './synthesis';
