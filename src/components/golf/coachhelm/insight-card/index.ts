/**
 * InsightCard — Foundation primitive for Insight Delivery.
 *
 * Public surface:
 *   - `InsightCard`              the primitive (compact / default / hero)
 *   - `HeroInsightCard`          hero-density wrapper w/ staggered mount
 *   - `deriveTone` / `isImprovement`   pure classification helpers
 *   - `MovementPill`             inline movement chip
 *   - `WhyPopover`               "Why?" popover / bottom sheet
 *   - `DrillChips`               inline drill chip row
 *   - `DrillSheet`               full-detail drill sheet (opens from a chip)
 *   - `ResolutionCelebration`    confetti wrapper for resolved insights
 *
 * Downstream teams (Hub, CoachHelm Dashboard, Round Review) import from this
 * barrel. Do NOT deep-import individual files — keeps refactor surface small.
 */

export { InsightCard } from './InsightCard';
export type { InsightCardProps, InsightAction } from './InsightCard';
export { HeroInsightCard } from './HeroInsightCard';
export type { HeroInsightCardProps } from './HeroInsightCard';
export { MovementPill } from './MovementPill';
export type { MovementPillProps } from './MovementPill';
export { WhyPopover } from './WhyPopover';
export type { WhyPopoverProps } from './WhyPopover';
export { DrillChips } from './DrillChips';
export type { DrillChipsProps } from './DrillChips';
export { DrillSheet } from './DrillSheet';
export type {
  DrillSheetProps,
  DrillSheetDrill,
  DrillSheetInsightContext,
} from './DrillSheet';
export { ResolutionCelebration } from './ResolutionCelebration';
export type { ResolutionCelebrationProps } from './ResolutionCelebration';
export { deriveTone, isImprovement } from './tone-derivation';
export type { DerivedTone } from './tone-derivation';
