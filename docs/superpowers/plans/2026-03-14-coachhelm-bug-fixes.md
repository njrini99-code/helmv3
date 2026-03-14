# CoachHelm Bug Fix Plan — All Audit Findings

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Fix all critical, high, and medium bugs found across 4 audit teams. Zero issues remaining.

**Agent Split:** 4 parallel agents, each owns specific files with zero overlap.

---

## Agent 1: Engine Core Fixes

**Files owned:**
- `src/lib/coachhelm/v2/trends/multi-window.ts`
- `src/lib/coachhelm/v2/stats/baselines.ts`
- `src/lib/coachhelm/v2/stats/anomaly-detector.ts`
- `src/lib/coachhelm/v2/stats/percentiles.ts`
- `src/lib/coachhelm/v2/shot-analysis/sequence-analysis.ts`
- `src/lib/coachhelm/v2/shot-analysis/scoring-opportunities.ts`
- `src/lib/coachhelm/v2/simulation/scenario-engine.ts`
- `src/lib/coachhelm/v2/feedback/coach-behavior.ts`
- `src/lib/coachhelm/v2/feedback/insight-scorer.ts`
- `src/lib/coachhelm/v2/feedback/confidence-calibrator.ts`

### CRITICAL 1: Trend polarity inverted for golf scores
- **File:** `trends/multi-window.ts`, line 121
- **Bug:** `classifyDirection()` treats positive slope as 'improving', but for score_to_par, positive slope = scores getting higher = WORSE
- **Fix:** Add a `lowerIsBetter` parameter to `analyzeMultiWindowTrends()`. When true, invert the slope before classifying direction. Update the function signature:
```typescript
export function analyzeMultiWindowTrends(values: number[], metric: string, lowerIsBetter = false): MultiWindowAnalysis
```
In `classifyDirection`, if `lowerIsBetter`, negate the slope:
```typescript
const effectiveSlope = lowerIsBetter ? -slope : slope;
```
Update all callers to pass `lowerIsBetter: true` for score_to_par and putts metrics.

### HIGH: Population variance → sample variance in baselines
- **File:** `baselines.ts`, lines 92-93
- **Bug:** Uses N denominator instead of N-1 (Bessel's correction)
- **Fix:** Change `values.length` to `Math.max(values.length - 1, 1)` in stdDev calculation

### HIGH: IQR division by zero when IQR=0
- **File:** `anomaly-detector.ts`, lines 77-79
- **Bug:** When all values are identical, IQR=0, causing division by zero → Infinity/NaN
- **Fix:** Add guard: `if (iqrResult.iqr === 0) return [];` before the deviation calculation

### MEDIUM: percentiles.ts missing threePuttsPerRound
- **File:** `percentiles.ts`, lines 25-32
- **Fix:** Add `'threePuttsPerRound'` and `'penaltyStrokesPerRound'` to LOWER_IS_BETTER set

### MEDIUM: sequence-analysis docstring mismatch
- **File:** `sequence-analysis.ts`, lines 55-62
- **Fix:** Update docstring to match actual formula (additive, not ratio)

### MEDIUM: scoring-opportunities double-counting
- **File:** `scoring-opportunities.ts`, lines 67-88
- **Fix:** When creating `reachable_par5` opportunity, skip creating the duplicate `gir_birdie_chance` for the same hole

### MEDIUM: scenario-engine priority overwritten
- **File:** `scenario-engine.ts`, lines 217-218
- **Fix:** Keep both: `priorityRatio` (the computed value) and `priorityRank` (the ordinal). Update the type to include both.

### HIGH: recordAction writes to wrong table
- **File:** `feedback/coach-behavior.ts`, line 149
- **Bug:** Writes to `golf_coach_actions` which doesn't exist. Should be `golf_coach_behavior_log`
- **Fix:** Change table name from `'golf_coach_actions'` to `'golf_coach_behavior_log'`. Also check `queryActions` for the same issue.

### MEDIUM: insight-scorer feedback has only 3 discrete outcomes
- **File:** `feedback/insight-scorer.ts`, lines 128-133
- **Fix:** Add gradual scaling: `adjustment = (actionRate - 0.5) * 0.4` for a continuous range of -0.2 to +0.2

### LOW: confidence-calibrator brierScore never updated
- **File:** `feedback/confidence-calibrator.ts`, line 138
- **Fix:** Compute and update brierScore in updateCalibrationRecord using the bucket data

---

## Agent 2: Server Action + Data Pipeline Fixes

**Files owned:**
- `src/app/golf/actions/coachhelm-data.ts`
- `src/app/golf/actions/team-category-insights.ts`
- `src/app/golf/actions/insights.ts` (only the triggerPlayerInsightsAfterRound section + scoring)
- `src/lib/coachhelm/v2/orchestrator.ts`

### CRITICAL 2: Putting distances double-converted
- **File:** `coachhelm-data.ts`, lines 618-624
- **Bug:** ALL distances converted from feet to yards, but shot-level-sg.ts expects FEET for green lies
- **Fix:** Don't convert when lie is 'green':
```typescript
distanceBefore: shot.lie_before === 'green'
  ? (shot.distance_to_hole_before ?? 0)  // Keep in feet for putting
  : shot.distance_unit_before === 'feet'
    ? (shot.distance_to_hole_before ?? 0) / 3
    : (shot.distance_to_hole_before ?? 0),
```
Same for distanceAfter with lieAfter.

### HIGH: Orchestrator voids V3 results
- **File:** `orchestrator.ts`, lines 208-217
- **Bug:** `analyzeMultiWindowTrends`, `detectAnomalies`, `detectStreaks` results are discarded with `void`
- **Fix:** Capture results and include in the returned `PlayerAnalysis`:
```typescript
const trendAnalysis = analyzeMultiWindowTrends(scoreToPars, 'scoreToPar', true);
const anomalies = scoreBaseline ? detectAnomalies(scoreToPars, scoreBaseline, 'scoreToPar') : [];
const streaks = detectStreaks(scoreToPars, scoreBaseline?.ewma ?? 0);
```
Add these to the returned object. Update the `PlayerAnalysis` type in `types.ts` if needed (add optional `trendAnalysis`, `anomalies`, `streaks` fields).

### HIGH: Insight scoring always passes 'pattern' + empty feedback
- **File:** `orchestrator.ts`, lines 233-239
- **Fix:** Pass the actual insight type (derive from insight data) and pass real feedback history if available:
```typescript
const insightType = insight.insightType ?? (insight.data?.type as string) ?? 'pattern';
scoreInsight(insight.confidence, insight.strokeImpact ?? 0, insightType, [])
```

### MEDIUM: team-category-insights short game always 'stable'
- **File:** `team-category-insights.ts`, lines 157-160
- **Fix:** Use `strokes_gained_around_green` from stats cache as a proxy for short game trend. If not available per-round, show a distinct "trend unavailable" indicator by returning `trend: 'unknown'` (add to the type).

### MEDIUM: coachhelm-data.ts and team-category-insights.ts don't log errors
- **Fix:** Add `logServerError()` calls in each catch block of both files

### LOW: N+1 query in getPlayerWhatIf
- **File:** `coachhelm-data.ts`, lines 907-941
- **Fix:** Batch fetch all team members' rounds in single `.in('player_id', playerIds)` query

### LOW: birdieRate/bogeyAvoidance hardcoded to 0
- **File:** `coachhelm-data.ts`, lines 282-283
- **Fix:** Remove these from STAT_METRICS since they can't be computed from stats_cache

---

## Agent 3: Player UI Fixes

**Files owned:**
- `src/components/golf/coachhelm/player/PerformancePrediction.tsx`
- `src/components/golf/coachhelm/player/AIInsightsPanel.tsx`
- `src/components/golf/coachhelm/player/FocusAreasGrid.tsx`
- `src/components/golf/coachhelm/player/CompositeRatingCard.tsx`
- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx`
- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerStateCard.tsx` (DELETE if unused)
- `src/app/golf/(dashboard)/dashboard/my-development/page.tsx`

### CRITICAL 3: Prediction icon backwards
- **File:** `PerformancePrediction.tsx`, lines 49, 65-68
- **Bug:** Shows down arrow when prediction is good (under par), up arrow when bad
- **Fix:** Swap: `IconTrendingUp` for `isPositive` (under par), `IconTrendingDown` for over par

### HIGH: FocusAreasGrid onAreaClick does nothing
- **File:** `FocusAreasGrid.tsx`, line 165
- **Fix:** When no `onAreaClick` provided, remove button/clickable styling. Change `<button>` to `<div>` when not interactive, or navigate to My Development page.

### MEDIUM: CompositeRatingCard shows 50 for categories but 0 for composite when no data
- **File:** `CompositeRatingCard.tsx`, line 84
- **Fix:** Show an empty state instead of contradictory 0/50 values when no profile data exists

### MEDIUM: AIInsightsPanel "View all insights" loops back to same page
- **File:** `AIInsightsPanel.tsx`, line 329
- **Fix:** Change link to expand the list in-place rather than navigate. Add `showAll` state toggle.

### MEDIUM: PlayerStateCard is dead code
- **File:** `PlayerStateCard.tsx`
- **Fix:** Delete the file (it's never imported after the dashboard refactor)

### MEDIUM: My Development getProgressPercent fails for 0 or negative targets
- **File:** `my-development/page.tsx`, lines 94-97
- **Fix:** Check `current == null` instead of `!current`. Add logic for "lower is better" metrics.

### MEDIUM: framer-motion import inconsistency (motion vs m)
- **All player components:** Switch `import { motion }` to `import { m }` for consistency and bundle size

---

## Agent 4: Coach UI Fixes

**Files owned:**
- `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx`
- `src/app/golf/(dashboard)/dashboard/players/[playerId]/player-insight-client.tsx`
- `src/components/golf/coachhelm/coach/CategoryDrillDown.tsx`
- `src/components/golf/coachhelm/coach/TeamCategoryView.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` (if accessible)

### HIGH: Acknowledge/Dismiss buttons non-functional on per-player insights
- **File:** `player-insight-client.tsx`, lines 524-532
- **Fix:** Wire up server actions. Import `acknowledgeComposedInsight` and `dismissComposedInsight` from insights.ts. Add onClick handlers that call these actions and update local state.

### HIGH: 9-hole fairway/GIR normalization wrong
- **File:** `players/[playerId]/page.tsx`, lines 274, 280
- **Bug:** Hardcodes 14 fairways and 18 GIR opportunities regardless of holes played
- **Fix:** Fetch `total_fairways` and `total_gir_possible` from rounds. Use actual values:
```typescript
const fairwayPct = fairwayRounds.reduce((s, r) => s + (r.fairways_hit ?? 0), 0) /
                   fairwayRounds.reduce((s, r) => s + (r.total_fairways ?? 14), 0) * 100;
```

### HIGH: CategoryDrillDown default format appends % to non-percentage metrics
- **File:** `CategoryDrillDown.tsx`, lines 66-67
- **Fix:** Pass `formatValue` from TeamCategoryView based on category definition. Each category already has a `format` function in the server action — surface it to the UI.

### MEDIUM: Short game category breakdown is synthetic (average of other categories)
- **File:** `players/[playerId]/page.tsx`, line 294
- **Fix:** Label as "Estimated" or use strokes_gained_around_green from stats cache if available

### MEDIUM: Handicap format may confuse (+ prefix)
- **File:** `player-insight-client.tsx`, lines 126-130
- **Fix:** Don't prefix positive handicap values with +. Only prefix scratch/plus handicaps.

### MEDIUM: round_date should be used instead of created_at for display
- **File:** `player-insight-client.tsx` or page.tsx
- **Fix:** Order by `round_date` and display `round_date` instead of `created_at`

### HIGH: No auth check on round review page
- **File:** `rounds/[id]/review/page.tsx`
- **Fix:** Add `.eq('player_id', currentPlayerId)` to the round fetch query, or validate ownership server-side

---

## Execution Order

All 4 agents run in parallel — zero file overlap.

After all complete:
1. Run `npx tsc --noEmit` to verify no type errors
2. Stage all changes
3. Wait for push signal
