# CoachHelm Analytics Engine Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform CoachHelm from a pattern-matching engine into an elite statistical analytics platform with Z-score composites, multi-window trends, percentile rankings, Monte Carlo simulation, shot-level strokes gained, and a self-improving feedback loop.

**Architecture:** New modules are added to `src/lib/coachhelm/v2/` alongside existing code. The existing orchestrator imports and calls the new modules. Existing mining/prediction code stays — new systems layer on top. Each sub-plan is independent and can be built in parallel.

**Tech Stack:** TypeScript, Supabase (PostgreSQL), server-side math (no ML, no external APIs).

---

## File Structure

### New Files to Create

```
src/lib/coachhelm/v2/
├── stats/                          # NEW: Statistical foundation
│   ├── index.ts                    # Exports
│   ├── z-score.ts                  # Z-score normalization + composite ratings
│   ├── baselines.ts                # Rolling baselines with exponential decay
│   ├── percentiles.ts              # Percentile rankings (intra-team, cross-platform)
│   └── anomaly-detector.ts         # Enhanced anomaly detection (IQR, volatility, rate-of-change)
│
├── trends/                         # NEW: Multi-window trend analysis
│   ├── index.ts                    # Exports
│   ├── multi-window.ts             # Fast/medium/slow window trend detection
│   ├── streak-detector.ts          # Streak detection + composition + historical resolution
│   └── regression-to-mean.ts       # Regression to mean detector
│
├── shot-analysis/                  # NEW: Deep shot-level analytics
│   ├── index.ts                    # Exports
│   ├── shot-level-sg.ts            # Shot-level strokes gained by lie/distance/club
│   ├── yardage-curves.ts           # Yardage-specific performance curves
│   ├── dispersion.ts               # Dispersion centroid, spread, directional bias
│   ├── sequence-analysis.ts        # Shot N → N+1 conditional performance
│   └── scoring-opportunities.ts    # Opportunity conversion + scramble tracking
│
├── simulation/                     # NEW: Monte Carlo + projections
│   ├── index.ts                    # Exports
│   ├── monte-carlo.ts              # Tournament/lineup Monte Carlo simulation
│   └── scenario-engine.ts          # What-if improvement projections
│
├── feedback/                       # NEW: Self-improving loop (replaces stubs)
│   ├── index.ts                    # Exports
│   ├── confidence-calibrator.ts    # REPLACE: reasoning/confidence-calibrator.ts
│   ├── outcome-tracker.ts          # REPLACE: learning/outcome-validator.ts
│   ├── insight-scorer.ts           # Feedback-driven insight scoring
│   └── coach-behavior.ts           # Coach usage analytics
```

### Existing Files to Modify

```
src/lib/coachhelm/v2/
├── orchestrator.ts                 # Wire new modules into pipeline
├── types.ts                        # Add new type definitions
├── mining/stats-insight-generator.ts # Replace hardcoded benchmarks with z-score baselines
├── reasoning/confidence-calibrator.ts # Redirect to feedback/confidence-calibrator.ts
├── learning/outcome-validator.ts     # Redirect to feedback/outcome-tracker.ts
```

### Database Migration

```
supabase/migrations/20260314200000_coachhelm_engine_v3.sql
```

New tables: `golf_player_baselines`, `golf_percentile_cache`, `golf_prediction_validations`, `golf_insight_feedback_scores`

---

## Sub-Plan A: Statistical Foundation (`stats/`)

### Task A1: Z-Score Normalization + Composite Ratings

**Files:**
- Create: `src/lib/coachhelm/v2/stats/z-score.ts`
- Create: `src/lib/coachhelm/v2/stats/index.ts`
- Modify: `src/lib/coachhelm/v2/types.ts` (add types)

**What it does:**
- Takes any set of player metrics and normalizes to Z-scores using group mean + stddev
- Produces composite player ratings (0-100 scale) from weighted Z-score sums
- Sub-composites by category: tee game, approach, short game, putting, scoring
- Coach philosophy weights applied to composite calculation

**Key functions:**
```typescript
// z-score.ts
export function calculateZScores(values: number[]): { mean: number; stdDev: number; zScores: number[] }
export function normalizePlayerMetrics(players: PlayerMetrics[], metrics: string[]): PlayerZScores[]
export function computeCompositeRating(zScores: Record<string, number>, weights?: Record<string, number>): number
export function computeCategoryRatings(zScores: Record<string, number>): CategoryRatings
```

**Implementation:**
- Z-score: `(value - mean) / stdDev` for each metric
- Composite: Sum weighted Z-scores, rescale to 0-100 via `50 + (sum * 10)`
- Category groupings: `tee: [drivingDistance, fairwayPct, sgOffTee]`, `approach: [girPct, sgApproach, proximityToHole]`, etc.
- Handle edge cases: stdDev = 0 (all same value), fewer than 3 players (not enough for meaningful Z-scores)

- [ ] Create `stats/z-score.ts` with `calculateZScores()`, `normalizePlayerMetrics()`, `computeCompositeRating()`, `computeCategoryRatings()`
- [ ] Create `stats/index.ts` exporting all
- [ ] Add `PlayerZScores`, `CategoryRatings`, `CompositeRating` types to `types.ts`

---

### Task A2: Rolling Baselines with Exponential Decay

**Files:**
- Create: `src/lib/coachhelm/v2/stats/baselines.ts`

**What it does:**
- Per-player exponentially weighted moving averages for every metric
- Recent rounds weighted more heavily (configurable decay factor)
- Seasonal baselines (fall vs spring) tracked separately
- Outputs "current baseline" that adapts as new data arrives

**Key functions:**
```typescript
export function calculateEWMA(values: number[], decayFactor?: number): number
export function buildPlayerBaseline(rounds: RoundData[], options?: BaselineOptions): PlayerBaseline
export function compareToBaseline(currentValue: number, baseline: PlayerBaseline, metric: string): BaselineComparison
```

**Implementation:**
- EWMA: `alpha * latest + (1 - alpha) * previous_ewma`, default alpha = 0.15 (gives ~90% weight to last 15 rounds)
- Store per-player baselines: mean, stdDev, ewma, trend slope, volatility
- Seasonal split: tag rounds by semester, build separate baselines
- `BaselineComparison` returns: deviation from baseline, whether it's significant (>1 stdDev), direction

- [ ] Create `stats/baselines.ts` with EWMA calculation, player baseline builder, comparison function
- [ ] Add `PlayerBaseline`, `BaselineOptions`, `BaselineComparison` types

---

### Task A3: Percentile Rankings

**Files:**
- Create: `src/lib/coachhelm/v2/stats/percentiles.ts`

**What it does:**
- Intra-team percentiles (rank within their team)
- Cross-platform percentiles (rank against all players in system)
- Competitive-level percentiles (rank against peers at same division)
- Historical percentiles (current vs all-time at this point in season)

**Key functions:**
```typescript
export function calculatePercentile(value: number, distribution: number[]): number
export function buildPercentileProfile(playerId: string, teamId: string, supabase: SupabaseClient): Promise<PercentileProfile>
export function getMetricPercentile(value: number, metric: string, context: 'team' | 'platform' | 'division'): number
```

**Implementation:**
- Percentile: count values below target / total values * 100
- For each key metric (scoring avg, SG total, SG approach, GIR%, FIR%, putts/round, etc.)
- Query other players' stats for comparison group
- Cache results in `golf_percentile_cache` (refresh daily or on new round)

- [ ] Create `stats/percentiles.ts` with percentile calculation, profile builder, metric percentile
- [ ] Add `PercentileProfile` type

---

### Task A4: Enhanced Anomaly Detection

**Files:**
- Create: `src/lib/coachhelm/v2/stats/anomaly-detector.ts`

**What it does:**
- Z-score threshold detection (existing, improved)
- IQR method (robust against skewed distributions)
- Volatility tracking (moving standard deviation changes)
- Rate-of-change detection (sudden slope changes)

**Key functions:**
```typescript
export function detectAnomalies(values: number[], baseline: PlayerBaseline): Anomaly[]
export function calculateVolatility(values: number[], windowSize?: number): VolatilityMetrics
export function detectSlopeChange(values: number[], sensitivity?: number): SlopeChange | null
```

**Implementation:**
- IQR: Q1 = 25th percentile, Q3 = 75th, IQR = Q3-Q1, outlier if value < Q1-1.5*IQR or > Q3+1.5*IQR
- Volatility: rolling stdDev over last N rounds, compare to historical rolling stdDev
- Slope change: linear regression on two halves of recent window, compare slopes

- [ ] Create `stats/anomaly-detector.ts` with multi-method anomaly detection
- [ ] Add `Anomaly`, `VolatilityMetrics`, `SlopeChange` types

---

## Sub-Plan B: Trend & Pattern Analysis (`trends/`)

### Task B1: Multi-Window Trend Detection

**Files:**
- Create: `src/lib/coachhelm/v2/trends/multi-window.ts`
- Create: `src/lib/coachhelm/v2/trends/index.ts`

**What it does:**
- Parallel trend analysis across 3 windows: fast (3-5 rounds), medium (10-15), slow (25+)
- Trend direction + magnitude + confidence for each window
- Cross-window alignment detection (all agree = high confidence, disagree = nuanced insight)
- Outputs trend signals that feed into insight generation

**Key functions:**
```typescript
export function analyzeMultiWindowTrends(rounds: RoundData[], metrics: string[]): MultiWindowAnalysis
export function detectWindowAlignment(windows: TrendWindow[]): WindowAlignment
export function generateTrendInsight(analysis: MultiWindowAnalysis, metric: string): TrendInsight | null
```

**Implementation:**
- Each window: linear regression slope, R-squared, direction (improving/stable/declining)
- Fast window: last 3-5 rounds, catches hot/cold streaks
- Medium window: last 10-15, catches sustained changes
- Slow window: last 25+, catches long-term trajectory
- Alignment: all same direction = "strong signal", fast disagrees = "short-term blip", slow disagrees = "trajectory change"

- [ ] Create `trends/multi-window.ts` and `trends/index.ts`
- [ ] Add `MultiWindowAnalysis`, `TrendWindow`, `WindowAlignment`, `TrendInsight` types

---

### Task B2: Streak Detection + Composition

**Files:**
- Create: `src/lib/coachhelm/v2/trends/streak-detector.ts`

**What it does:**
- Detect consecutive rounds above/below baseline
- Analyze streak composition (which SG categories are driving it)
- Track historical streak patterns per player (how previous streaks resolved)
- Predict streak sustainability based on composition

**Key functions:**
```typescript
export function detectStreaks(rounds: RoundData[], baseline: PlayerBaseline): Streak[]
export function analyzeStreakComposition(streak: Streak, rounds: RoundData[]): StreakComposition
export function getHistoricalStreakResolution(playerId: string, streakType: string, supabase: SupabaseClient): Promise<StreakHistory>
```

**Implementation:**
- Streak: 3+ consecutive rounds in same direction relative to baseline
- Composition: break down by SG category during streak period
- If streak driven by putting spike (volatile) → less sustainable
- If driven by approach improvement (stable) → more sustainable
- Historical: find similar past streaks for this player, track how they resolved

- [ ] Create `trends/streak-detector.ts`
- [ ] Add `Streak`, `StreakComposition`, `StreakHistory` types

---

### Task B3: Regression to Mean Detector

**Files:**
- Create: `src/lib/coachhelm/v2/trends/regression-to-mean.ts`

**What it does:**
- Identify performances that are likely statistical outliers
- Calculate expected regression amount based on player's historical patterns
- Track regression prediction accuracy over time

**Key functions:**
```typescript
export function detectRegressionCandidate(recentValue: number, baseline: PlayerBaseline): RegressionPrediction | null
export function calculateExpectedRegression(deviation: number, historicalReversions: number[]): number
```

**Implementation:**
- Flag when recent performance is >1.5 stdDev from baseline
- Expected regression = deviation * regression coefficient (calculated from player's history)
- Track: did the next N rounds actually regress? By how much?

- [ ] Create `trends/regression-to-mean.ts`
- [ ] Add `RegressionPrediction` type

---

## Sub-Plan C: Deep Shot Analysis (`shot-analysis/`)

### Task C1: Shot-Level Strokes Gained

**Files:**
- Create: `src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts`
- Create: `src/lib/coachhelm/v2/shot-analysis/index.ts`

**What it does:**
- Calculate SG at the individual shot level (not just category)
- Build platform-specific baselines from all players in system
- Break down by lie type + distance bucket + club
- Identify hyper-specific weaknesses ("from fairway at 150-175 yards, losing 0.3 strokes/shot")

**Key functions:**
```typescript
export function calculateShotSG(shot: ShotData, baselineTable: SGBaseline): number
export function buildPlatformBaseline(supabase: SupabaseClient): Promise<SGBaseline>
export function analyzeShotsByContext(shots: ShotData[], baseline: SGBaseline): ShotContextAnalysis[]
```

**Implementation:**
- Baseline: average strokes-to-hole from each starting state (lie + distance bucket)
- Shot SG = baseline_from_start - (1 + baseline_from_end)
- Context groups: lie (tee/fairway/rough/sand/recovery) x distance (0-50, 50-100, 100-150, 150-200, 200+) x club type
- Output ranked list of contexts where player gains/loses most strokes

- [ ] Create `shot-analysis/shot-level-sg.ts` and `shot-analysis/index.ts`
- [ ] Add `SGBaseline`, `ShotContextAnalysis` types

---

### Task C2: Yardage Performance Curves

**Files:**
- Create: `src/lib/coachhelm/v2/shot-analysis/yardage-curves.ts`

**What it does:**
- Build a performance curve per player mapping yardage → expected outcome
- Identify "dead zones" (distance ranges where performance drops off)
- Compare individual curves to team/platform averages
- Track curve evolution over time

**Key functions:**
```typescript
export function buildYardageCurve(shots: ShotData[], bucketSize?: number): YardageCurve
export function findDeadZones(curve: YardageCurve, baseline: YardageCurve): DeadZone[]
export function compareYardageCurves(playerCurve: YardageCurve, baselineCurve: YardageCurve): CurveComparison
```

**Implementation:**
- Bucket shots by 10-yard increments (or 25-yard for sparse data)
- For each bucket: avg proximity to hole, SG per shot, sample size
- Dead zone: bucket where player's SG drops >0.3 below baseline with sufficient sample
- Curve comparison: overlay player vs baseline, highlight divergences

- [ ] Create `shot-analysis/yardage-curves.ts`
- [ ] Add `YardageCurve`, `DeadZone`, `CurveComparison` types

---

### Task C3: Shot Sequence Analysis

**Files:**
- Create: `src/lib/coachhelm/v2/shot-analysis/sequence-analysis.ts`

**What it does:**
- Analyze how shot N affects shot N+1
- Detect resilience (recovery from bad shots) vs compounding (errors cascade)
- Track whether sequence patterns are improving over time

**Key functions:**
```typescript
export function analyzeSequenceEffects(shots: ShotData[]): SequenceAnalysis
export function calculateResilienceScore(shots: ShotData[]): number
export function detectCompoundingPatterns(shots: ShotData[]): CompoundingPattern[]
```

**Implementation:**
- Group shots by previous shot outcome (bad: SG < -0.5, neutral: -0.5 to 0.5, good: > 0.5)
- Calculate avg SG of next shot for each group
- Resilience score: 1.0 = no effect from previous shot, <1.0 = compounds, >1.0 = bounces back
- Compounding: 3+ consecutive negative-SG shots after an initial bad shot

- [ ] Create `shot-analysis/sequence-analysis.ts`
- [ ] Add `SequenceAnalysis`, `CompoundingPattern` types

---

### Task C4: Scoring Opportunity Conversion

**Files:**
- Create: `src/lib/coachhelm/v2/shot-analysis/scoring-opportunities.ts`

**What it does:**
- Define "scoring opportunities" (expected outcome better than par)
- Track conversion rate on opportunities
- Track scramble success (save par from bad position)
- Separate scoring ability from damage limitation

**Key functions:**
```typescript
export function identifyScoringOpportunities(holes: HoleData[]): ScoringOpportunity[]
export function calculateConversionRate(opportunities: ScoringOpportunity[]): number
export function calculateScrambleRate(holes: HoleData[]): ScrambleAnalysis
```

- [ ] Create `shot-analysis/scoring-opportunities.ts`
- [ ] Add `ScoringOpportunity`, `ScrambleAnalysis` types

---

## Sub-Plan D: Simulation & Projections (`simulation/`)

### Task D1: Monte Carlo Simulation

**Files:**
- Create: `src/lib/coachhelm/v2/simulation/monte-carlo.ts`
- Create: `src/lib/coachhelm/v2/simulation/index.ts`

**What it does:**
- Simulate 10,000 tournament outcomes from player scoring distributions
- Calculate win probability, top-5 probability, expected finish
- Lineup optimization: which 5 players minimize expected team score
- What-if scenarios: if Player A improves SG approach by 0.5, how does team score change?

**Key functions:**
```typescript
export function simulateTournament(players: PlayerProfile[], rounds: number, simulations?: number): TournamentSimulation
export function optimizeLineup(roster: PlayerProfile[], lineupSize: number, simulations?: number): LineupOptimization
export function simulateWhatIf(player: PlayerProfile, improvement: { metric: string; amount: number }): WhatIfResult
```

**Implementation:**
- For each simulation: sample from each player's scoring distribution (normal distribution with their mean + stdDev)
- Sum N rounds, rank players, record finish positions
- After 10,000 sims: calculate probability distributions for each player
- Lineup optimization: try all combinations (or if too many, use greedy heuristic), simulate each, pick lowest expected team score
- What-if: adjust the player's distribution parameters and re-simulate

- [ ] Create `simulation/monte-carlo.ts` and `simulation/index.ts`
- [ ] Add `TournamentSimulation`, `LineupOptimization`, `WhatIfResult` types

---

## Sub-Plan E: Self-Improving Feedback Loop (`feedback/`)

### Task E1: Confidence Calibrator (Replace Stub)

**Files:**
- Create: `src/lib/coachhelm/v2/feedback/confidence-calibrator.ts`
- Create: `src/lib/coachhelm/v2/feedback/index.ts`
- Modify: `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts` (redirect to new)

**What it does:**
- Calibrate raw confidence scores based on historical accuracy
- Track accuracy by confidence bucket (0-20%, 20-40%, etc.)
- Calculate Brier score, Expected Calibration Error
- Adjust future confidence based on track record

**Key functions:**
```typescript
export function calibrateConfidence(rawConfidence: number, insightType: string, historicalAccuracy: AccuracyRecord): number
export function updateCalibrationRecord(prediction: { confidence: number; wasAccurate: boolean }, record: AccuracyRecord): AccuracyRecord
export function calculateBrierScore(predictions: { predicted: number; actual: number }[]): number
```

**Implementation:**
- Bucket predictions by confidence (5 buckets: 0-20, 20-40, 40-60, 60-80, 80-100)
- Track accuracy rate per bucket
- Calibrated confidence = adjust raw by the ratio of (actual accuracy / stated confidence) for that bucket
- If 80% confidence predictions are only 60% accurate, scale down: 80% * (60/80) = 60%

- [ ] Create `feedback/confidence-calibrator.ts` and `feedback/index.ts`
- [ ] Update `reasoning/confidence-calibrator.ts` to re-export from new location
- [ ] Add `AccuracyRecord` type

---

### Task E2: Outcome Tracker (Replace Stub)

**Files:**
- Create: `src/lib/coachhelm/v2/feedback/outcome-tracker.ts`
- Modify: `src/lib/coachhelm/v2/learning/outcome-validator.ts` (redirect)

**What it does:**
- After each round, validate previous predictions against actual results
- Calculate error metrics (absolute, relative, direction, within interval)
- Feed validation signals back to prediction model
- Store validations for calibration

**Key functions:**
```typescript
export function validatePredictions(playerId: string, actualRound: RoundData, supabase: SupabaseClient): Promise<ValidationResult[]>
export function calculatePredictionAccuracy(validations: ValidationResult[]): PredictionAccuracyMetrics
export function feedbackToPredictionModel(validations: ValidationResult[]): PredictionAdjustments
```

**Implementation:**
- Query `golf_predictions` for pending predictions for this player
- Compare predicted_value to actual_value
- Error = |predicted - actual|, direction = predicted > actual ? 'overestimate' : 'underestimate'
- Within interval = actual between predicted_low and predicted_high
- Store in `golf_prediction_validations`
- Adjustment: if consistently overestimating, reduce predictions by average error

- [ ] Create `feedback/outcome-tracker.ts`
- [ ] Update `learning/outcome-validator.ts` to re-export
- [ ] Add `ValidationResult`, `PredictionAccuracyMetrics`, `PredictionAdjustments` types

---

### Task E3: Insight Scorer

**Files:**
- Create: `src/lib/coachhelm/v2/feedback/insight-scorer.ts`

**What it does:**
- Score insights based on historical coach feedback
- Track accuracy and helpfulness by insight type
- Auto-adjust thresholds: valued insights → lower threshold, dismissed insights → higher threshold
- Minimum confidence gate: don't show insights below threshold

**Key functions:**
```typescript
export function scoreInsight(insight: ComposedInsight, feedbackHistory: InsightFeedback[]): number
export function adjustInsightThresholds(feedbackHistory: InsightFeedback[]): ThresholdAdjustments
export function shouldShowInsight(insight: ComposedInsight, score: number, minThreshold?: number): boolean
```

- [ ] Create `feedback/insight-scorer.ts`
- [ ] Add `InsightFeedback`, `ThresholdAdjustments` types

---

### Task E4: Coach Behavior Analytics

**Files:**
- Create: `src/lib/coachhelm/v2/feedback/coach-behavior.ts`

**What it does:**
- Track which player profiles coaches view most
- Track which metrics coaches filter to
- Track which insights coaches expand vs dismiss
- Use signals to prioritize insight surfacing

**Key functions:**
```typescript
export function recordCoachAction(action: CoachAction, supabase: SupabaseClient): Promise<void>
export function getCoachPreferences(coachId: string, supabase: SupabaseClient): Promise<CoachPreferences>
export function prioritizeInsightsForCoach(insights: ComposedInsight[], preferences: CoachPreferences): ComposedInsight[]
```

- [ ] Create `feedback/coach-behavior.ts`
- [ ] Add `CoachAction`, `CoachPreferences` types

---

## Sub-Plan F: Database Migration + Orchestrator Wiring

### Task F1: Database Migration

**Files:**
- Create: `supabase/migrations/20260314200000_coachhelm_engine_v3.sql`

**Tables to create:**
```sql
-- Player baselines (exponentially weighted)
CREATE TABLE IF NOT EXISTS golf_player_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  ewma_value DECIMAL(10,4),
  rolling_mean DECIMAL(10,4),
  rolling_stddev DECIMAL(10,4),
  sample_size INTEGER DEFAULT 0,
  decay_factor DECIMAL(5,4) DEFAULT 0.15,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, metric_name)
);

-- Percentile cache
CREATE TABLE IF NOT EXISTS golf_percentile_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  team_percentile DECIMAL(5,2),
  platform_percentile DECIMAL(5,2),
  division_percentile DECIMAL(5,2),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, metric_name)
);

-- Prediction validations
CREATE TABLE IF NOT EXISTS golf_prediction_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID REFERENCES golf_predictions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  predicted_value DECIMAL(6,2),
  actual_value DECIMAL(6,2),
  error DECIMAL(6,2),
  error_pct DECIMAL(5,2),
  within_interval BOOLEAN,
  direction TEXT CHECK (direction IN ('overestimate', 'underestimate', 'accurate')),
  validated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insight feedback scores
CREATE TABLE IF NOT EXISTS golf_insight_feedback_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type TEXT NOT NULL,
  team_id UUID,
  total_shown INTEGER DEFAULT 0,
  total_acted INTEGER DEFAULT 0,
  total_dismissed INTEGER DEFAULT 0,
  total_accurate INTEGER DEFAULT 0,
  accuracy_rate DECIMAL(5,4),
  helpfulness_rate DECIMAL(5,4),
  threshold_adjustment DECIMAL(5,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(insight_type, team_id)
);
```

Plus RLS policies (admin/coach access) and indexes.

- [ ] Create migration file
- [ ] Apply migration: `supabase db push`
- [ ] Regenerate types: `npm run db:types`

---

### Task F2: Wire New Modules into Orchestrator

**Files:**
- Modify: `src/lib/coachhelm/v2/orchestrator.ts`

**What to add to `analyzePlayer()`:**
1. After feature extraction: calculate player baseline from `stats/baselines.ts`
2. After mining: run multi-window trend detection from `trends/multi-window.ts`
3. After mining: run anomaly detection from `stats/anomaly-detector.ts`
4. After mining: run streak detection from `trends/streak-detector.ts`
5. After prediction: check for regression-to-mean from `trends/regression-to-mean.ts`
6. Before NLG: score insights through `feedback/insight-scorer.ts`
7. Before NLG: calibrate confidence through `feedback/confidence-calibrator.ts`
8. After output: prioritize by coach preferences from `feedback/coach-behavior.ts`

**Also add new public methods:**
```typescript
// New methods on coachHelmIntelligence
async getPlayerProfile(playerId: string): Promise<PlayerProfile>  // Z-scores + percentiles + baselines
async simulateTournament(playerIds: string[], rounds: number): Promise<TournamentSimulation>
async optimizeLineup(teamId: string, lineupSize: number): Promise<LineupOptimization>
async getYardageCurve(playerId: string): Promise<YardageCurve>
async getSequenceAnalysis(playerId: string): Promise<SequenceAnalysis>
```

- [ ] Import all new modules
- [ ] Wire into `analyzePlayer()` pipeline
- [ ] Add new public methods
- [ ] Update `index.ts` exports

---

### Task F3: Replace Hardcoded Benchmarks

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/stats-insight-generator.ts`

**What to change:**
- Replace the hardcoded `BENCHMARKS` object with dynamic baselines from `stats/baselines.ts`
- Use player's own baseline + team average as comparison instead of fixed numbers
- Factor in coach philosophy weights when ranking stat insights

- [ ] Replace `BENCHMARKS` with `buildPlayerBaseline()` call
- [ ] Weight insights by coach philosophy priorities

---

### Task F4: Wire Round Submission Trigger

**Files:**
- Modify: `src/app/golf/actions/golf.ts` (find round submission handler)
- Modify: `src/app/golf/actions/insights.ts` (ensure `triggerPlayerInsightsAfterRound` works)

**What to do:**
- Find where rounds are submitted/completed in `golf.ts`
- Ensure `triggerPlayerInsightsAfterRound(playerId)` is called after successful round save
- This function should: update baselines, run analysis, generate insights, validate previous predictions

- [ ] Find round submission in golf.ts
- [ ] Wire trigger call
- [ ] Ensure insights.ts `triggerPlayerInsightsAfterRound` calls orchestrator

---

## Parallel Execution Plan

These sub-plans can run simultaneously with zero conflicts:

| Agent | Sub-Plan | Files Owned | Dependencies |
|-------|----------|-------------|--------------|
| Agent 1 | A: Statistical Foundation | `stats/*` | None |
| Agent 2 | B: Trends & Patterns | `trends/*` | None |
| Agent 3 | C: Shot Analysis | `shot-analysis/*` | None |
| Agent 4 | D: Simulation | `simulation/*` | None |
| Agent 5 | E: Feedback Loop | `feedback/*` | None |
| Agent 6 | F: DB + Wiring | Migration, orchestrator.ts, golf.ts | Runs AFTER 1-5 complete |

Agent 6 (wiring) should run last since it imports from all other modules.
