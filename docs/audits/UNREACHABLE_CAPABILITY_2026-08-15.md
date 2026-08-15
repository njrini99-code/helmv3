# Finished-But-Unreachable Capability Audit — GolfHelm

**Date:** 2026-08-15
**Scope:** `src/lib/golf`, `src/lib/calendar`, `src/lib/coachhelm`, `src/app/golf`, `src/components/golf`, `src/components/fairway`
**Method:** `npx knip` as a starting point, then hand verification of every candidate with `grep`, dynamic-import checks, and direct file reads. Read-only audit — no code was changed.

## Important caveat: this checkout was moving under me

This is a shared working directory with multiple concurrent agents (the session lists `main, calendar-surface, chat-answers, content-surfaces, event-editor, interstitials` as active). Mid-audit, `git branch --show-current` returned `feat/ask-nav-and-opening` — not the `fix/read-failure-vs-empty-batch2` branch named in the task — with an **uncommitted** 20-line diff to `CoachHelmSubNav.tsx` that adds an `ask` tab to `COACH_TABS`. That diff is exactly the fix for confirmed example #2 in the task brief. It appears another agent in this session (plausibly `calendar-surface`, given a second discrepancy below) is actively remediating some of the exact issues this audit was asked to hunt for, in real time, in the same tree.

Two consequences:
1. I independently re-verified both "confirmed" examples from the task brief rather than taking them on faith, and one of them (`findCommonAvailability`) no longer holds — see below.
2. Everything in this report reflects the tree as read at time of audit. Given concurrent activity, re-verify before acting on any finding.

---

## Summary

| Category | Count | Value |
|---|---|---|
| A — finished feature, unreachable (zero-caller, feature-shaped) | 3 | High |
| B — registered but not rendered (surface-registry vs. consumers) | 1 (the given example; already being fixed) | High, but in-flight |
| C — component reachable only via type-only import | 0 found | — |
| D — flag/conditional that can never be true in prod | 1 (overlaps with an "A" finding below) | High |
| Genuinely dead / safe to delete (superseded by a redesign) | 11 | Low |
| Corrections to the task's given examples | 2 | — |

### Top 5, one line each

1. **`src/lib/coachhelm/v3/standing/pga-standards.ts`** — a full LPGA/PGA gender-aware standards loader, backed by a real migration and its own test suite, has **zero production callers**; the live code path uses a smaller hand-authored 12-metric estimate table instead.
2. **`src/lib/coachhelm/v2/shot-analysis/{yardage-curves,scoring-opportunities,sequence-analysis}.ts`** — 4 of the module's exported functions (`compareYardageCurves`, `identifyScoringOpportunities`, `calculateConversionRate`, `detectCompoundingPatterns`) are dead siblings of functions from the very same files that the production pipeline does call.
3. **`src/lib/coachhelm/v3/composite/rules/flyer-lie-over-the-green.ts`** — a fully-implemented, registered composite insight rule is wired to `RULE_ENABLED = false` because its data source can structurally never be populated under the current DB `CHECK` constraint.
4. **Correction:** the task's example #1, `findCommonAvailability` (calendar "Find a Time"), is **not** actually unreachable — it is live via `checkEventConflicts` → the `checkScheduleConflicts` server action → `FairwayEventEditor.tsx` / `EventDetailModal.tsx`. Only the export's *formatter* sibling, `formatSuggestedTime` in `conflicts.ts`, is genuinely dead (a private duplicate in `ConflictWarning.tsx` does the real formatting instead).
5. **Example #2** (`surface-registry.ts`'s `ask` entry vs. `CoachHelmSubNav.tsx`) is confirmed as given, but as of this audit a fix already exists as an uncommitted diff on the checked-out branch — likely in-flight remediation by another agent in this session, not an open gap.

---

## A — Finished feature, unreachable (high value)

### A1. PGA/LPGA gender-aware standing benchmarks — the whole loader is dead

**File:** `src/lib/coachhelm/v3/standing/pga-standards.ts` (types + 5 exports: `loadStandardsForTour`, `loadPgaStandards`, `loadStandardsForGender`, `pgaReferenceValue`, `cohortBaselineValue`)

**What it does:** Reads `golf_pga_standards` (metric_id, tour, `pga_tour_value`/`pga_p25/50/75`, plus `korn_ferry_value`/`div1_avg_value`/`div2_avg_value`/`div3_avg_value`/`hs_avg_value`) and returns the most recent season per metric. `loadStandardsForGender('womens')` prefers real LPGA rows over PGA, falling back per-metric when no LPGA row exists. `pgaReferenceValue` picks the canonical "Tour reference value" (`pga_tour_value` → `pga_p50` → null) for a StandingBar marker. `cohortBaselineValue` maps a `CohortTier` (`pga | korn_ferry | d1 | d2 | d3 | hs`) to the right column for the W17 counterfactual's "close the gap" target.

**Evidence it's complete:**
- Backed by real seeded data: `supabase/migrations/20260610170000_seed_lpga_standards.sql` and `20260622130000_pga_lpga_only_sg_baselines.sql`.
- Has its own dedicated test file, `src/test/coachhelm/v3/lpga-standards-selection.test.ts`, covering men's/women's routing, LPGA-missing fallback, and multiple metrics — but every single call in that test file is the *only* place any of these 5 functions are invoked anywhere in the repo.
- The module's own docstring names its intended production consumers explicitly: "W11 standing loader (`loadStandingForMetric`)" and "W17 counterfactual (`computeCounterfactual`)".

**Why it's unreachable:** Neither claimed consumer actually imports from this file.
- `src/lib/coachhelm/v3/standing/loader.ts` (the real W11 standing loader) imports `applyGenderAnchor` from `./gender-anchor.ts`, which in turn imports `cohortAnchor` from `../counterfactual/cohort-baselines.ts` — a **hand-authored, hardcoded table of only 12 metric IDs** with men's/women's value pairs (e.g. `scrambling_pct_sand: { mens: 50, womens: 38 }`), explicitly described in its own docstring as an *estimate* ("women's ... scaled to college-women by the same ratio men's-college sits below men's Tour (~0.92 on make %, ~0.88 on green-hit)").
- `src/lib/coachhelm/v3/counterfactual/compute.ts` (the real W17 counterfactual) also imports `cohortAnchor` from `cohort-baselines.ts`, not `pgaReferenceValue`/`cohortBaselineValue` from `pga-standards.ts`.
- `gender-anchor.ts`'s own docstring is explicit that this was a *deliberate* choice, not an oversight — it explains the pipeline is gender-blind by design and the override happens at the read layer using `cohort-baselines.ts` "so the [StandingBar] card is self-consistent" with the generators' prose, which also reads `cohort-baselines.ts`. It never mentions `pga-standards.ts` at all.
- I grepped the whole repo for `golf_pga_standards` outside `pga-standards.ts` and its test: the only other hits are unrelated readers (`stats-leak-maps.ts`, `putt-distance.ts`, `team-pattern-generator.ts`, `golf-stats-calculator-shots.ts`) — none of them route through the gender-aware loader either.

**Net effect:** the DB actually contains real, migrated LPGA benchmark data across every tracked metric, and a tested, correct loader to read it — but the product currently shows women's teams a 12-metric *approximation* table instead of the real measured LPGA numbers that are sitting in the database unused.

**Single change to make it reachable:** in `gender-anchor.ts`, have `applyGenderAnchor` consult `cohortBaselineValue(standard, tier)` (from a `loadStandardsForGender()` call, cached per team) as the primary source, falling back to `cohortAnchor()` only for the metrics `cohort-baselines.ts` covers that don't exist in `golf_pga_standards`. This is a genuine two-implementation situation the team needs to consciously choose between, not delete blindly — the hardcoded table has 2026-06-06-verified men's values and documented sourcing for its women's estimates, so reconciling the two needs a real decision, not just a swap.

---

### A2. Four analytics functions in an otherwise-live module never get called

**Files:** `src/lib/coachhelm/v2/shot-analysis/yardage-curves.ts`, `scoring-opportunities.ts`, `sequence-analysis.ts`

**What they do:**
- `compareYardageCurves(player, baseline)` — per-bucket delta between a player's yardage-performance curve and a baseline curve.
- `identifyScoringOpportunities(holes)` + `calculateConversionRate(...)` — flags realistic scoring chances (GIR birdie putt, reachable par 5, short par 4) and whether the player converted them.
- `detectCompoundingPatterns(shots, sgValues, threshold)` — finds streaks of 3+ consecutive bad shots (a "mental game collapse" signal), returning `CompoundingPattern[]`.

**Evidence it's complete:** These aren't stray helpers — they're formally exported from the module's own barrel, `src/lib/coachhelm/v2/shot-analysis/index.ts`, whose header explicitly advertises "Scoring opportunity conversion and scramble rates" and "Shot sequence / resilience analysis" as capabilities, alongside full `ScoringOpportunity` / `ScrambleAnalysis` / `CompoundingPattern` type exports.

**Why it's unreachable — verified, not assumed:** Per the audit instructions, I checked for dynamic imports before declaring zero callers, and found one: `src/app/golf/actions/team-category-insights.ts:519` does `await import('@/lib/coachhelm/v2/shot-analysis')`. So the module genuinely is live in production — via that dynamic import and a static import in `src/app/golf/actions/coachhelm-data.ts`. But both call sites destructure only a subset:
```
// coachhelm-data.ts
{ analyzeShotsByContext, rankWeaknessContexts, buildDefaultBaseline,
  buildYardageCurve, findDeadZones, analyzeSequenceEffects,
  calculateShotSG, calculateScrambleRate }
// team-category-insights.ts (dynamic import)
{ buildDefaultBaseline, buildYardageCurve, findDeadZones,
  analyzeShotsByContext, rankWeaknessContexts }
```
Neither list includes `compareYardageCurves`, `identifyScoringOpportunities`, `calculateConversionRate`, or `detectCompoundingPatterns`. (`calculateResilienceScore`, which I also flagged initially, turned out to be reachable — it's called internally by `analyzeSequenceEffects`, which *is* imported — so I'm not counting it here.) I confirmed with a repo-wide grep that none of these four identifiers is called anywhere outside their own declaration.

The pipeline currently computes a player's own yardage dead zones (`findDeadZones`) but never actually compares two curves head-to-head via `compareYardageCurves`. It computes scramble/sand-save rates (`calculateScrambleRate`) but never scoring-opportunity conversion. It detects sequence *resilience* but never compounding-error *streaks* specifically.

**Test coverage note (verified, not assumed complete):** the sibling functions that *are* used have real tests (`src/test/coachhelm/v2/shot-analysis/shot-level-sg.test.ts`, plus a property test). These four specific dead functions have **no test coverage** — I grepped `src/test` for each name and found zero hits. So "tested" applies to the module as a whole, not to these four functions individually; flag this if reachability work is prioritized, since there's no regression net for them yet.

**Single change to make it reachable:** add the four names to the existing destructure in `coachhelm-data.ts` (or `team-category-insights.ts`) and wire their outputs into whichever insight/card the product wants to surface them on — the data plumbing (rounds, shots, baseline) these two call sites already assemble is exactly what these functions need as input.

---

### A3/D1. A registered composite rule that can structurally never fire

**File:** `src/lib/coachhelm/v3/composite/rules/flyer-lie-over-the-green.ts`

**What it does:** Detects when a player's approach shots from light rough ("flyer lies") consistently overshoot the target — ≥10 attempts and average post-shot proximity worse than 35 ft — and generates a coaching insight about club selection.

**Evidence it's complete:** Full `CompositeRule` implementation (id, name, priority, category, `detect()` with real threshold logic, content/signal generation) and it **is registered** — it's referenced from `src/lib/coachhelm/v3/composite/synthesis.ts` and `src/lib/coachhelm/v3/composite/registry.ts`, and has a test, `src/test/coachhelm/v3/composite-w305.test.ts`.

**Why it's unreachable:** `const RULE_ENABLED = false;` gates the entire `detect()` function to `return null` unconditionally. This is self-documented as deliberate, not an oversight — the file's header explains that the supplemental loader filters `lie_before = 'light_rough'`, but `golf_shots`'s CHECK constraint only permits `tee|fairway|rough|sand|green|other|penalty` — `'light_rough'` is not a legal value, so the loader's result set is *structurally* always empty, and the author chose an honest `return null` over a rule that "silently depends on data that can never exist."

I'm reporting this because it matches the audit's Class D pattern exactly (a flag hardcoded `false`, a registered-but-dead feature) and because the fix is well-scoped and already documented in the file itself, even though the team's own choice to disable it was reasonable given the schema gap. It is not a bug to fix blindly — it needs the schema change first.

**Single change to make it reachable:** add rough-severity capture to the schema (e.g. a `light_rough`/`heavy_rough` split on `golf_shots.lie_before`, or a separate severity column), update the supplemental loader to select the flyer-prone subset, then flip `RULE_ENABLED` to `true`.

---

## B — Registered but not rendered (surface-registry vs. consumers)

I compared every non-`hidden` entry in `src/lib/golf/surface-registry.ts` against all 8 files that import from it (`FairwayDashboardShell.tsx`, `CoachHelmSubNav.tsx`, `CommandPalette.tsx`, `nav-registry.ts`, and the `coachhelm/chat`, `intelligence`, `coachhelm`, `stats` page files).

- **The given example (`ask`) is confirmed**, but as of this audit it's no longer an open gap: `CoachHelmSubNav.tsx` has an uncommitted local diff (see caveat at top) that adds `ask` to `COACH_TABS`, with a code comment describing the exact bug from the task brief in the past tense. I'm not counting this as a new finding since it's the given example, already being fixed.
- I found **no other instance** of a non-hidden, non-legacy entry that's undrawn, or a drawn tab with no registry entry. The `legacy: true, hidden: true` entries (`signals`, `insights`, `patterns`, `players-tab`, `effectiveness`, `development`, `my-development-tab`, `my-game-profile-tab`, `my-standing-tab`, `my-insights`) are still deliberately referenced by `CommandPalette.tsx` (so old search terms still resolve) and `FairwayDashboardShell.tsx`'s breadcrumb map (so a stale bookmark still gets a readable breadcrumb before its permanent redirect fires) — that's consistent with the documented "permanent redirect shim" design, not drift.

## C — Components reachable only via a type-only import

**None found.** I scanned all 791 PascalCase-named exported declarations across the 6 scoped directories (1,627 files) and checked, for each, whether every reference to its name outside its own file was either inside a test or inside a type-only import position (`import type { X }` or the inline `import { type X }` form). Zero candidates matched — every component that's imported anywhere outside a test is also imported as a runtime value somewhere. Caveat: this is a regex-based heuristic, not a type checker, so it can miss re-exports through non-obvious aliasing; treat this as "nothing surfaced," not "provably zero."

## D — Feature flags that can never be true in production

Besides A3/D1 above (the only real hit), I checked `WeightDistributor.tsx` and the CoachHelm ingest adapters (`garmin.ts`, `trackman.ts`) since they looked like flag-gated stubs. Both turned out to be **honest, intentional placeholders, not findings**:
- `src/components/golf/coachhelm/settings/WeightDistributor.tsx` — its own docstring (tagged `F062 / F115`) explains the 5 comparison-weight sliders persist to `golf_coach_philosophy` but have zero consumers (no roster-comparison code reads them), so the team deliberately suppressed the interactive control and shows a "coming soon" message instead, rather than "ship a placebo." This is the *opposite* of the bug pattern this audit hunts for — it's a team correctly refusing to expose a dead control.
- `src/lib/coachhelm/v3/ingest/providers/garmin.ts` / `trackman.ts` — explicitly labeled "W40 stub" with numbered wiring instructions in the header; `isConfigured()` honestly reports `false` until real OAuth credentials exist. Not a finished feature — an intentionally incomplete stub.

---

## Genuinely dead, safe to delete (low value — not padding the list above)

All of the following were verified to have a real, currently-used replacement, confirmed via docstrings that explicitly narrate the redesign plus a grep showing zero non-test callers of the old code:

| Component/export | Superseded by |
|---|---|
| `FairwayEffectiveness.tsx` (1,800-line "instrument cockpit") | `EffectivenessScoreboard.tsx` / `TriageDesk.tsx` |
| `FairwayPlayerCoachHelm.tsx` | `PlayerCoachHelmHome.tsx` |
| `TrendDashboard.tsx` (player coachhelm) | `FairwayTrendBrain.tsx` |
| `ThresholdSlider.tsx` (coachhelm/settings) | inline `<Slider>` primitive in `FairwaySettingsCoachingIntelligence.tsx` |
| `ScanTeamControl.tsx`, `SignalsToolbar.tsx` | `SignalQueue`/`SignalDossier` (Signals drill consolidation) |
| `InsightListView.tsx` (`/dashboard/insights` coach surface) | the consolidated `?view=signals&filter=insights` drill (route now permanently redirects) |
| `RosterToolbar.tsx` (the toolbar component itself — its `exportRosterCSV` sibling export IS still used) | `FairwayCoachRoster.tsx`'s own inline `Segmented<SortField>` sort control + export button |
| `RSVPRow` (`hub-parts.tsx`) | Calendar's own RSVP UI (`FairwayEventDetailDrawer.tsx`/`FairwayCalendar.tsx`, `onRSVP`/`updateRSVP`). Note: `FairwayPlayerDashboard.tsx`'s own code comment claims the Hub's RSVP surface "still lives at Team Hub and Calendar" — I checked `FairwayTeamHub.tsx` and it has **zero** RSVP-related code, so that half of the comment is itself stale. Not flagging as a full finding since Calendar's real RSVP UI does cover the same user-facing capability. |
| `PerformancePrediction.tsx` (the polished prediction card with tail-risk breakdown + empty state) | `PlayerCoachHelmHome.tsx`'s condensed `buildPredictionVerdict`/`formatPredictionHero` inline rendering. Some detail (tail-risk probabilities, itemized key factors) exists only in the unused component — worth a look if that detail is wanted back, but not clearly a bug. |
| `formatSuggestedTime` (exported, `src/lib/calendar/conflicts.ts`) | a private, functionally-equivalent `formatSuggestedTime` inside `ConflictWarning.tsx` |
| `patternsToSignalRows`, `suggestedMetrics` (function wrapper, as opposed to the `.suggestedMetrics` property that's actually used) | ambiguous/barrel-only re-exports; lower confidence, not fully chased down |

## Correction to the task's given examples

- **`findCommonAvailability`** (`src/lib/calendar/availability.ts`) is **not** unreachable. Traced the full chain: `checkEventConflicts` (`conflicts.ts:56`) calls it twice (same-week + next-week fallback) → the `checkScheduleConflicts` server action (`src/app/golf/actions/golf.ts`, wrapped `withAdminObserved`) calls `checkEventConflicts` → both `FairwayEventEditor.tsx:368` and `EventDetailModal.tsx:556` call `checkScheduleConflicts` from the event-creation UI. This is a live, wired "detect conflict → suggest alternate times" feature. I'm flagging this because the task brief stated this function "has ZERO callers anywhere," and it doesn't in this checkout — worth resolving whether that was ever true or whether it was fixed since (git status shows no uncommitted changes to `conflicts.ts`/`availability.ts`, so if it was fixed, it's already committed history, not in-flight).

---

## Notes on method

- Started from `npx knip` (config at `knip.json`; entry = `src/app/**`, project = `src/**`), which flagged 143 non-type, non-barrel unused exports and 1,118 unused types in scope. Knip's type-export number is dominated by legitimate `export type` re-export chains; I did not hand-verify all 1,118, only the ones a keyword pass (component-shaped names, feature-suggestive docstrings) surfaced.
- Every finding above was independently re-verified with `grep` after knip flagged it — several initially-promising candidates (`FairwayEffectiveness`, `TrendDashboard`, `RosterToolbar`, `RSVPRow`, `PerformancePrediction`, `ThresholdSlider`, `WeightDistributor`, `requiresDataGrounding`) turned out on inspection to be either superseded-by-redesign (dead but not "unreachable feature") or intentional stubs, and are listed in the low-value/verified-intentional sections instead of padded into the high-value list.
- Checked for dynamic `await import(...)` before declaring any zero-caller verdict (this is what caught A2's `shot-analysis` barrel actually being live).
