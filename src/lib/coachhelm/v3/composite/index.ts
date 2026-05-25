/**
 * v3 composite rules registry (W28 + W30.5).
 *
 * Single source of truth for which composite rules are active. Order
 * matters: rules are evaluated top-to-bottom. Conflict resolution
 * (Part IX.3): if rule B's source_insight_ids ⊆ rule A's
 * source_insight_ids and A fires, B suppressed. Implemented in
 * `synthesis.ts`.
 *
 * 10 of 11 implementable rules ship here (per Part IX.2 amended for
 * 3-bucket club model). Rule #3 "Tee-club mismatch" still needs
 * hole-level outcome joining and stays deferred.
 */

// W28 — insight-driven composites
import pressureDecel from './rules/pressure-decel-chain';
import bunkerMissSide from './rules/bunker-miss-side-amplifier';
import longApproach3Putt from './rules/long-approach-3putt-cascade';
// W30.5 — insight-driven composites
import lagDistance3Putt from './rules/lag-distance-3putt';
import shortApproachGap from './rules/short-approach-proximity-gap';
// W30.5 — ctx-driven composites (hole-sequence + lie-typed shots)
import closingHoleFatigue from './rules/closing-hole-fatigue';
import front9Starter from './rules/front-9-starter';
import doublesAfterBogey from './rules/doubles-after-bogey';
import shortSideScrambling from './rules/short-side-scrambling-chain';
import flyerLieOverGreen from './rules/flyer-lie-over-the-green';
import type { CompositeRule } from './types';

export const COMPOSITE_RULES: readonly CompositeRule[] = [
  // Order: urgent priority + most-specific patterns first so the
  // subset-suppression check downstream prefers them.
  pressureDecel,
  lagDistance3Putt,
  doublesAfterBogey,
  bunkerMissSide,
  longApproach3Putt,
  shortApproachGap,
  shortSideScrambling,
  flyerLieOverGreen,
  closingHoleFatigue,
  front9Starter,
];

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
