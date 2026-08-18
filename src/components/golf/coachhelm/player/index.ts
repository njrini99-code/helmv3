// `PerformancePrediction` removed 2026-08-15 — PlayerCoachHelmHome renders the
// prediction inline via buildPredictionVerdict/formatPredictionHero. NOTE: the
// deleted card also showed tail-risk probabilities and itemized key factors,
// which the inline rendering does NOT reproduce; that detail now exists nowhere
// in the UI. Recoverable from git history if it's wanted back.
// `AIInsightsPanel` removed in the 2026-04-22 Insight Delivery refactor — the
// CoachHelm dashboard now composes HeroInsightCard + InsightCard (default)
// from `@/components/golf/coachhelm/insight-card` instead.
// `FocusAreasGrid` removed 2026-08-18 — its only importer was
// `FairwayPlayerCoachHelm`, itself dead since `PlayerCoachHelmHome` superseded
// it, so the two went together (that cluster is what the retained-but-dead note
// in ../../../fairway/pages/coachhelm/index.ts was waiting on a decision for).
// The live player focus-area surfaces are `FairwayMyDevelopment` and
// `PlayerFocusAreas`. Recoverable from git history if it's wanted back.
export { CompositeRatingCard } from './CompositeRatingCard';
// `TrendDashboard` removed 2026-08-15 — superseded by FairwayTrendBrain, which
// was built as a drop-in (same trends/streaks/volatility props).
export { ShotAnalysisCard } from './ShotAnalysisCard';
export { WhatIfPanel } from './WhatIfPanel';
