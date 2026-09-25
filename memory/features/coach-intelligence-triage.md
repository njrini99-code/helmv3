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

Coach Intelligence Triage is the coach-facing operational layer on top of CoachHelm AI. Its canonical `/golf/dashboard/intelligence` surface is a Triage Desk: a horizontal daily brief, a player-grouped open-signal queue, an evidence/action dossier, a roster-development view, and a compact effectiveness scoreboard.

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

- `src/components/golf/coachhelm/alerts/**`
- `src/components/golf/coachhelm/patterns/**`
- `src/components/golf/coachhelm/insights/**`
- `src/components/golf/coachhelm/analytics/**`
- `src/components/golf/coachhelm/settings/**`
- `src/components/golf/coachhelm/v2/**`
- `src/components/golf/coachhelm/triage/**`
- `src/components/golf/coachhelm/root-map/TeamRootsView.tsx`, `TeamTrendChart.tsx`

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
- Insight evidence is part of the trust contract; UI should make supporting evidence reachable when present.
- Benchmark provenance (2026-09-23, repair plan N16): a `comparison_source` label must never claim a measured average/norm for a value that is actually derived/estimated. `EvidencePanel.tsx`'s `SOURCE_LABELS` and `baseline-registry.ts`'s `BaselineEntry.provenance`/`sourceNote` fields are the enforcement points; full contract in `docs/architecture/coachhelm-evidence-contract.md`.
- Coaching philosophy settings feed future alert/insight prioritization and should not be treated as cosmetic preferences.
- CoachHelm analytics currently has sparse effectiveness data, so UI and agents should not assume the dashboard is fully populated.
- Chart/label honesty (2026-09-23, Package 11): `signal.ageDays` derives from `golf_coach_insights.created_at`, frozen by upsert-by-signature — a signal recomputed today into an old row still reads as old. Any age-bucketed UI ("New this week", a recency chart) built on it is a confident lie, not a real trend; `BriefBand.tsx`, `buildTriageViewModel.ts`'s `'new'` filter, and `TeamSignalSummary.tsx`'s "New this week" tile / "Signal velocity" chart / per-category "fresh" caption have all been removed for this reason. Restore only when a real `content_generated_at` is available. Separately, `FairwayEffectiveness.tsx`'s Predictions drill-down StatTiles (`overallAccuracy`, `calibrationScore`) must starve at their own declared `required` threshold, not just `resolved === 0` — see `isAccuracyHeadlineLive`/`BUCKET_MIN_RESOLVED` for the pattern the Cockpit tab already enforces.

## UI Contract

- **Team roots is the landing view (owner direction, 2026-09-25).** An
  absent or unknown `?view=` opens `view=team` when the page built the
  team roots model, unless the URL is a `?signal=`, legacy `?id=` or
  `?filter=` deep link (those still open Signals, and every in-desk link or
  navigation writes the current `view` so clearing that param, e.g. Back
  from a dossier or the All chip, stays on Signals). When the model is
  missing (its SG reads failed) the desk keeps the Signals default and
  hides the tab. Signals, Players and Effectiveness remain tabs. The view
  reads: a diverging stacked team trend (weekly team mean of each
  player's weekly mean of stored per-round SG, last 12 weeks), a team root
  map whose What row holds only causes shared by 3+ players with a stored
  stroke value, a "Who carries which root" matrix grouped by
  `evidence.metric` (no root-driver clustering; bubble area = stored
  counterfactual strokes/round, an open ring = none stored), "Did the
  focus work?" slopes from stored `golf_insight_outcome_attribution`
  (only with `coachhelm_comparable_opportunity_attribution` on, only 3+
  rounds on both sides, labelled with `describeMethodVersion`, coloured
  only when the metric's direction is known, no causal wording), and a
  "Needs you" list (open focus areas whose evidence changed, then
  urgent/high signals, max 4). One primary action: open the selected
  area's Signals. Team matrix sizes differ from the team-leak cards,
  which sum `strokes_impact`. Focus-start markers are not drawn: there is
  no team-level focus event.
- Alerts need severity filtering, acknowledged visibility, and bulk operations.
- Patterns need lifecycle visibility: detected, confirmed, addressed, resolved, dismissed.
- Insights need search, player/type/priority/status/date filters, bulk actions, and export affordances.
- Intelligence dashboard should communicate team-wide patterns without hiding per-player drilldowns.
- Coaching settings should make sensitivity, thresholds, weights, and alert toggles clear enough that coaches understand downstream impact.
- Mobile views must stay dense and scannable; avoid stacked header controls.
- A retired route that is now a `permanentRedirect` shim (`alerts`, `analytics/coachhelm`) keeps a `loading.tsx` that renders only `bg-canvas` — no skeleton geometry and no `<h1>`. Its real first paint is nothing, so a reconstructed workspace fallback there announces and reserves a screen that no longer mounts. The file is kept, not deleted, so the ancestor `dashboard/loading.tsx` cannot claim the segment with a full `FairwayDashboardSkeleton`. `insights` is the third shim on this pattern. For a live route, the fallback reserves the paint at t=0 — for a `'use client'` page holding its own `loading` state that is that component's loading branch, not its settled layout.

## Known Risk Areas

- Effectiveness analytics can look complete while `golf_insight_effectiveness` is sparse.
- Bulk lifecycle operations can accidentally over-update if team/player scope is wrong.
- Pattern and insight lifecycle labels can drift from DB constraints and UI copy.
- Settings changes can silently alter future AI behavior if not documented in current-state docs.

## Tests To Prefer

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
