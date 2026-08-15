// CoachHelm Insights — barrel exports.
//
// Wave 1A: the legacy `InsightCard` (coach) has been removed; consumers
// should import the unified primitive from
// `@/components/golf/coachhelm/insight-card`. `InsightsFeed` remains as a
// coach-surface wrapper that renders through the new primitive.
//
// `InsightListView` removed 2026-08-15 — the /dashboard/insights coach surface
// it served is now a permanent redirect onto the consolidated
// `?view=signals&filter=insights` drill.
export { PlayerFocusAreas } from './PlayerFocusAreas';
export { InsightsFeed } from './InsightsFeed';
