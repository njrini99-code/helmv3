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

Fairway Premium Facelift — field sheet (2026-09-10, golf only): `/golf/dashboard/intelligence` follows `docs/design/fairway-facelift/LANGUAGE.md` and `screens/intelligence.v3.md`. `TriageDesk` now composes four regions and nothing else: a BARE masthead on canvas (scan-freshness eyebrow, the `ViewSwitch` + overflow `Menu` + Scan team on that same row, `surfaceName('brief')` as the title, and one verdict sentence from `buildIntelligenceVerdict` with real links); ONE `Surface` stage holding `LeakRail`, a page-local instrument that ranks every raw `GroupedSignal.category` by summed |strokeImpact| with a shared vertical zero rule, a vertical across-category mean rule, the severity mix as its legend, and `FieldReadouts` (Open signals / Players flagged / Outcomes awaiting / Last scan) in a 15rem rail from `xl`; a bare three-column ledger row (Queue, Players, Focus areas — even thirds at `xl`, 5/3/4 from `2xl`); and a dense Signals `<table>` with a `Toolbar` of Severity/Category `FilterMenu`s above it and the selected signal's `DrillPanel` appended below. All derivations live in `triage/intelligence-logic.ts` (pure, unit-tested); presentation in `triage/intelligence-parts.tsx`. RETIRED in the same pass and deleted from the route: the deep-green `Spine` and its hero/priorities/ledger/urgent block, `ResizableWorkspace` (including the persisted `coachhelm-signals-workspace-v2` layout), `SignalQueue.tsx`, `SignalRow.tsx`, `SignalInsightPanel.tsx` (CoachHelm chat is now one click away in the overflow `Menu` via `surfaceHref('ask')`), and `TeamCategoryLeakBand` (built on the five fixed `TeamCategory` buckets, a taxonomy the Category filter chips never shared). `SignalDossier` survives as the `DrillPanel`'s body, stripped of its own card and its four bordered `DossierSection` boxes. Both `useMediaQuery` calls are gone: every phone/desktop split on this screen is a CSS class, and the table renders both a stacked `md:hidden` list and a `hidden md:block` table so nothing reads a breakpoint at runtime. Honesty rules the composition enforces: `kind === 'team_synthesis'` roll-ups are excluded from the rail and the Queue column (their strokes are already counted per player) but still listed in the table, with the difference disclosed on the Open signals readout; a category whose every signal has a null `strokeImpact` reads "Not measured", never a zero bar; and `groupsError` gates exactly the regions that read `getSignalGroups` — Focus areas (its own `loadError` branch) and Outcomes awaiting keep rendering, because blanking a successful read is the mirror image of the bug the notice exists to fix. `EffectivenessScoreboard` was rebuilt onto one `InstrumentCluster`. The Players view's `RosterHealthHeader` roster-health instrument was removed as a duplicate; its pure `computeRosterHealth`/`computeNeedsAttention` math lives in `src/components/fairway/pages/coachhelm/roster-health.ts`, imported by `FairwayCoachRoster.tsx`. `TriageDesk` remains the sole owner of the optimistic signal-action state (`groups`/`pendingIds`) the rest of this doc describes below.

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
- `GroupedSignal.evidence` (`src/lib/coachhelm/signal-grouping.ts`) is `unknown | null` by design: two incompatible shapes travel through it — real `golf_coach_insights.evidence` rows (the full `InsightEvidence` contract, `src/lib/coachhelm/v2/insights/types.ts`) and `synthesizeTeamSignals`'s (`src/lib/coachhelm/v3/insights/team-synthesis.ts`) roster roll-up, which mints only `{ metric, metric_label, strokes_impact, players_affected }`. `SignalInsightPanel.tsx` and `SignalDossier.tsx` used to do an unsafe `signal.evidence as InsightEvidence | null` cast, so a `team_synthesis` signal's missing `your_value`/`comparison_value`/`confidence`/etc. flowed straight into `EvidencePanel` and rendered as the literal strings "undefined"/"NaN%" (facelift REVIEW.md item 1). Fixed (2026-09) two ways: (1) both call sites now go through `resolveSignalEvidence()` (exported from `buildTriageViewModel.ts`), which returns `InsightEvidence | null` only when `your_value`/`comparison_value` are finite numbers and `unit`/`metric`/`metric_label` are present and well-typed — team-synthesis-shaped evidence resolves to `null` and `EvidencePanel` falls back to its plain-text/"Not available" rendering instead of a benchmark visual; (2) `EvidencePanel.tsx` itself independently guards every numeric read (`safeFormatValue`, `Number.isFinite` checks) as defense-in-depth, since it has other callers outside Triage Desk (`insight-card/InsightCard.tsx`, `player-hub/HubInsightSignalCard.tsx`) that have not been audited for the same unsafe-cast pattern. Do not synthesize a `team_n`/`your_value`/etc. to force a `StandingBars` team-comparison visual to render for team-synthesis evidence — those fields do not exist for that signal kind and fabricating them would misrepresent the data.
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
