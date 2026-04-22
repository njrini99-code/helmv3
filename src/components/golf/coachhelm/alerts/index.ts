// CoachHelm Alerts — barrel exports.
//
// Wave 1A of the Insight Delivery phase replaced the legacy `AlertCard`
// consumer surface with the unified `InsightCard` primitive rendered inside
// `CoachAlertCenter`. The legacy `AlertCard` component + `CoachAlert` /
// `AlertLevel` types are retained here as `@deprecated` re-exports because
// `src/app/golf/actions/alerts.ts` still constructs `CoachAlert` rows and
// that module is owned by a different wave. New consumers should import
// `InsightCard` from `@/components/golf/coachhelm/insight-card` and reach
// evidence-backed rows via `getInsightsForCoach`.

export { CoachAlertCenter } from './CoachAlertCenter';

/** @deprecated Use `InsightCard` from `@/components/golf/coachhelm/insight-card`. */
export { AlertCard, type CoachAlert, type AlertLevel } from './AlertCard';
