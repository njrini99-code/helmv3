# Fairway CoachHelm Rebuild — Hierarchical Insight Model (saved plan)

> **Status:** designed, NOT built. Parked for a future session ("when I have more tokens").
> **Source:** grounded design from a 4-agent investigation (shot data · stats/SG engine · CoachHelm insight engine · golf-domain causal chains) + synthesis. All file:line refs verified against the repo at save time.
> **Goal (user, verbatim intent):** replace the flat ranked "signal" feed with a few **medium/large THEME insights tied to a strokes-gained category**, each **cascading to direct causes** down to **root shot-level drivers**, usable as a **development plan**. Meaningful for *every* player. Use the rich per-shot data (distance/shot-type awareness, miss bias, lie, bottlenecks).

---

## The unlock

The engine **already produces the cascade** — the read path throws it away:

- Every insight already carries `evidence.counterfactual.strokes_saved_per_round` (a real per-cause stroke value) — `counterfactual/compute.ts:65`, `generator-base.ts:113-142`.
- The 10 **composite** rules already store `evidence.source_insight_ids[]` — the de-facto **parent→child edges** naming the exact leaf insights a cascade was built from (`synthesis.ts:114-118`).
- `getInsightsForCoach/Player` **dedupes siblings by `player:category:metric`** (`insight-delivery.ts:442-456`) — which *collapses* exactly the structure we want.

So v1 is mostly a **read-time assembler + ThemeCard UI**. **No new shot computation, no schema change** for Phase 1.

---

## The model — THEME → DIRECT CAUSE → ROOT DRIVER → DEVELOPMENT PLAN

A **theme** = one of the 7 SG-aligned `category` buckets (`v2/insights/types.ts:13-20`), anchored on its SG headline metric (`registry.ts:20-25`) and sized by per-round SG (`GolfStats.sg{Putting,Approach,Tee,AroundGreen}PerRound`, `golf-stats-calculator-shots.ts:2080-2084`; also `golf_rounds.strokes_gained_*`) cross-checked vs the **SUM of `counterfactual.strokes_saved_per_round`** across that category's child rows. Causes ranked by `counterfactual.strokes_saved` (NOT the frequently-zero `strokes_impact`).

Fixed scaffold (never blank): **Putting · Approach · Off-the-Tee · Around-the-Green** + two outcome themes **Big Numbers (Scoring)** and **Pressure**.

### Putting — "Putting is costing ~{x} strokes/round"
- **Cause:** 3-putt {n}% of greens, almost all from outside 25 ft (lag, not line). `metric: putts_made_25_plus_ft_pct + threePuttsPerRound` (calc:1911-1931). Trigger: 3-putt% above college ~5-7% AND `puttProximity20Plus` leave >3 ft. **Root:** lag speed 25-40 ft (`firstPuttDistance/Leave`, calc:816-824; composite `lag_distance_3putt`). **Drill:** `putts_made_25_plus_ft_pct` → 30-ft lag to 3-ft circle.
  - **GAP:** `PuttDistanceGenerator` only ships 3 of 5 buckets (skips 15-25 & 25+, `putt-distance.ts:18-20`); no per-round putt-distance cache → no trend.
- **Cause (diagnostic-only):** miss short putts left/right (face/path) or under-read break (miss low). `puttMissLeft/Right/Low/HighPct` (calc:1993-1999), `puttingByBreak[*]` (calc:2040-2066). **Root:** 3-8 ft face control. **NOTE:** counterfactual=0 for bias metrics (`lookup-tables.ts:57-60`) → CAUSE detail, never the headline number.

### Approach — "Approach play is costing ~{x} strokes/round"
- **Cause:** {150-175} yd approaches finish ~{p} ft vs Tour ~{b} ft. `approachProx*` (calc:2086-2148) / `approach_proximity_*`. Trigger: band > PGA anchor (50-125=18ft, 125-175=30ft, 175+=45ft). Biggest college gap = 75-125 wedge proximity. **Root:** wedge distance control / long-iron dispersion (composite `long_approach_3putt_cascade` names children via `source_insight_ids`). **GAP:** `ApproachMissGenerator requiresStanding=false` → no PGA-anchored stroke number; some proximity metrics lack drill rows.
- **Cause:** misses biased short-right + GIR collapses from rough. `approachMiss{8-way}Pct` + `girPctFromFairway/Rough/Sand`. **Root:** short-siding into worse lie. **GAP:** `approach_miss_details` (lie_type, short-side, distance_from_green) is fetched but **unused** by the core calculator (`stats-data.ts:988-993`); richer logic only in `v2/approach-analytics.ts:261-412`.

### Off-the-tee — "Off-the-tee is costing ~{x} strokes/round"
- **Cause:** miss {right} on {70}% of tee shots + high penalty rate. `missLeft/RightPct` + `fairwayPctPar4/Par5` + `penaltiesPerRound`; `penalty_rate_per_round` is the **fastest fix** (1.5 strokes/unit @ 2 wks). **Root:** driver dispersion vs layback EV (`fairwayPctDriver` vs `NonDriver` gap; `TeeStrategyGenerator` laggy/sharp classifier, `tee-strategy.ts:102-138`). **Drill:** decision rule "default 3W/hybrid on tight holes" (cuts penalty 60-70%). **GAP:** penalty not attributed to the tee shot specifically (`tee-club-mismatch` composite deferred).

### Around-the-green — "Around-the-green is costing ~{x} strokes/round"
- **Cause:** sand saves ~{22}% vs college ~40%; long chips (20-30 yd) leak. `sandSavePercentage` + `scramblingPctFairway/Rough/Sand` + `scramblingPct0_10/10_20/20_30` + `atgEfficiencyByDistanceLie` (calc:2189-2248). **Root:** splash distance control + short-side technique (composite `short_side_scrambling_chain`). **GAP:** `ScramblingGenerator` ships SAND only; attribution mismatch (input tags ≤30 yd vs calc counts 50 yd-from-hole, `use-shot-state-machine.ts:866` vs calc:471-486).

### Big Numbers (Scoring) — "Big numbers are costing ~{x} strokes/round (the #1 70s-vs-80s separator)"
- Outcome theme (not an SG field); sized by `big_number_rate × ~1.0` + penalty. `doublePlusPerRound` + `scoringByPar.par4.doublePlus`. **Cause:** double-or-worse on {1.4} holes/round, mostly par-4s, most starting with a penalty (70% of doubles, domain doc:161-165). **Root:** OTT penalty + recovery discipline + over-correction after bogey (composite `doubles_after_bogey`). **This theme CHAINS into the Tee + Approach themes** (the "tied together" payoff).

### Pressure — "You play ~{x} strokes worse under pressure than in practice"
- Outcome/context theme. `practiceScoringAvg` vs `qualifyingScoringAvg` vs `tournamentScoringAvg` (calc:1861-1863); `practice_tournament_delta` + `opening_hole_delta`. Needs ≥3 rounds each cohort. **Root:** routine breakdown → decel on 4-8 ft + tentative wedges (composites `closing_hole_fatigue`, `front_9_starter`, `pressure_decel_chain`). **FORBIDDEN:** "clutch"/"mental toughness" labels (domain doc:352). **GAP:** between-cohort, not per-round → no trend.

---

## Development-plan mapping (zero new schema)
Each cause carries `evidence.metric` (a canonical `MetricId`). The cause CTA **"Make this a focus area"** → existing `createFocusAreaFromInsight(development.ts:642)` with `target_metric = evidence.metric`, `current_value = standing.player_value`, `target_value = computeTargetValue` (midpoint to baseline, `suggestion-writer.ts:139`). Player accept-flow: existing `golf_goal_suggestions → golf_goals → Practice-Rx` 7-day plan already filters `golf_drills.impacts_metric_id = goal.metric_id` (`practice-rx/composer.ts:128`). Drills already attached per leaf via `golf_insight_drill_attachments` (`insight-delivery.ts:146-157`, capped 3) render as the plan leaf (`DrillChips`). Fallback: causes whose metric has no drill rows show "no drill yet — talk to your coach" instead of a broken CTA.

## Reuse verbatim
`golf_coach_insights.category` (theme key) · `evidence.metric` · `evidence.counterfactual.{strokes_saved_per_round,projected_score,weeks_to_typical_close}` · `evidence.standing{player_value,team_avg,team_pct,pga_value,pga_delta}` · `evidence.source_insight_ids[]`+`composite_rule_id` (the parent→child edge) · `InsightCard.tsx`/`EvidencePanel.tsx`/`StandingBar`/`CounterfactualLine.tsx`/`DrillChips`/`HubInsightSignalCard.tsx` · `getInsightsFor{Player,Coach}` (insight-delivery.ts:251,377) · `GolfStats.sg*PerRound` + `golf_rounds.strokes_gained_*` · 10 composite rules + 9 Tier-1 generators · `createFocusAreaFromInsight` + Practice-Rx composer · `COUNTERFACTUAL_LOOKUP`+`COUNTERFACTUAL_SUPPRESS_THRESHOLD 0.3`.

## UI blueprint
Replace the flat `InsightCard` list with a fixed scaffold of **THEME CARDS** (one per category + 2 outcome themes), ordered by summed counterfactual magnitude (the rate-limiting theme floats up). Lives on: player `/dashboard/coachhelm`, coach `/dashboard/insights`, condensed top-theme on Player Hub via `HubInsightSignalCard` — and the Player Insight "Where to focus" section. **ThemeCard** (new, wraps `Card` + `StandingBar/Hero` + `CounterfactualLine`): headline + small SG bar (player vs **college baseline** vs Tour ceiling) + magnitude pill. **Expand → CAUSE CASCADE**: `InsightCard density='compact'` rows reading as sentences; each expands once more to **ROOT DRIVER** (composite prose via `source_insight_ids`, or shot-level detail: `PuttHeatmap` / approach-miss grid / driver-vs-non-driver split). Plan leaf = inline `DrillChips` + one "Make it a plan" CTA per cause. Thin/strength states render inside the same scaffold (never blank).

## Gaps to close (Phase 2 fast-follows, not blockers)
1. **No theme rollup** today — must build the per-category counterfactual aggregator (degrade to `sg*PerRound`, then qualitative).
2. **No `parent_insight_id`/`theme_id` column** — Phase 1 assembles at read-time; Phase 2 optionally persists.
3. **Replace the sibling dedup** (`insight-delivery.ts:442-456`) with grouping (keep within-cause dedup).
4. Standing+counterfactual only on v3 rows; ~15 of 28 metrics have standing; `requiresStanding=false` generators get no stroke number → diagnostic-only.
5. `mapRowToEvidenceInsight` hard-drops rows missing `strokes_impact/confidence/metric` (`insight-delivery.ts:588-590`) — rank by counterfactual first.
6. Wire fetched-but-unused `approach_miss_details` (lie/short-side) + `putt_details` (miss tags/break) into the driver layer.
7. **Reconcile band edges** to ONE set (calc putt bands vs leak-map/registry vs the user's "25 ft" line; approach bands too) before nesting.
8. Pick ONE baseline source per card — **college-primary, Tour ceiling** (domain doc:349-350; generators currently hard-code PGA).
9. **No per-category trend** — needs a per-period recompute (Phase 2).
10. Penalty not attributed to a shot phase (tee-club-mismatch composite deferred).
11. **Every-player guarantee:** always render the SG-category themes as scaffold; no-data category → "log N more rounds / tag your putt misses" stub at low confidence; strong category → green "strength" state.

## Implementation steps (ordered)
1. `src/lib/coachhelm/v3/themes/taxonomy.ts` — map 7 `InsightCategory` → `{sgMetricId, displayLabel, isOutcomeTheme}`; reuse `METRIC_RENDER_CONFIG`.
2. `src/lib/coachhelm/v3/themes/assemble.ts` — pure assembler: group by category; `themeStrokes = max(|sg*PerRound|, SUM child counterfactual)`; rank causes by counterfactual desc; thread composites (row with `source_insight_ids` → cause whose driver children are the referenced leaves, removed from top level). Output `ThemeNode[]`. Unit-test with fast-check.
3. `insight-delivery.ts` — add `getThemesFor{Player,Coach}` reusing `INSIGHT_SELECT` + auth + drill join; fetch per-category SG via `getDetailedStatsAsAdmin` or `golf_rounds.strokes_gained_*`; call `assemble()`. Leave legacy fetchers intact during migration.
4. Replace sibling dedup with grouping inside the new path only.
5. Theme magnitude+suppression helper (reuse `computeCounterfactual` + 0.3 threshold) → thin/strength states.
6. `src/components/golf/coachhelm/v3/ThemeCard/` — wraps `Card` + `StandingBar/Hero` + `CounterfactualLine`; `CauseCascade` lazy-renders driver detail.
7. Wire "Make it a plan" → `createFocusAreaFromInsight` (coach) / goal-suggestion→Practice-Rx (player), `target_metric = evidence.metric`.
8. Mount on player `/coachhelm` + coach `/insights` + Hub condensed; **flag-gated** so the flat feed can fall back.
9. GAP-CLOSER: wire `approach_miss_details` + `putt_details` drivers; reconcile bands; switch defaults to college baseline.
10. Regression tests (assembler grouping, magnitude precedence, composite-as-cause threading, degradation states) + `npm run typecheck` + `npm test`.
