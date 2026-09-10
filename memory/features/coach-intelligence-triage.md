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

Coach Intelligence Triage is the coach-facing operational layer on top of CoachHelm AI. Its canonical `/golf/dashboard/intelligence` surface is a Triage Desk.

Fairway Premium Facelift (2026-09, golf only): the Triage Desk's `BriefBand`/`TeamSignalSummary` horizontal daily-brief band and the standalone `CommandOpening` "welcome" opening were replaced by ONE deep-green `Spine` (identity line, an open-signals hero numeral, a prose verdict that folds in players-needing-attention and outcomes-awaiting, the one urgent signal, top-3 priorities, a ledger, and the "Ask CoachHelm" CTA). The workspace below it is a frost `Toolbar` (Signals/Players/Effectiveness `ViewSwitch` + Severity/Category `Toolbar.FilterMenu`s), the `TeamCategoryLeakBand` as one horizontal band, then a `ResizableWorkspace` for the Signals view (`SignalQueue` | `SignalDossier` | a new `SignalInsightPanel` built on the `InsightPanel` primitive). `EffectivenessScoreboard` was rebuilt onto one `InstrumentCluster`. On phone the Spine collapses to its hero/verdict/urgent/CTA (priorities and ledger are desktop-only, `min-width: 940px`), and `ResizableWorkspace`'s `renderMobile` opens the dossier as a `Sheet`. `TriageDesk` remains the sole owner of the optimistic signal-action state (`groups`/`pendingIds`) the rest of this doc describes below. The Players view's `RosterHealthHeader` roster-health instrument was removed as a duplicate of the Spine's own ledger numbers (`RosterHealthHeader.tsx` itself is untouched — `FairwayCoachRoster.tsx`, the canonical Roster page, still imports it).

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
- Coaching philosophy settings feed future alert/insight prioritization and should not be treated as cosmetic preferences.
- CoachHelm analytics currently has sparse effectiveness data, so UI and agents should not assume the dashboard is fully populated.

## UI Contract

- Alerts need severity filtering, acknowledged visibility, and bulk operations.
- Patterns need lifecycle visibility: detected, confirmed, addressed, resolved, dismissed.
- Insights need search, player/type/priority/status/date filters, bulk actions, and export affordances.
- Intelligence dashboard should communicate team-wide patterns without hiding per-player drilldowns.
- Coaching settings should make sensitivity, thresholds, weights, and alert toggles clear enough that coaches understand downstream impact.
- Mobile views must stay dense and scannable; avoid stacked header controls.
- A retired route that is now a `permanentRedirect` shim (`alerts`, `analytics/coachhelm`) keeps a `loading.tsx` that renders only `bg-canvas` — no skeleton geometry and no `<h1>`. Its real first paint is nothing, so a reconstructed workspace fallback there announces and reserves a screen that no longer mounts. The file is kept, not deleted, so the ancestor `dashboard/loading.tsx` cannot claim the segment with a full `FairwayDashboardSkeleton`. `insights` is the third shim on this pattern. For a live route, the fallback reserves the paint at t=0 — for a `'use client'` page holding its own `loading` state that is that component's loading branch, not its settled layout.

## Known Risk Areas

- `Spine` (`@/components/fairway/modules/Spine.tsx`) has one fixed `verdict` string and no native multi-readout slot — the Triage Desk's "players needing attention" / "outcomes awaiting" readouts are folded into that one sentence (`buildSpineVerdict`) rather than rendered as separate tiles, and the one urgent signal renders in `Spine`'s `children` slot, which places it after the ledger rather than above the priorities list the original ASCII composition sketch showed. Both are primitive-shape constraints, not oversights — do not "fix" by editing `Spine.tsx` without checking who else consumes it first.
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
