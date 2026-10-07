// `PerformancePrediction` removed 2026-08-15 — the CoachHelm overview renders the
// prediction inline (PlayerHubFeed's NextRoundWindow). NOTE: the
// deleted card also showed tail-risk probabilities and itemized key factors,
// which the inline rendering does NOT reproduce; that detail now exists nowhere
// in the UI. Recoverable from git history if it's wanted back.
// `AIInsightsPanel` removed in the 2026-04-22 Insight Delivery refactor — the
// CoachHelm dashboard now composes InsightCard (default density) from
// `@/components/golf/coachhelm/insight-card` instead. (That barrel's
// `HeroInsightCard` staggered-mount wrapper was itself removed 2026-09-22 —
// zero importers; live hero-density cards render through the duplicate local
// `HeroInsightCardInner` inside InsightCard.tsx.)
// `FocusAreasGrid` removed 2026-08-18 — its only importer was
// `FairwayPlayerCoachHelm`, itself dead since `PlayerCoachHelmHome` superseded
// it, so the two went together (that cluster is what the retained-but-dead note
// in ../../../fairway/pages/coachhelm/index.ts was waiting on a decision for).
// `FairwayMyDevelopment` (also once listed here as live) was removed
// 2026-09-22 — its route permanently redirects. The live player focus-area
// surface is `PlayerFocusAreas`. Recoverable from git history if wanted back.
export { CompositeRatingCard } from './CompositeRatingCard';
// `TrendDashboard` removed 2026-08-15 — superseded by FairwayTrendBrain, which
// was built as a drop-in (same trends/streaks/volatility props).
export { ShotAnalysisCard } from './ShotAnalysisCard';
export { WhatIfPanel } from './WhatIfPanel';
