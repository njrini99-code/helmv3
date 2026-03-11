# CoachHelm Engine Audit

Date: 2026-03-11

## Purpose

This document captures how CoachHelm currently works across player analysis, round reviews, team outputs, pattern mining, prediction, confidence, and persistence. It also records the production-readiness changes applied on 2026-03-11 and the next improvements required to make the system materially better for athletes and coaches.

## Current Engine Flow

### 1. Player analysis

Primary entry point:

- `src/lib/coachhelm/v2/orchestrator.ts`

`analyzePlayer(playerId, options)` currently runs these layers:

1. Feature extraction
   - `src/lib/coachhelm/v2/features/temporal.ts`
   - `src/lib/coachhelm/v2/features/sequence.ts`
   - `src/lib/coachhelm/v2/features/contextual.ts`
2. Round-level pattern mining
   - `src/lib/coachhelm/v2/mining/pattern-miner.ts`
3. Shot-level miss / dispersion mining
   - `src/lib/coachhelm/v2/mining/shot-pattern-miner.ts`
4. Lie-specific and shot-category analysis
   - `src/lib/coachhelm/v2/mining/lie-specific-analysis.ts`
5. Causal relationship discovery
   - `src/lib/coachhelm/v2/mining/causal-engine.ts`
6. Performance prediction
   - `src/lib/coachhelm/v2/prediction/performance-predictor.ts`
7. Optional trajectory forecasting
   - `src/lib/coachhelm/v2/prediction/trajectory-forecaster.ts`
8. Stats-driven insight generation
   - `src/lib/coachhelm/v2/mining/stats-insight-generator.ts`
9. Cross-metric correlation discovery
   - `src/lib/coachhelm/v2/mining/correlation-discovery.ts`
10. Reasoning, confidence calibration, and composed insight generation
   - `src/lib/coachhelm/v2/reasoning/reasoning-engine.ts`
   - `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts`
   - `src/lib/coachhelm/v2/nlg/insight-composer.ts`

### 2. Round reviews

Round review generation spans two layers:

- `src/lib/coachhelm/v2/orchestrator.ts`
- `src/app/golf/actions/round-review-system.ts`

`round-review-system.ts` builds a deterministic hole-by-hole review and stores it in `golf_round_reviews`.

CoachHelm V2 then enhances that review through `generateRoundReview(roundId, playerId)`. As of the 2026-03-11 refactor, that enhancement path now uses the same evidence stack as full player analysis:

- stats insights
- shot-pattern insights
- lie/dispersion insights
- patterns
- predictions
- causal findings

This prevents the review from collapsing into a generic prediction or single mined pattern.

### 3. Team outputs

Team-level outputs currently come from:

- `src/lib/coachhelm/v2/learning/cross-learner.ts`
- `src/lib/coachhelm/v2/mining/team-pattern-generator.ts`
- `src/lib/coachhelm/v2/prediction/team-forecaster.ts`
- orchestrator methods `generateAlerts()` and `generateTeamPatternInsights()`

The team pipeline works by:

1. Collecting active player patterns
2. Building global pattern signatures across the roster
3. Ranking shared issues / shared strengths
4. Generating coach-facing alerts and team-trend insights

As of the 2026-03-11 refactor, team-wide insights are sorted by estimated team stroke swing:

- `playerCount * abs(averageImpact) * confidence`

This surfaces the patterns that affect the most players and the most total team scoring.

## What Is Strong Today

### Stats insight generator

`src/lib/coachhelm/v2/mining/stats-insight-generator.ts` is the strongest part of the system. It already produces useful outputs tied to scoring impact, including:

- strokes gained sink/source analysis
- putting by distance
- GIR and approach gaps
- driving accuracy and miss patterns
- scrambling and bunker weaknesses
- pressure scoring gaps
- root-cause chains
- par-type profiling
- lie + distance weakness zones
- practice ROI ranking by estimated strokes lost
- team comparison if team benchmark data is provided

This is the core of the “revolutionary” opportunity because it quantifies:

- what is costing strokes
- how much it costs
- where it shows up
- what to practice next

### Shot and lie analysis

`shot-pattern-miner.ts` and `lie-specific-analysis.ts` are valuable because they operate directly on shot history instead of only round summaries. They can already identify:

- dominant miss direction
- one-way misses vs scattered patterns
- danger-zone tendencies
- approach windows by distance
- driving miss severity
- around-green success by lie
- likely root-cause themes across lies

### Correlation discovery

`correlation-discovery.ts` gives CoachHelm a real chance to explain “why score moved” instead of just reporting what changed. Current examples include:

- GIR vs score
- fairways vs score
- pressure vs putting
- three-putts vs scoring
- penalties vs form

## What Was Weak Before The Refactor

Before the 2026-03-11 output refactor, several important layers were undercutting the stronger analysis modules:

### Output selection

The system often selected the “primary” insight by raw confidence rather than by:

- stroke impact
- evidence depth
- actionability

That allowed lower-value observations to outrank bigger scoring opportunities.

### Round review composition

Round reviews often defaulted to:

- one mined pattern, or
- one prediction

This was too shallow relative to the evidence already available elsewhere in the engine.

### Call-to-action generation

`InsightComposer.generateCallToAction()` used random template selection. That made outputs feel generated instead of coached.

### Confidence fallback

`InsightComposer.extractConfidence()` defaulted to `0.7` when evidence was missing, which overstated certainty.

### Team prioritization

Team trend output previously emphasized shared patterns but did not explicitly rank by total roster scoring swing.

## Refactor Applied On 2026-03-11

### Output prioritization

CoachHelm insights are now ranked by a composite score that weights:

- stroke impact
- confidence
- evidence density
- tone / urgency

This change was applied in:

- `src/lib/coachhelm/v2/orchestrator.ts`

### Richer round reviews

`generateRoundReview()` now pulls in:

- stats insights
- shot patterns
- lie analysis
- predictions
- causal findings

The summary and primary takeaway now come from prioritized evidence-backed insights instead of a single fallback pattern.

### Deterministic call-to-actions

`InsightComposer` now uses:

- pattern recommendations if available
- top prediction drivers for forecast actions
- direct causal-language recommendations for cause/effect findings
- coach/player specific deterministic alert text

Random CTA selection was removed.

### Safer confidence fallback

Confidence fallback is now:

- clamped when raw confidence exists
- otherwise derived conservatively from available reasoning depth

This prevents thin-evidence insights from appearing overconfident.

### Team trend ranking

Team-wide insights are now prioritized by shared scoring effect across the roster, and the generated copy includes:

- affected player count
- average player impact
- estimated team stroke swing
- explicit team-practice recommendation

## Remaining High-Value Improvements

### 1. Replace heuristic prediction with fitted scoring models

Current prediction still uses weighted rules around:

- recent form
- trend momentum
- days since last round
- clutch factor
- form cycle
- pattern adjustment

This is serviceable, but not yet elite. The next step is to train or fit against historical player rounds and predict:

- score-to-par
- scoring volatility
- blow-up risk
- breakout probability

using real features and backtested calibration.

### 2. Unify confidence at the engine level

Confidence is still mixed across modules:

- some use sample size
- some use hand-tuned constants
- some use severity buckets

The next version should calculate confidence from the same ingredients everywhere:

- sample size
- effect size
- recency
- volatility
- data completeness
- validation history

### 3. Improve shot outputs from “miss tendency” to “strategy prescription”

The shot-analysis layer should progress from:

- “you miss right from 130-160”

to:

- target-line adjustment
- acceptable miss side
- club/lie-specific expectation
- expected score penalty by miss type

That is where CoachHelm starts feeling like a competitive edge instead of a dashboard.

### 4. Expand team practice planning

Team insights should eventually output:

- roster-wide practice priorities
- subgroup drills by issue cluster
- projected team scoring gain if fixed
- lineup implications
- player groups with similar development needs

### 5. Backfill generated outputs

The production pipeline is now aligned to the live schema, but the database still has no persisted CoachHelm output rows yet. That means historical players and teams are not seeded with insights until generation is run.

## Direct Database Verification

Verified directly against production on 2026-03-11:

- `golf_coach_insights = 0`
- `golf_patterns_v2 = 0`
- `golf_predictions = 0`

Team readiness by completed-round volume:

- `Demo University Golf`: 15 completed rounds, 1 player with 10+ rounds
- `Men's Golf`: 9 completed rounds, 1 player with 5+ rounds
- `Hampden-Sydney Golf`: 3 completed rounds
- `Women’s Golf`: 2 completed rounds

Implication:

- team-level output is technically wired, but only `Demo University Golf` and `Men's Golf` currently have enough live data to produce non-trivial insights without synthetic filler

## Recommended Next Execution Step

Run a controlled CoachHelm backfill for:

1. players with 5+ completed rounds
2. teams with meaningful completed-round volume

Then validate that production writes appear in:

- `golf_coach_insights`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_insight_generation_log`

Only after that should UI polish or analytics dashboards be considered complete.
