# CoachHelm AI — Intelligence Engine Reference

> Last updated: 2026-02-13

---

## What It Is

CoachHelm is the AI intelligence layer for GolfHelm. It analyzes player round data to surface insights, detect patterns, make predictions, and generate round reviews — all personalized to the coach's philosophy.

## Architecture

Two engine versions coexist:

### V1 (Legacy, still active)
- `src/lib/coachhelm/insight-engine.ts` — Core insight generation
- `src/lib/coachhelm/round-review-generator.ts` — Round review creation
- `src/lib/coachhelm/summary-generator.ts` — Summary text
- `src/lib/coachhelm/pattern-detector.ts` — Pattern detection
- `src/lib/coachhelm/highlight-detector.ts` — Highlight moments
- `src/lib/coachhelm/area-detector.ts` — Problem areas
- `src/lib/coachhelm/strokes-gained.ts` — SG calculations
- `src/lib/coachhelm/insights/putting.ts` — Putting analysis

### V2 (Current intelligence engine)
Location: `src/lib/coachhelm/v2/`

**Orchestration:**
- `orchestrator.ts` — Main pipeline
- `gate.ts` — Feature flags
- `types.ts` — Comprehensive type definitions

**Pattern Mining** (`v2/mining/`):
- `pattern-miner.ts` — General pattern detection
- `shot-pattern-miner.ts` — Shot-level patterns
- `causal-engine.ts` — Causal relationship discovery
- `correlation-engine.ts` — Correlation analysis
- `correlation-discovery.ts` — Correlation discovery
- `pressure-analysis.ts` — Performance under pressure
- `resilience-analysis.ts` — Consistency analysis
- `lie-specific-analysis.ts` — Lie-specific performance
- `stats-insight-generator.ts` — Stats-based insights
- `team-pattern-generator.ts` — Team-wide patterns

**Prediction** (`v2/prediction/`):
- `performance-predictor.ts` — Score/metric predictions
- `trajectory-forecaster.ts` — Long-term forecasts
- `team-forecaster.ts` — Team-level predictions

**Feature Engineering** (`v2/features/`):
- `temporal.ts` — Time-based features (frequency, trends, volatility)
- `sequence.ts` — Hole-to-hole sequence features
- `contextual.ts` — Situational features

**Learning** (`v2/learning/`):
- `behavior-learner.ts` — Player behavior learning
- `cross-learner.ts` — Cross-player/team learning
- `outcome-validator.ts` — Prediction validation

**Reasoning** (`v2/reasoning/`):
- `reasoning-engine.ts` — Multi-step reasoning
- `confidence-calibrator.ts` — Confidence calibration

**NLG** (`v2/nlg/`):
- `insight-composer.ts` — Data → human-readable insights

**Services:**
- `v2/services/insight-persistence.ts` — DB persistence
- `v2/pattern-storage.ts` — Pattern storage

---

## Coach Philosophy

The coach configures CoachHelm via `golf_coach_philosophy` table / `CoachPhilosophy` type:

```typescript
interface CoachPhilosophy {
  // Priority rankings (1-5, each unique)
  priorityBallStriking: number;
  priorityShortGame: number;
  priorityPutting: number;
  priorityCourseManagement: number;
  priorityMentalGame: number;

  // Alert sensitivity
  alertSensitivity: 'aggressive' | 'balanced' | 'conservative';

  // Thresholds
  declineThreshold: number;        // 1.0-4.0 strokes
  pressureGapThreshold: number;    // 1.0-4.0 strokes
  bubbleZoneRange: number;         // 0.5-3.0 positions

  // Weight distribution (must sum to 100%)
  weightHistorical: number;        // default 35%
  weightRecentForm: number;        // default 30%
  weightTournament: number;        // default 20%
  weightQualifying: number;        // default 10%
  weightSubjective: number;        // default 5%

  // 11 alert toggles
  alertScoringDecline: boolean;
  alertStatRegression: boolean;
  alertTournamentPressure: boolean;
  alertPlateau: boolean;
  alertBubblePlayer: boolean;
  alertSurgePlayer: boolean;
  alertStreaks: boolean;
  alertRecurringWeakness: boolean;
  alertClosingHoles: boolean;
  alertPar3Issues: boolean;

  // Display preferences
  showStrokesGained: boolean;
  showAdvancedStats: boolean;
  insightVerbosity: 'minimal' | 'standard' | 'detailed';
}
```

---

## Database Tables

### Core CoachHelm Tables
| Table | Purpose |
|-------|---------|
| `golf_coach_philosophy` | Philosophy settings per coach |
| `golf_coachhelm_settings` | Enable/disable per user |
| `golf_team_coachhelm_settings` | Enable/disable per team |
| `golf_coach_insights` | Coach-facing insights |
| `golf_player_focus_areas` | Player development areas |
| `golf_round_reviews` | AI-generated round reviews |
| `golf_patterns_v2` | Detected performance patterns |
| `golf_predictions` | Performance predictions |
| `golf_validations` | Prediction validation records |
| `golf_learned_behavior` | Learned player behaviors |
| `golf_insight_generation_log` | Generation run tracking |
| `golf_insight_effectiveness` | Effectiveness metrics |
| `golf_insight_feedback` | Coach/player feedback |
| `golf_insight_weights` | Insight scoring weights |
| `golf_review_events` | Round review events |
| `golf_review_insights` | Review-extracted insights |
| `golf_prediction_model_performance` | Model accuracy tracking |
| `golf_player_insight_preferences` | Player notification prefs |

### Key Insight Fields
Insights have lifecycle tracking:
- `source_type`: system | coach | pattern | round_review | prediction
- `action_taken`, `action_type`, `action_date`, `action_by`
- `outcome_status`: pending | improved | no_change | worsened | inconclusive

### Pattern Lifecycle
Patterns follow: detected → confirmed → addressed → resolved | dismissed

---

## UI Components (80+)

Located in `src/components/golf/coachhelm/`:

| Directory | Key Components |
|-----------|----------------|
| `insights/` | InsightCard, InsightListView, InsightFiltersPanel, InsightSearchBar, InsightBulkActions, InsightExportModal, PlayerFocusAreas, FocusAreaCard |
| `settings/` | PriorityRanker, ThresholdSlider, SensitivitySlider, WeightDistributor, AlertTypeToggles |
| `patterns/` | PatternDashboard, PatternCard, PatternTimeline, PatternByPlayerView, PatternValidationModal |
| `round-review/` | RoundReviewCard, RoundStatsComparison |
| `analytics/` | Advanced analytics dashboards |
| `alerts/` | Alert notification system |
| `player/` | Player-specific intelligence views |
| `reviews/` | Review history and details |
| `v2/` | Updated intelligence UI |

---

## Server Actions

| Action File | Purpose |
|-------------|---------|
| `coachhelm-analytics.ts` | Analytics computation |
| `intelligence-dashboard.ts` | Dashboard data fetching |
| `pattern-management.ts` | Pattern CRUD |
| `insight-management.ts` | Insight CRUD |
| `insight-evidence.ts` | Evidence tracking |
| `round-reviews.ts` | Review generation |
| `round-review-system.ts` | Review system ops |
| `alerts.ts` | Alert operations |
| `development.ts` | Development tracking |
