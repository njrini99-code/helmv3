// CoachHelm Insights — barrel exports.
//
// Wave 1A: the legacy `InsightCard` (coach) has been removed; consumers
// should import the unified primitive from
// `@/components/golf/coachhelm/insight-card`.
//
// `InsightsFeed` removed 2026-08-18 — it was the coach-surface wrapper over
// that primitive, but nothing had mounted it since its page was removed (the
// v2 orchestrator's own notes said so). Its only remaining importer was a test.
//
// `InsightListView` removed 2026-08-15 — the /dashboard/insights coach surface
// it served is now a permanent redirect onto the consolidated
// `?view=signals&filter=insights` drill.
export { PlayerFocusAreas } from './PlayerFocusAreas';
