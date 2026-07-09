/**
 * ============================================================================
 * Fairway · feedback — primitive group barrel (DESIGN-SYSTEM.md §6)
 * ----------------------------------------------------------------------------
 * Feedback + state primitives for the warm-premium "Fairway" redesign. ADDITIVE
 * ONLY — nothing here is imported into the live app; components render correctly
 * inside a `.fairway-ds` scope on a `bg-canvas` page.
 *
 *   ToastStack        — warm cream-glass, non-blocking toast surface (sonner).
 *   fairwayToast      — typed facade: .success/.warning/.danger/.info/.loading/.promise.
 *   InlineNotice      — in-flow info/success/warning/danger alert banner.
 *   EmptyState        — explain-what-belongs + one clear CTA (default/search/subtle).
 *   InsufficientData  — the HONEST "not enough data yet" state (no fake zeros).
 *   Skeleton (+kit)   — shape-matched shimmer placeholders, never spinners.
 *   OnboardingStep    — numbered progressive step card (+ OnboardingSteps stepper).
 * ========================================================================== */

export { ToastStack, fairwayToast } from './ToastStack';
export type { ToastStackProps, FairwayToastOptions } from './ToastStack';

export { InlineNotice } from './InlineNotice';
export type { InlineNoticeProps } from './InlineNotice';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateVariant } from './EmptyState';

export { InsufficientData } from './InsufficientData';
export type { InsufficientDataProps } from './InsufficientData';

export { FeatureUnavailable } from './FeatureUnavailable';
export type { FeatureUnavailableProps } from './FeatureUnavailable';

export { FairwayGenericPageSkeleton } from './GenericPageSkeleton';

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonStat,
  SkeletonList,
} from './Skeleton';
export type { SkeletonProps, SkeletonTextProps } from './Skeleton';

export { OnboardingStep, OnboardingSteps } from './OnboardingStep';
export type {
  OnboardingStepProps,
  OnboardingStepStatus,
  OnboardingStepsProps,
} from './OnboardingStep';

export { toneStyle, TONES } from './tone';
export type { FeedbackTone, ToneStyle } from './tone';
