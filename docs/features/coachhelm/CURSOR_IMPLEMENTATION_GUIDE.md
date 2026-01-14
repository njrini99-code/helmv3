# CoachHelm V2 Intelligence Engine — Cursor Implementation Guide

## How to Use This Document

This document explains how to implement the CoachHelm V2 Intelligence Engine in your GolfHelm project. The full specification is in `COACHHELM_V2_INTELLIGENCE_ENGINE.md`.

**Your project location:** `/Users/ricknini/Downloads/helmv3/`

---

## Quick Start for Cursor

Copy this prompt into Cursor when you're ready to start implementation:

---

### CURSOR PROMPT — PHASE 1: Foundation

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md carefully.

I'm building an AI coaching intelligence system for my golf team management app. The codebase is a Next.js 14 app with TypeScript, Supabase, and Tailwind CSS.

**Current project structure:**
- /src/app/golf/(dashboard)/ — Golf dashboard pages
- /src/components/golf/ — Golf-specific components
- /src/lib/ — Utility functions and Supabase client
- /src/hooks/ — React hooks
- /supabase/migrations/ — Database migrations

**Your task — Phase 1: Database & Types Foundation**

1. Create the database migration file at `supabase/migrations/032_coachhelm_v2_intelligence.sql` with ALL the V2 tables from the spec:
   - golf_patterns_v2
   - golf_causal_relationships
   - golf_predictions
   - golf_learned_behavior
   - golf_validations
   - golf_global_patterns
   - golf_confidence_calibration
   - All indexes and RLS policies

2. Create the TypeScript types file at `src/lib/coachhelm/v2/types.ts` with:
   - All interfaces from the spec (MinedPattern, PatternCondition, CausalRelationship, PerformancePrediction, TrajectoryForecast, LearnedBehavior, etc.)
   - Database-to-TypeScript mapping helpers
   - Constants for pattern types, condition operators, etc.

3. Create barrel exports at `src/lib/coachhelm/v2/index.ts`

Do NOT implement the actual engines yet — just the foundation. Show me the complete migration file and types file.
```

---

### CURSOR PROMPT — PHASE 2: Feature Extraction

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md — focus on "Part 1: Feature Extraction".

Now implement the feature extraction layer. This extracts rich features from raw round data that feed into the intelligence engines.

**Create these files:**

1. `src/lib/coachhelm/v2/features/temporal.ts`
   - extractTemporalFeatures() function
   - Calculates: daysSinceLastRound, roundsInLast7/14/30Days, playingFrequency, trends, volatility
   - Uses existing golf_rounds table

2. `src/lib/coachhelm/v2/features/sequence.ts`
   - extractSequenceFeatures() function
   - Analyzes hole-to-hole transitions across rounds
   - Calculates: birdieFollowUp, bogeyFollowUp, streaks, frontNineVsBackNine, typicalCollapseHole
   - Uses golf_rounds and golf_holes tables

3. `src/lib/coachhelm/v2/features/contextual.ts`
   - extractContextualFeatures() function
   - Infers: confidenceLevel, formCycle, pressureExposure, clutchFactor
   - Combines data from rounds, events, and player context

4. `src/lib/coachhelm/v2/features/index.ts`
   - Barrel export
   - extractAllFeatures() function that combines all three

**Important:**
- Use the existing Supabase client pattern from my project
- These are server-side functions (use createClient from '@/lib/supabase/server')
- Include proper TypeScript types
- Add JSDoc comments explaining each feature

Show me all four files with complete implementations.
```

---

### CURSOR PROMPT — PHASE 3: Pattern Mining

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md — focus on "Part 2: Pattern Mining Engine".

Implement the pattern mining system that discovers non-obvious patterns from player data.

**Create these files:**

1. `src/lib/coachhelm/v2/mining/pattern-miner.ts`
   - PatternMiner class with:
     - minePatterns(playerId) — main entry point
     - mineConditionalPatterns() — tests conditions against outcomes
     - mineCompoundPatterns() — combines multiple conditions
     - mineAnomalyPatterns() — finds unusual situations
     - mineRegressionPatterns() — predictive correlation analysis
   - Statistical validation (support, confidence, lift, conviction)
   - Pattern deduplication
   - Uses features from Phase 2

2. `src/lib/coachhelm/v2/mining/causal-engine.ts`
   - CausalEngine class with:
     - discoverCausalRelationships(playerId)
     - testCausality() — tests for actual causation
     - checkDoseResponse() — more X → more Y?
     - controlForConfounders() — eliminate third variables
     - analyzeNaturalExperiments() — when X changed, did Y follow?
   - Returns CausalRelationship[] with mechanism explanations

3. `src/lib/coachhelm/v2/mining/index.ts`
   - Barrel export

**Key requirements:**
- Statistical rigor: minSupport=0.1, minConfidence=0.6, minLift=1.5, minSampleSize=10
- Pattern conditions should be human-readable
- Include practical significance filter (strokeImpact >= 0.3)
- Save discovered patterns to golf_patterns_v2 table

Show me the complete PatternMiner and CausalEngine implementations.
```

---

### CURSOR PROMPT — PHASE 4: Prediction Engine

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md — focus on "Part 3: Predictive Engine".

Implement the prediction system that forecasts player performance.

**Create these files:**

1. `src/lib/coachhelm/v2/prediction/performance-predictor.ts`
   - PerformancePredictor class with:
     - predictPerformance(playerId, targetDate, context?)
     - applyModel() — multi-factor prediction model
     - calculateContextAdjustment() — course, weather, competitive context
     - identifyKeyFactors() — what's driving this prediction
     - calculateSensitivities() — what would change the prediction
     - calculateTailRisk() — probability of blowup/great round
   - Returns PerformancePrediction with confidence intervals

2. `src/lib/coachhelm/v2/prediction/trajectory-forecaster.ts`
   - TrajectoryForecaster class with:
     - forecastTrajectory(playerId, horizon)
     - linearProjection() — simple trend extrapolation
     - seasonalProjection() — accounts for seasonal patterns
     - patternBasedProjection() — adjusts for active patterns
     - ensembleProjection() — combines all models
     - generateScenarios() — best/likely/conservative/worst cases
   - Returns TrajectoryForecast with milestones, risks, opportunities

3. `src/lib/coachhelm/v2/prediction/index.ts`
   - Barrel export

**Key requirements:**
- Save predictions to golf_predictions table for later validation
- Include confidence intervals (not just point estimates)
- Factor in player context (swing changes, injuries, etc.)
- Use features and patterns from earlier phases

Show me the complete implementations.
```

---

### CURSOR PROMPT — PHASE 5: Learning System

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md — focus on "Part 4: Adaptive Learning System".

Implement the system that learns from coach/player behavior and validates predictions.

**Create these files:**

1. `src/lib/coachhelm/v2/learning/behavior-learner.ts`
   - BehaviorLearner class with:
     - learnFromInteraction(entityId, entityType, interaction)
     - updatePreferences() — infer preferences from behavior
     - updateThresholds() — learn personalized alert thresholds
     - getPersonalizedThreshold(entityId, metric, defaultThreshold)
   - Tracks: interactionCount, engagementTime, actionRate, dismissalRate
   - Saves to golf_learned_behavior table

2. `src/lib/coachhelm/v2/learning/outcome-validator.ts`
   - OutcomeValidator class with:
     - validatePredictions() — compare predictions to actual outcomes
     - calculateAccuracy() — absolute error, relative error, direction
     - updateModels() — adjust weights based on accuracy
     - getModelAccuracy() — overall accuracy report
   - Saves to golf_validations table

3. `src/lib/coachhelm/v2/learning/cross-learner.ts`
   - CrossLearner class with:
     - buildGlobalPatternLibrary() — patterns across all players
     - findSimilarPlayers(playerId) — find players with similar profiles
     - transferLearning(fromPlayerId, toPlayerId) — apply insights from similar players
   - Uses golf_global_patterns table

4. `src/lib/coachhelm/v2/learning/index.ts`
   - Barrel export

**Key requirements:**
- Learning should be incremental (update running averages, not recompute everything)
- Thresholds learned from behavior should blend with defaults based on confidence
- Cross-learning should respect statistical significance

Show me the complete implementations.
```

---

### CURSOR PROMPT — PHASE 6: Reasoning & NLG

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md — focus on "Part 5: Reasoning Engine" and "Part 6: Natural Language Generation".

Implement the reasoning system that explains insights and the NLG system that composes human-readable output.

**Create these files:**

1. `src/lib/coachhelm/v2/reasoning/reasoning-engine.ts`
   - ReasoningEngine class with:
     - reason(observation, context) — main entry point
     - reasonDeductively() — if rules met, then conclusion
     - reasonInductively() — pattern-based inference
     - reasonAbductively() — best explanation for observation
   - Returns ReasoningResult with chain of reasoning steps
   - Includes alternatives and sensitivities

2. `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts`
   - ConfidenceCalibrator class with:
     - calibrate(rawConfidence) — adjust based on historical accuracy
     - updateCalibrationCurve() — recalculate from validations
     - getConfidenceAnalysis() — overall calibration report
   - Uses golf_confidence_calibration table

3. `src/lib/coachhelm/v2/nlg/insight-composer.ts`
   - InsightComposer class with:
     - compose(insight, context) — main entry point
     - determineTone() — neutral/encouraging/cautionary/celebratory
     - composeHeadline() — short attention-grabbing headline
     - composeBody() — detailed explanation (varies by verbosity)
     - generateCallToAction() — what to do next
   - Template-based with variation

4. Barrel exports for both directories

**Key requirements:**
- Reasoning should show its work (chain of steps)
- Confidence calibration is critical — when we say 80%, we should be right 80%
- NLG should adapt to coach preferences (brief vs detailed)
- Tone should consider player state (encouraging when struggling)

Show me the complete implementations.
```

---

### CURSOR PROMPT — PHASE 7: Orchestrator & Integration

```
Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md — focus on "Part 7: Putting It All Together".

Implement the main orchestrator that ties everything together and integrate with the existing Round Review feature.

**Create these files:**

1. `src/lib/coachhelm/v2/orchestrator.ts`
   - CoachHelmIntelligence class with:
     - analyzePlayer(playerId, options) — full player analysis
     - generateRoundReview(roundId, playerId) — enhanced round review
     - generateAlerts(coachId, teamId) — intelligent alerts
     - learn(interaction) — learning loop entry point
   - Orchestrates all engines: PatternMiner, CausalEngine, PerformancePredictor, TrajectoryForecaster, ReasoningEngine, BehaviorLearner, CrossLearner, OutcomeValidator, InsightComposer, ConfidenceCalibrator

2. `src/lib/coachhelm/v2/index.ts`
   - Main barrel export
   - Export singleton instance of CoachHelmIntelligence

3. Update the existing Round Review to use V2:
   - Modify `src/lib/coachhelm/round-review-generator.ts` to use the orchestrator
   - OR create `src/lib/coachhelm/v2/round-review-generator.ts` as enhanced version
   - Add pattern analysis, causal insights, predictions to review

4. Create API routes:
   - `src/app/api/golf/coachhelm/analyze/route.ts` — player analysis endpoint
   - `src/app/api/golf/coachhelm/learn/route.ts` — learning endpoint (call after interactions)

**Key requirements:**
- Orchestrator should be the single entry point for all V2 intelligence
- Personalization should filter and reorder insights based on learned behavior
- Learning should happen after every meaningful interaction
- Integration with existing Round Review should be seamless

Show me the orchestrator and API routes.
```

---

### CURSOR PROMPT — PHASE 8: UI Integration

```
Now integrate V2 intelligence into the UI. We need to show the enhanced insights to coaches and players.

**Update these existing components:**

1. Update Round Review page (`src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`):
   - Add "Patterns Applied" section showing relevant patterns
   - Add "Causal Analysis" section for problem areas
   - Add "Looking Ahead" section with prediction
   - Add "Reasoning" expandable section showing how conclusions were reached

2. Create new components in `src/components/golf/coachhelm/v2/`:
   - `PatternCard.tsx` — displays a single pattern with conditions, confidence, impact
   - `CausalInsight.tsx` — shows cause → effect with mechanism
   - `PredictionCard.tsx` — shows forecast with confidence interval visualization
   - `TrajectoryChart.tsx` — line chart of trajectory with scenarios
   - `ReasoningChain.tsx` — expandable chain of reasoning steps
   - `ConfidenceBadge.tsx` — calibrated confidence display

3. Create a coach dashboard intelligence section:
   - `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx`
   - Shows: team-wide patterns, players needing attention, predictions, cross-player insights
   - Uses the orchestrator's generateAlerts() method

**Design requirements:**
- Follow existing glassmorphism design system
- Use warm cream gradient backgrounds
- Confidence should be shown as calibrated percentages with visual indicator
- Predictions should show range (low-expected-high) not just point estimate
- Reasoning should be collapsible (hidden by default, expandable for curious coaches)

Show me the updated Round Review page and 3 key new components.
```

---

## Implementation Order

Follow this order for best results:

```
Phase 1: Database & Types ─────────────────────────► Foundation
    │
    ▼
Phase 2: Feature Extraction ───────────────────────► Data Layer
    │
    ▼
Phase 3: Pattern Mining + Causal Engine ───────────► Core Intelligence
    │
    ▼
Phase 4: Prediction Engine ────────────────────────► Forecasting
    │
    ▼
Phase 5: Learning System ──────────────────────────► Adaptation
    │
    ▼
Phase 6: Reasoning + NLG ──────────────────────────► Communication
    │
    ▼
Phase 7: Orchestrator + Integration ───────────────► Glue
    │
    ▼
Phase 8: UI Integration ───────────────────────────► User-Facing
```

---

## File Structure After Implementation

```
src/lib/coachhelm/
├── v2/
│   ├── index.ts                          # Main export + singleton
│   ├── types.ts                          # All TypeScript types
│   ├── orchestrator.ts                   # CoachHelmIntelligence class
│   │
│   ├── features/
│   │   ├── index.ts
│   │   ├── temporal.ts                   # Time-based features
│   │   ├── sequence.ts                   # Hole-to-hole patterns
│   │   └── contextual.ts                 # Inferred context
│   │
│   ├── mining/
│   │   ├── index.ts
│   │   ├── pattern-miner.ts              # Pattern discovery
│   │   └── causal-engine.ts              # Causal inference
│   │
│   ├── prediction/
│   │   ├── index.ts
│   │   ├── performance-predictor.ts      # Score prediction
│   │   └── trajectory-forecaster.ts      # Long-term trajectory
│   │
│   ├── learning/
│   │   ├── index.ts
│   │   ├── behavior-learner.ts           # Learn from interactions
│   │   ├── outcome-validator.ts          # Validate predictions
│   │   └── cross-learner.ts              # Learn across players
│   │
│   ├── reasoning/
│   │   ├── index.ts
│   │   ├── reasoning-engine.ts           # Multi-type reasoning
│   │   └── confidence-calibrator.ts      # Calibrate confidence
│   │
│   └── nlg/
│       ├── index.ts
│       └── insight-composer.ts           # Natural language output
│
├── types.ts                              # V1 types (keep for now)
├── round-review-generator.ts             # V1 generator (update to use V2)
└── ...                                   # Other V1 files

src/components/golf/coachhelm/
├── v2/
│   ├── PatternCard.tsx
│   ├── CausalInsight.tsx
│   ├── PredictionCard.tsx
│   ├── TrajectoryChart.tsx
│   ├── ReasoningChain.tsx
│   └── ConfidenceBadge.tsx
│
└── round-review/                         # Existing V1 components
    └── ...

supabase/migrations/
├── 030_create_coach_philosophy.sql       # V1
├── 031_create_round_reviews.sql          # V1
└── 032_coachhelm_v2_intelligence.sql     # V2 tables
```

---

## Tips for Cursor

1. **Reference the spec frequently:**
   ```
   Read @COACHHELM_V2_INTELLIGENCE_ENGINE.md section "Part 3: Predictive Engine"
   ```

2. **Build incrementally:**
   Don't try to implement everything at once. Each phase builds on the previous.

3. **Test as you go:**
   After each phase, verify:
   - Migration runs: `npx supabase db push`
   - Types compile: `npx tsc --noEmit`
   - Functions work: Create simple test in `/app/api/test/route.ts`

4. **Use existing patterns:**
   Tell Cursor to follow existing code style:
   ```
   Follow the same patterns used in src/hooks/coachhelm/useCoachPhilosophy.ts for database access.
   ```

5. **Ask for explanations:**
   If Cursor generates something you don't understand:
   ```
   Explain how the calculateConviction() function works and why we need it.
   ```

---

## Quick Reference: Key Concepts

| Concept | What It Means | Why It Matters |
|---------|---------------|----------------|
| **Support** | How often pattern conditions occur | Filters rare patterns |
| **Confidence** | When conditions occur, how often outcome happens | Measures reliability |
| **Lift** | How much more likely than random | Filters obvious patterns |
| **Conviction** | Strength of implication | Combines support + confidence |
| **Calibration** | Matching stated confidence to actual accuracy | Trustworthy uncertainty |
| **Abductive Reasoning** | Best explanation for observation | Explains "why" |
| **Cross-Learning** | Applying insights from similar players | Accelerates learning |

---

## Getting Started

1. Download `COACHHELM_V2_INTELLIGENCE_ENGINE.md` to your project root
2. Open Cursor in your project directory
3. Copy Phase 1 prompt into Cursor
4. Review generated code, make adjustments
5. Run migration: `npx supabase db push`
6. Continue with Phase 2

Good luck! This is a sophisticated system — take it one phase at a time.
