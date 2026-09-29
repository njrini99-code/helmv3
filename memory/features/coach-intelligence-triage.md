# Feature: Coach Intelligence Triage

<!-- schema-drift-banner -->
> **⚠️ 2 identifiers named below do not exist in the database.**
> Verified 2026-08-19 against production. `golf_insight_evidence`, `golf_insight_feedback`
>
> They are described here as if live. Do not query, type, or build on them —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Declared absent
> below so `npm run docs:schema-drift` exempts them structurally
> instead of carrying them in the numeric baseline. Removing this
> reference entirely is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

<!-- schema-drift-absent: golf_insight_evidence, golf_insight_feedback -->


## Status

- active

## Current State

Coach Intelligence Triage is the coach-facing operational layer on top of CoachHelm AI. Its canonical `/golf/dashboard/intelligence` surface is a Triage Desk (`TriageDesk.tsx`) with a Home · The Lab · Chat toggle (`?view=home|lab|chat`, 2026-09-27):

- Home: the greeting with the last-scan time and Scan team beside it, then Team intelligence (`intel/TeamIntelligence.tsx`, 2026-09-28). It replaced the bleed board, team shot weaknesses and the game pressure map. It has filters (round type; Season or Last 30 days; vs the team's configured Tour baseline or vs team average), four theme cards (Off the tee, Approach, Around the green, Putting) with SG per round, change and sparkline, and a cause visual for the selected theme (tee zones, an 8-way approach miss plot at the measured leave, chip leaves, putt leaves in the tagged direction). Beside it sit a player spotlight and "Who's contributing", a worst-to-best list where tapping a player filters the cause and spotlight.
  Each theme card also shows the last 30 days beside the season and the count of rounds in the slice with no stored SG (they are left out of the mean, not silently dropped). Its "strokes / round per player available" chip is a TEAM figure: `getTeamCategoryInsights` sums each current player's largest live counterfactual in the category and divides by the number of current players (`team-intelligence/strokes-available.ts`), with "k of n current players carry a measured leak". A current player has a countable round in the last 60 days (`src/lib/coachhelm/recent-players.ts`); the same set drives that action's category means, SD and attention flags. Fairway % and GIR % there are pooled from countable rounds; scramble % still comes from the stats cache.
- The Lab: the player-grouped open-signal queue beside the evidence/action dossier, with Scan team in its header too. Signals collapse on player + `evidence.metric` (category when a row has no metric), keeping the largest-|impact| row (newest on a tie); `attentionScore` is severity-first (worst severity x 1000 + count). Team leak cards (`team-synthesis.ts`) total only current players and grade severity on the per-player leak (>= 1.5 urgent, >= 0.9 high, >= 0.5 medium; calibrated 2026-09-28).
- Chat: the Ask CoachHelm conversation, embedded and kept mounted once opened. Its coverage line counts players with a countable round in the last 60 days, and "Where is the team losing the most strokes?" is offered only with at least 3 such players (`program-pulse.ts`).

`getTeamOverview`'s `teamShotAnalysis` (no mounted consumer since the Home rebuild) comes from `src/lib/coachhelm/team-shot-analysis.ts`: SG per shot on the rising Tour curve, an open-ended 250+ yd bucket that is never a dead zone, `other` lies as a labelled recovery context, penalty rows counted apart, and dead zones and weaknesses judged against the team's own mean SG per shot with the Tour value beside it.

The roster-development view (`PlayersGridView`) has no toggle segment but stays reachable by deep link (`?view=players`, which many links use). The effectiveness scoreboard is no longer on this page: the legacy `?view=effectiveness` opens Home and `?view=signals` opens The Lab.

This feature is distinct from the engine itself: `memory/features/coachhelm-ai.md` describes generation/trust behavior, while this document describes coach workflows after intelligence exists.

Coaching philosophy saves use one authoritative hook write path with downstream revalidation, so settings pages should not add a second server-action write for the same patch.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/alerts/**`
- `src/app/golf/(dashboard)/dashboard/patterns/**`
- `src/app/golf/(dashboard)/dashboard/insights/**`
- `src/app/golf/(dashboard)/dashboard/intelligence/**`
- `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/**`
- `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/**`

### Components

- `src/components/golf/coachhelm/triage/**` (the desk, its views and cards)
- `src/components/golf/coachhelm/home/CoachIntelligenceHome.tsx` (empty-roster gate, greeting, Chat tab)
- `src/components/golf/coachhelm/alerts/**`
- `src/components/golf/coachhelm/patterns/**`
- `src/components/golf/coachhelm/insights/**`
- `src/components/golf/coachhelm/analytics/**`
- `src/components/golf/coachhelm/settings/**`
- `src/components/golf/coachhelm/v2/**`

### Data

- `src/lib/golf/team-intelligence/**` (`loadTeamIntelligence`: the team's completed, non-test rounds and their tracked shots, normalized once; `aggregate.ts` slices and summarizes them in the client)

### Actions

- `src/app/golf/actions/alerts.ts`
- `src/app/golf/actions/pattern-management.ts`
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/insight-evidence.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/signal-groups.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/coaching-philosophy.ts`

## Core Data

- `golf_coach_insights`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_insight_evidence`
- `golf_insight_effectiveness`
- `golf_insight_feedback`
- `golf_prediction_model_performance`
- `golf_coach_philosophy`
- `golf_learned_behavior`

## Data Flow

```txt
CoachHelm generates insight/pattern/prediction
  -> coach triage surfaces read scoped team data
  -> coach acknowledges, dismisses, validates, addresses, resolves, or exports
  -> lifecycle state updates persisted
  -> analytics surfaces measure adoption/effectiveness where data exists
  -> coaching philosophy settings tune future filtering and prioritization
```

## Business Rules

- Coach triage reads must be scoped to assigned teams through correct coach/team access.
- Acknowledge, dismiss, validate, address, resolve, and bulk actions must persist explicit lifecycle state.
- The Triage Desk is an open-work queue: acknowledged/addressed/resolved rows leave the queue but remain available to lifecycle/history and effectiveness reads.
- “Scan team” must run the canonical CoachHelm engine for the active roster. V3 generators own stable-signature upsert/retraction; the UI must not create a parallel legacy alert feed.
- “Scan team” (`generateAlerts`) analyzes at most 4 players at once (#2061): an unbounded roster-wide `Promise.all` of the full generator pipeline helped exhaust the database pool on 2026-09-24. Alert rows keep roster order.
- Insight evidence is part of the trust contract; UI should make supporting evidence reachable when present.
- Benchmark provenance (2026-09-23, repair plan N16): a `comparison_source` label must never claim a measured average/norm for a value that is actually derived/estimated. `EvidencePanel.tsx`'s `SOURCE_LABELS` and `baseline-registry.ts`'s `BaselineEntry.provenance`/`sourceNote` fields are the enforcement points; full contract in `docs/architecture/coachhelm-evidence-contract.md`.
- Coaching philosophy settings feed future alert/insight prioritization and should not be treated as cosmetic preferences.
- CoachHelm analytics currently has sparse effectiveness data, so UI and agents should not assume the dashboard is fully populated.
- Chart/label honesty (2026-09-23, Package 11): `signal.ageDays` derives from `golf_coach_insights.created_at`, frozen by upsert-by-signature — a signal recomputed today into an old row still reads as old. Any age-bucketed UI ("New this week", a recency chart) built on it is a confident lie, not a real trend; `BriefBand.tsx`, `buildTriageViewModel.ts`'s `'new'` filter, and `TeamSignalSummary.tsx`'s "New this week" tile / "Signal velocity" chart / per-category "fresh" caption have all been removed for this reason. Restore only when a real `content_generated_at` is available. Separately, `FairwayEffectiveness.tsx`'s Predictions drill-down StatTiles (`overallAccuracy`, `calibrationScore`) must starve at their own declared `required` threshold, not just `resolved === 0` — see `isAccuracyHeadlineLive`/`BUCKET_MIN_RESOLVED` for the pattern the Cockpit tab already enforces.

## UI Contract

- Alerts need severity filtering, acknowledged visibility, and bulk operations.
- Patterns need lifecycle visibility: detected, confirmed, addressed, resolved, dismissed.
- Insights need search, player/type/priority/status/date filters, bulk actions, and export affordances.
- Intelligence dashboard should communicate team-wide patterns without hiding per-player drilldowns.
- Coaching settings should make sensitivity, thresholds, weights, and alert toggles clear enough that coaches understand downstream impact.
- Mobile views must stay dense and scannable; avoid stacked header controls.
- Strokes figures stay visible wherever this page shows them (owner rule, 2026-09-27, after a coach reported strokes gained missing): each Home theme card's "Up to N strokes / round available" (engine-backed live counterfactual from `getTeamCategoryInsights` only, never estimated, and absent when the engine has no figure), SG on every theme card and player row, and the dossier's est. strokes (clamped at 8 per round for one signal, as `EvidencePanel` clamps; a roster roll-up is a sum and is not clamped).
- A deep link that implies The Lab without naming a view (`?signal=`, the legacy `?id=`, `?filter=`) stays in The Lab when that context is cleared (Back, Prescribe, a review, "All"): `hrefFor` pins the current view whenever an update does not name one.
- Team intelligence reads only tracked data: approach misses use the 8 recorded directions and the measured leave (no lateral coordinates exist, so the plot places a miss by its tagged direction at its leave distance), a putt's leave is the next putt's length, and a tile below 5 shots says "low sample" instead of judging. The default theme is the team's worst SG; Season is the default window.
- The route's `loading.tsx` paints Home's shape (toggle, greeting row, Team intelligence's filters, four theme cards, cause and spotlight cards, and the contributor list); `loading.tsx` gets no search params, so a Lab or Chat deep link paints that frame first.
- A retired route that is now a `permanentRedirect` shim (`alerts`, `analytics/coachhelm`) keeps a `loading.tsx` that renders only `bg-canvas` — no skeleton geometry and no `<h1>`. Its real first paint is nothing, so a reconstructed workspace fallback there announces and reserves a screen that no longer mounts. The file is kept, not deleted, so the ancestor `dashboard/loading.tsx` cannot claim the segment with a full `FairwayDashboardSkeleton`. `insights` is the third shim on this pattern. For a live route, the fallback reserves the paint at t=0 — for a `'use client'` page holding its own `loading` state that is that component's loading branch, not its settled layout.

## Known Risk Areas

- Effectiveness analytics can look complete while `golf_insight_effectiveness` is sparse.
- Bulk lifecycle operations can accidentally over-update if team/player scope is wrong.
- Pattern and insight lifecycle labels can drift from DB constraints and UI copy.
- Settings changes can silently alter future AI behavior if not documented in current-state docs.

## Tests To Prefer

- `src/components/golf/coachhelm/triage/__tests__/**` (desk navigation)
- `src/components/golf/coachhelm/intel/**/__tests__/**` and `src/lib/golf/team-intelligence/__tests__/**` (Home's Team intelligence)
- `src/components/golf/coachhelm/home/__tests__/CoachIntelligenceHome.hasData.test.tsx`
- `src/test/golf/actions/coachhelm-analytics.test.ts`
- `src/test/coachhelm/v2/**`
- `src/test/api/cron/coachhelm*.test.ts`
- Browser checks for alerts, insights filters, pattern lifecycle actions, and settings save.

## Related Docs

- `memory/features/coachhelm-ai.md`
- `memory/context/coachhelm-ai.md`
- `memory/context/golfhelm-features.md`
- `docs/architecture/coachhelm-evidence-contract.md`
- `docs/v3-testing-standards.md`
