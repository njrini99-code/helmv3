/**
 * v3 composite rules registry (W28).
 *
 * Single source of truth for which composite rules are active. Order
 * matters: rules are evaluated top-to-bottom. Conflict resolution
 * (Part IX.3): if rule B's source_insight_ids ⊆ rule A's
 * source_insight_ids and A fires, B suppressed. Implemented in
 * `synthesis.ts`.
 *
 * Total slots: 10 implementable rules (per Part IX.2 amended for
 * 3-bucket club model). 3 land in W28; 7 follow-up.
 */

import pressureDecel from './rules/pressure-decel-chain';
import bunkerMissSide from './rules/bunker-miss-side-amplifier';
import longApproach3Putt from './rules/long-approach-3putt-cascade';
import type { CompositeRule } from './types';

export const COMPOSITE_RULES: readonly CompositeRule[] = [
  // Order matters for conflict resolution. Most-specific first.
  pressureDecel,
  bunkerMissSide,
  longApproach3Putt,
];

export type { CompositeRule, EvidenceInsight, CompositeMatch, CompositeContent } from './types';
export { loadRecentInsightsForPlayer } from './loader';
export { synthesizeForPlayer } from './synthesis';
