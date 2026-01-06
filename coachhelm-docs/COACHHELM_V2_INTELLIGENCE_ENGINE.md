# CoachHelm V2 Intelligence Engine

## The Full Brain

---

## Philosophy

V1 was reactive: "Here's what happened."
V2 is predictive: "Here's what's about to happen, why, and what to do about it."

The goal: **Be smarter than any individual coach by learning from ALL coaches and ALL players, while still being personalized to each.**

---

## Note

This is a condensed version. The full 3,400+ line specification is available in the outputs folder or can be regenerated. Key sections:

1. **Feature Extraction** (Temporal, Sequence, Contextual)
2. **Pattern Mining Engine** (Conditional, Compound, Anomaly, Regression patterns)
3. **Causal Discovery Engine** (Tests for actual causation vs correlation)
4. **Predictive Engine** (Performance prediction, Trajectory forecasting)
5. **Adaptive Learning System** (Behavior learning, Outcome validation, Cross-learning)
6. **Reasoning Engine** (Deductive, Inductive, Abductive reasoning)
7. **Confidence Calibration** (Ensuring stated confidence matches actual accuracy)
8. **Natural Language Generation** (Composing insights)
9. **Orchestrator** (Tying it all together)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COACHHELM V2 INTELLIGENCE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DATA LAYER → FEATURE EXTRACTION → INTELLIGENCE CORE → PERSONALIZATION     │
│       │              │                    │                   │             │
│   Rounds         Temporal             Pattern              Coach            │
│   Holes          Sequence             Causal               Player           │
│   Shots          Contextual           Predictive           Team             │
│   Events         Derived              Reasoning            Models           │
│                                                                             │
│                           OUTPUT LAYER                                      │
│                  Alerts | Focus | Reviews | Predictions                     │
│                                                                             │
│                          LEARNING LAYER                                     │
│              Feedback | Behavior | Outcome Validation                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Algorithms

### Pattern Mining
- **Conditional Patterns**: Test conditions (e.g., "after 7+ days off") against outcomes
- **Compound Patterns**: Multiple conditions together (e.g., "on bubble + before tournament")
- **Anomaly Patterns**: Unusual situations with unusual outcomes
- **Regression Patterns**: Predictive correlations

Statistical thresholds:
- minSupport = 0.1 (10%+ of opportunities)
- minConfidence = 0.6 (60%+ when conditions met)
- minLift = 1.5 (50% more likely than random)
- minSampleSize = 10

### Causal Discovery
Four tests for causality:
1. **Temporal Precedence**: Does X happen before Y?
2. **Dose-Response**: More X → more Y?
3. **Confounder Elimination**: Third variable explaining both?
4. **Natural Experiments**: When X changed naturally, did Y follow?

### Prediction Model
```
predicted_score = baseline 
  + (recent_form_adjustment × 0.6)
  + (trend_momentum × 0.2)
  + (rest_rust_factor × 0.1)
  + (pressure_adjustment × 0.05)
  + (form_cycle_adjustment × 0.05)
  + Σ(active_pattern_impacts)
```

### Confidence Calibration
Ensures that when we say "80% confident", we're actually right 80% of the time.
- Tracks predictions vs outcomes
- Adjusts confidence based on historical accuracy
- Reports calibration curve and bias

---

## Database Tables

```sql
-- Pattern storage
CREATE TABLE golf_patterns_v2 (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES golf_players(id),
  pattern_type TEXT NOT NULL,
  conditions JSONB NOT NULL,
  outcome JSONB NOT NULL,
  support DECIMAL(4,3),
  confidence DECIMAL(4,3),
  lift DECIMAL(4,2),
  conviction DECIMAL(4,2),
  stroke_impact DECIMAL(4,2),
  actionability DECIMAL(3,2),
  sample_size INTEGER,
  first_detected TIMESTAMPTZ,
  last_occurrence TIMESTAMPTZ,
  trend TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Causal relationships
CREATE TABLE golf_causal_relationships (
  id UUID PRIMARY KEY,
  player_id UUID,
  cause TEXT NOT NULL,
  effect TEXT NOT NULL,
  strength DECIMAL(4,3),
  confidence DECIMAL(4,3),
  mechanism TEXT,
  confounders JSONB,
  intervention_potential DECIMAL(3,2),
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions for validation
CREATE TABLE golf_predictions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL,
  prediction_type TEXT NOT NULL,
  metric TEXT NOT NULL,
  predicted_value DECIMAL(6,2),
  confidence DECIMAL(4,3),
  confidence_interval JSONB,
  features_snapshot JSONB,
  due_date DATE,
  actual_value DECIMAL(6,2),
  validated_at TIMESTAMPTZ,
  was_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned behavior
CREATE TABLE golf_learned_behavior (
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'coach' or 'player'
  interactions JSONB,
  preferences JSONB,
  learned_thresholds JSONB,
  engagement_patterns JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, entity_type)
);

-- Validation results
CREATE TABLE golf_validations (
  id UUID PRIMARY KEY,
  prediction_id UUID REFERENCES golf_predictions(id),
  stated_confidence DECIMAL(4,3),
  was_correct BOOLEAN,
  absolute_error DECIMAL(6,2),
  relative_error DECIMAL(4,3),
  within_confidence_interval BOOLEAN,
  direction_correct BOOLEAN,
  learning_signals JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global patterns (cross-player)
CREATE TABLE golf_global_patterns (
  id UUID PRIMARY KEY,
  signature TEXT UNIQUE,
  prevalence DECIMAL(4,3),
  average_impact DECIMAL(4,2),
  confidence DECIMAL(4,3),
  varied_by_tier JSONB,
  varied_by_style JSONB,
  instance_count INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Confidence calibration
CREATE TABLE golf_confidence_calibration (
  id UUID PRIMARY KEY,
  bucket DECIMAL(2,1) NOT NULL, -- 0.0, 0.1, 0.2, etc.
  actual_accuracy DECIMAL(4,3),
  sample_size INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bucket)
);
```

---

## V2 vs V1 Comparison

| Capability | V1 | V2 |
|------------|----|----|
| Pattern Detection | Rule-based | Multi-dimensional mining |
| Correlation vs Causation | Assumes correlation | Tests for causality |
| Predictions | None | Full forecasting |
| Trajectory | Trend line | Multi-model ensemble |
| Confidence | Arbitrary | Calibrated |
| Personalization | Coach sets preferences | System learns |
| Cross-Learning | None | Learns from ALL players |
| Reasoning | "Here's what happened" | Deductive + Inductive + Abductive |
| Self-Improvement | Static | Validates and updates |

---

## Key Principles

1. **Pattern Mining Over Rules** — Discover patterns from data, don't hardcode them
2. **Causation Over Correlation** — Test for actual causation
3. **Predict, Don't Just Describe** — Forecast future performance
4. **Calibrated Uncertainty** — Know what we don't know
5. **Learn From Behavior** — Watch what coaches/players do
6. **Cross-Learning** — Apply lessons from similar players
7. **Explain Reasoning** — Show the logical chain
8. **Validate and Improve** — Check predictions, update models

---

## Implementation Files

When implemented, the V2 engine will create:

```
src/lib/coachhelm/v2/
├── index.ts
├── types.ts
├── orchestrator.ts
├── gate.ts
├── features/
│   ├── temporal.ts
│   ├── sequence.ts
│   └── contextual.ts
├── mining/
│   ├── pattern-miner.ts
│   └── causal-engine.ts
├── prediction/
│   ├── performance-predictor.ts
│   └── trajectory-forecaster.ts
├── learning/
│   ├── behavior-learner.ts
│   ├── outcome-validator.ts
│   └── cross-learner.ts
├── reasoning/
│   ├── reasoning-engine.ts
│   └── confidence-calibrator.ts
└── nlg/
    └── insight-composer.ts
```

---

## Getting Started

See `CURSOR_IMPLEMENTATION_GUIDE.md` for step-by-step prompts to implement each phase.

This condensed version provides the architecture and key concepts. The full specification with complete TypeScript implementations is available for detailed reference.
