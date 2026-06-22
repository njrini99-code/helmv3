/**
 * Round-review component barrel.
 *
 * The primary insight-delivery surface on the round-review page is now
 * `V2ReviewSummary` (refactored) which internally composes `RoundTakeaway`
 * (hero) + collapsed supporting `<InsightCard>` rows.
 *
 * The legacy `V2CausalInsights`, `V2PatternsSection`, and `V2PredictionCard`
 * components remain exported for back-compat with `RoundReviewViewer.tsx`
 * (different surface, out of round-review ownership). They are NOT used on
 * the `/dashboard/rounds/[id]/review` page anymore.
 */

export { CompletionCard } from './CompletionCard';
export { GoalImpactCard } from './GoalImpactCard';
export { HighlightsSection } from './HighlightsSection';
export { ReviewSummary } from './ReviewSummary';

// Hero takeaway (new — replaces V2CausalInsights/Patterns/Prediction on the round-review page).
export { RoundTakeaway } from './RoundTakeaway';
export type { RoundTakeawayProps } from './RoundTakeaway';

// Round-review summary (refactored — now accepts optional hero + supporting props).
export { V2ReviewSummary } from './V2ReviewSummary';

// Deprecated on the round-review page. Still exported because
// `RoundReviewViewer.tsx` composes them — do NOT delete without updating that
// file (which is outside round-review ownership).
/** @deprecated Use `RoundTakeaway` + `InsightCard` rows via `V2ReviewSummary` instead. */
export { V2PatternsSection } from './V2PatternsSection';
/** @deprecated Use `RoundTakeaway` + `InsightCard` rows via `V2ReviewSummary` instead. */
export { V2PredictionCard } from './V2PredictionCard';
/** @deprecated Use `RoundTakeaway` + `InsightCard` rows via `V2ReviewSummary` instead. */
export { V2CausalInsights } from './V2CausalInsights';
