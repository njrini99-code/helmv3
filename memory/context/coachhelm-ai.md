# CoachHelm AI — Intelligence Engine Reference

> Last updated: 2026-02-13
> Corrected 2026-07-25: a top-down live-path trace found several statements below stale or wrong — engine version status (V2 vs V3), confidence calibration, the behavior learner, insight lifecycle-state names, composite-rule `sample_n`, effectiveness/trust signals, and which components actually render insights to a coach/player. Corrections are inline and marked "CORRECTED 2026-07-25"; original prose is kept, not deleted. A new "Live vs Built-but-Dark (as of 2026-07-25)" section near the end has the consolidated file:line evidence.

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

### V2 (CORRECTED 2026-07-25: still live-writing, but its output is now largely invisible to coaches/players — see V3 below and "Live vs Built-but-Dark")
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
- `behavior-learner.ts` — Player behavior learning. CORRECTED 2026-07-25: its result is computed and then discarded in `orchestrator.ts` — `await behaviorLearner.getLearnedPreferences()` is awaited but the return value is never assigned or used (confirmed the only reference to `behaviorLearner` in the file). Its `byInsightType` bucketing is also broken upstream: `ACK_TYPES`/`DISMISS_TYPES` (`behavior-learner.ts:63-76`) don't include the rating writer's `interactionType:'feedback'` at all, so those writes aren't counted; and the two writers that ARE counted (`insights.ts:3620` action, `:3726` dismiss) record no real `insight_type` in metadata, so `byInsightType` collapses to one `'unknown'` bucket regardless of source insight type. `getPersonalizedThreshold` (`behavior-learner.ts:288-298`) is a stub with zero callers, blocked on this same writer-key bug. `cross-learner.ts`'s `findSimilarPlayers`/`transferLearning` are complete and correct but also have zero live callers outside their own test.
- `cross-learner.ts` — Cross-player/team learning
- `outcome-validator.ts` — Prediction validation

**Reasoning** (`v2/reasoning/`):
- `reasoning-engine.ts` — Multi-step reasoning
- `confidence-calibrator.ts` — Confidence calibration. CORRECTED 2026-07-25: `ConfidenceCalibrator` was constructed empty and never populated, so "calibrated confidence" shown to coaches/players was raw model confidence wearing a label; and `bootstrapFromDb` applied an epsilon to every bucket's upper edge, misfiling 4 of 5 buckets one band low. **Both are now fixed on this branch.** Still open: the single calibrator instance is bootstrapped once against `prediction_type='score_to_par'` (`orchestrator.ts` `ensureCalibrationBootstrapped`) and then reused for unrelated reasoning types (`pattern_detected`, `performance_change`, `shot_pattern`) — those get raw-passthrough confidence mislabeled as calibrated, and no validation pipeline can ever populate their own buckets because `performance-predictor.ts` only ever writes `metric:'score_to_par'` into `golf_predictions`.

**NLG** (`v2/nlg/`):
- `insight-composer.ts` — Data → human-readable insights

**Services:**
- `v2/services/insight-persistence.ts` — DB persistence
- `v2/pattern-storage.ts` — Pattern storage

### V3 (ADDED 2026-07-25 — previously undocumented in this file, despite being the engine every visible read path actually requires)
Location: `src/lib/coachhelm/v3/`

This doc previously described only V1/V2 and never mentioned V3, even though V3 is what the shared read-time filter `applyInsightVisibility` (`src/lib/coachhelm/v3/insight-visibility.ts:34,38,77-82`) requires — `engine_version='v3'` OR `signature LIKE 'v3:%'`, `lifecycle_state IN (detected, matured, addressed, resolved)`, `status <> 'dismissed'` — before a row can reach *any* coach/player surface (Triage Desk, player Hub/CoachHelm feed, per-player Scouting Report, round-review takeaway, roster top-insight card, morning-digest email). Key modules, verified live:
- `v3/insight-visibility.ts` — the shared visibility gate, called from ~20 sites across insight-delivery.ts, insight-management.ts, alerts.ts, intelligence-dashboard.ts, drills.ts, whats-new.ts, command-palette.ts, coachhelm-analytics.ts, player-effectiveness.ts, v3/chat/tools.ts, v3/recap/builder.ts, v2/analytics/effectiveness-writer.ts, and the coach-morning-digest cron
- `v3/composite/rules/*.ts` — 10 composite rule files (lag-distance-3putt, pressure-decel-chain, short-approach-proximity-gap, bunker-miss-side-amplifier, long-approach-3putt-cascade, closing-hole-fatigue, doubles-after-bogey, flyer-lie-over-the-green, front-9-starter, short-side-scrambling-chain) plus `composite/synthesis.ts` (`normalizeCompositeEvidence`)
- `v3/ranking/score.ts` — self-documented as "the SINGLE ranking contract for every read surface" (`coachabilityBoost`, `scoreInsight`)
- `v3/insights/upsert-v3.ts` — the only write path that stamps `engine_version='v3'`
- `v3/effectiveness/event-ledger.ts` — the exposure/action/outcome ledger (`getInsightEffectivenessSignals`); backs `InsightTrustChips`, which is built and correct but rendered nowhere — see "Live vs Built-but-Dark" below
- `v3/goals/`, `v3/practice-rx/`, `v3/metrics/registry.ts` — goal suggestions, practice-Rx prompt composition, canonical `MetricId` vocabulary

v2 and v3 `insight_type` vocabularies are almost entirely disjoint (only `course_management` overlaps: v2 = approach/bubble_player/course_management/pattern_detected/putting/recurring_weakness/scoring_decline/short_game/team_trend; v3 = approach_miss/composite/course_management/par_scoring/pressure_gap/putt_bias/putt_distance/scrambling/tee_strategy/warmup_hole). A v2-authored insight has no v3 successor — see the v2 coach-alert family note in "Live vs Built-but-Dark."

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
| `golf_insight_effectiveness` | Effectiveness metrics — UNVERIFIED 2026-07-25 whether this is distinct from, or a legacy name for, the ledger below; not checked this pass |
| `golf_insight_exposure` / `golf_insight_action` / `golf_insight_outcome` | ADDED 2026-07-25 — the actual live effectiveness ledger (`src/lib/coachhelm/v3/effectiveness/event-ledger.ts`), read by `getInsightEffectivenessSignals`. `golf_insight_action` had exactly 3 rows in prod today, all `action_type='create_focus'` — zero `dismissed`/`acknowledged`/`resolved` rows despite those write paths being live and wired |
| `golf_coach_behavior_log` | ADDED 2026-07-25 — backs the fully-built-but-unwired `coach-behavior.ts` (derivePreferences/prioritizeForCoach/recordAction/queryActions); **0 rows ever written in prod** — confirmed orphaned feature, not just under-used |
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
  - CORRECTED 2026-07-25: this field renders (the `OutcomeBadge` pill, `InsightCard.tsx:118-178`, rendered at `:466` default / `:605` hero) but is **100% NULL on all 548 prod rows today**. The writer, `metricToRoundField` (`v2/analytics/effectiveness-writer.ts:326-354`), only recognizes v2-era metric names — none of the v3 generators' `MetricId`s (e.g. `sg_ott`, `opening_hole_delta`, `practice_tournament_delta`) match, so `backfillInsightOutcomes` returns null for essentially every row. A live, rendered badge with nothing to show.

### Pattern Lifecycle
Patterns follow: detected → confirmed → addressed → resolved | dismissed

> CORRECTED 2026-07-25: this doesn't match `golf_coach_insights.lifecycle_state` in prod. Live values (548-row census taken today) are `detected → tentative → matured → addressed → resolved`, plus `archived` as an engine-retracted terminal state (191/548 rows, 138 of them v3, 53 v2) — there is no `confirmed` state. "Dismissed" is tracked on a separate `status` column (`status <> 'dismissed'`), not as a `lifecycle_state` value. The read-time filter (`applyInsightVisibility`, see V3 section above) requires `lifecycle_state IN (detected, matured, addressed, resolved)` — `archived` and `tentative` rows are excluded from every coach/player surface by design. Note also: RLS on `golf_coach_insights` (5 policies) gates only on ownership joins (coach_id/team_id/player_id) — none of the 5 policies reference `lifecycle_state`/`status`/`engine_version`, so `applyInsightVisibility` is the *only* line of defense against a coach/player seeing an archived/tentative/v2-phantom row; a read path that skips it, or a future RPC querying the table directly, has no DB-level backstop.

---

## UI Components (80+)

Located in `src/components/golf/coachhelm/`:

> CORRECTED 2026-07-25: this directory is not the whole picture. Several of the components a coach/player actually sees live outside it — under `src/components/fairway/pages/coachhelm/` (e.g. `FairwayPlayerInsight.tsx`, the real coach insight-card render site) and `src/components/fairway/cards-insight/` (a second, independent `InsightCard` used on the player Hub). See "Live vs Built-but-Dark" near the end of this doc before assuming a component listed here is what a user sees.

| Directory | Key Components |
|-----------|----------------|
| `insights/` | InsightCard, InsightListView ⚠️DEAD, InsightFiltersPanel, InsightSearchBar, InsightBulkActions, InsightExportModal, PlayerFocusAreas, FocusAreaCard |
| `settings/` | PriorityRanker, ThresholdSlider, SensitivitySlider, WeightDistributor, AlertTypeToggles |
| `patterns/` | PatternDashboard, PatternCard, PatternTimeline, PatternByPlayerView, PatternValidationModal |
| `round-review/` | RoundReviewCard, RoundStatsComparison |
| `analytics/` | Advanced analytics dashboards |
| `alerts/` | Alert notification system |
| `player/` | Player-specific intelligence views |
| `reviews/` | Review history and details |
| `v2/` | Updated intelligence UI |

> CORRECTED 2026-07-25 — dead components confirmed by grep (zero real, non-test, non-barrel importers anywhere in `src/`):
> - **`InsightListView`** and **`InsightsFeed`** (`insights/index.ts:8-9`) — both built for the coach surface at `/dashboard/insights`, which is now a `permanentRedirect` shim to `/golf/dashboard/intelligence?view=signals`. The only real consumer of that barrel is `PlayerFocusAreas`, imported by `FairwayPlayerDashboard.tsx:56`.
> - **`DrillAttachment.tsx`** — superseded by `PracticeRxPanel.tsx` (`fairway/pages/coachhelm/`), which self-documents the supersession ("mirrors the legacy DrillAttachment contract... copied verbatim from the legacy DrillAttachment").
> - **`InsightTrustChips.tsx`** (`fairway/pages/coachhelm/`) — fully built, reads real ledger data via `getInsightTrustSignals` (`coachhelm-analytics.ts:1352`), rendered nowhere. Its data path is proven end-to-end by `FairwayEffectiveness.tsx:1426` — which is itself dead (zero `<FairwayEffectiveness` JSX usages anywhere in `src/`).
> - **`HeroInsightCard.tsx`**'s exported wrapper (staggered title→metric→content→drills reveal) — every real hero-density card renders through a separate, duplicate local function, `HeroInsightCardInner` (`InsightCard.tsx:529-530`), which has no stagger/reveal logic at all. `HeroInsightCard` itself is only referenced in its own test.
> - **`FairwayPlayerCoachHelm.tsx`** and **`FairwayMyDevelopment.tsx`** (`fairway/pages/coachhelm/`) — documented in their own barrel as the player front doors for `/dashboard/coachhelm` and `/dashboard/my-development`, but neither route renders them; both are actually served by `PlayerCoachHelmHome.tsx` / `DevelopmentDrill`.
> - **`SectionBand`** inside `FingerprintHero.tsx` (the coach per-player game page) — its own doc comment calls it "the shared chrome every other section renders inside of," but it has zero importers anywhere; only `MetricPill` from that same file is live.
>
> **The actual live coach card render site** is `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx:866,871` (reached via `players/[playerId]/game/page.tsx` → `PlayerDeepDiveTabs.tsx:113`), rendering `src/components/golf/coachhelm/insight-card/InsightCard.tsx`. There are **two different, both-live** components named `InsightCard` — that one, and an unrelated second one at `src/components/fairway/cards-insight/InsightCard.tsx` used by the player Hub (`HubInsightSignalCard.tsx:41`). Don't conflate reachability between them when searching "is InsightCard used?"
>
> Also DARK: `getPlayerCoachHelmDashboard`'s returned `data.insights` field (merged evidence-backed insights, correctly gated by `applyInsightVisibility`, computed at `insights.ts:3030-3047`) is fetched and passed as a prop at `coachhelm/page.tsx:208-210,452` but `PlayerCoachHelmHome.tsx` never reads `data.insights` — only `data.focusAreas/prediction/recentRounds/playerState/playerName`. The cards a player actually sees come from a separate, correctly-wired `topInsight`/`secondaryInsights` prop pair (`coachhelm/page.tsx:212-214,459-460`, via `insight-delivery.ts`). Same disease, one more instance: a correctly-computed, fully-served insight list nothing reads.

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
| `insights.ts` | ADDED 2026-07-25 (previously missing) — the large action file behind `loadEvidenceBackedInsights` (feeds `getPlayerCoachHelmDashboard`), the v2 `upsertInsight()` write path, and `triggerPlayerInsightsAfterRound` (writes the v2 coach-alert family: bubble_player, pattern_detected, streak, etc.) |
| `insight-delivery.ts` | ADDED 2026-07-25 (previously missing) — the real coach/player read path: `getTopInsightForPlayer`, `getInsightsForPlayer`, `getInsightsForCoachWithMeta`, `getRoundTakeawayInsight`; every function here is gated by `applyInsightVisibility` |
| `signal-groups.ts` | ADDED 2026-07-25 (previously missing) — coach Triage Desk / Brief query (`getSignalGroups`, `:130-139`); same visibility filter, no row limit |

> CORRECTED 2026-07-25: every read path above (plus the round-review takeaway, roster top-insight card, and the coach-morning-digest cron) shares one visibility gate, `applyInsightVisibility` (`src/lib/coachhelm/v3/insight-visibility.ts`, see V3 section above) — it is **not** backstopped by RLS. A live prod census today: this filter currently excludes 292/548 `golf_coach_insights` rows (53%) — 191 archived, and 101 v2-engine rows (20 of which are still `lifecycle_state='detected'` from the engine's own point of view, i.e. not retracted, just permanently invisible on every surface). Most of that v2 exclusion is deliberate quarantine of known-bad output (impossible `strokes_impact` values that poisoned ranking) — but it has real collateral: the entire v2 "coach-alert" generator family (bubble_player, pattern_detected, streak, surge_player, plateau, tournament_pressure, closing_holes, par_3_issues, recurring_weakness, team_trend, scoring_decline — written via `insights.ts`'s `upsertInsight()`, never `upsertInsightV3`) has no v3 successor and is 100% invisible on every coach surface including the Alert Center — even though it is actively still being generated today via the post-round trigger and the `coachhelm-roster-sweep` cron (`vercel.json`, daily 03:45 UTC).

---

## Live vs Built-but-Dark (as of 2026-07-25)

Added by a top-down live-path trace, cross-checked against a live prod `golf_coach_insights` census (548 rows / 30 players today). **LIVE** = confirmed reachable from a real page/cron a coach or player hits. **DARK** = computed/exported correctly but has zero live renderer or consumer. This section is a quick-reference index into the inline corrections above — read those for full evidence; file:line here points at the primary source.

| Item | Status | Evidence |
|---|---|---|
| Coach insight cards (Scouting Report / Deep Dive) | LIVE | `players/[playerId]/game/page.tsx` → `PlayerDeepDiveTabs.tsx:113` → `FairwayPlayerInsight.tsx:866,871` → `InsightCard` (`coachhelm/insight-card/InsightCard.tsx`) |
| Player Hub signal card | LIVE | `HubInsightSignalCard.tsx:41` → separate `InsightCard` at `fairway/cards-insight/InsightCard.tsx` |
| Player CoachHelm feed (topInsight/secondaryInsights) | LIVE | `coachhelm/page.tsx:212-214,459-460` via `insight-delivery.ts` |
| Coach Triage Desk / Brief | LIVE | `signal-groups.ts:130-139` (`getSignalGroups`) |
| `getPlayerCoachHelmDashboard`'s `data.insights` field | DARK | Computed `insights.ts:3030-3047`, passed `coachhelm/page.tsx:452`, never read by `PlayerCoachHelmHome.tsx` |
| `InsightListView`, `InsightsFeed` | DARK | Only barrel importer is `PlayerFocusAreas`; built for the now-redirected `/dashboard/insights` route |
| `InsightTrustChips` | DARK | Zero non-self importers; data source (`getInsightTrustSignals`, `coachhelm-analytics.ts:1352`) proven live-correct by `FairwayEffectiveness.tsx:1426`, which is itself DARK |
| `OutcomeBadge` (per-card outcome pill) | DARK (renders, never populated) | `outcome_status` NULL on 548/548 prod rows; writer (`v2/analytics/effectiveness-writer.ts:326-354`) only maps v2 metric names, v3 `MetricId`s never match |
| `DrillAttachment.tsx` | DARK | Superseded by `PracticeRxPanel.tsx` |
| `FairwayPlayerCoachHelm.tsx`, `FairwayMyDevelopment.tsx` | DARK | Neither route renders them; superseded by `PlayerCoachHelmHome.tsx` / `DevelopmentDrill` |
| `HeroInsightCard.tsx` wrapper (staggered reveal) | DARK | Live hero cards render via duplicate local `HeroInsightCardInner` (`InsightCard.tsx:529-530`), no stagger |
| `SectionBand` (inside `FingerprintHero.tsx`) | DARK | Zero importers; only `MetricPill` from that file is live |
| v2 coach-alert insight family (bubble_player, pattern_detected, streak, surge_player, plateau, tournament_pressure, closing_holes, par_3_issues, recurring_weakness, team_trend, scoring_decline) | LIVE-WRITTEN, DARK-READ | Actively generated daily (post-round trigger + `coachhelm-roster-sweep` cron), 100% excluded from every read surface — `engine_version` never stamped `v3` for this family, no v3 successor exists |
| `BehaviorLearner.getLearnedPreferences()` in orchestrator | DARK | Result awaited and discarded — only reference to the local var |
| `BehaviorLearner.getPersonalizedThreshold` | DARK (stub, zero callers) | Blocked on the `ACK_TYPES`/`DISMISS_TYPES` + missing-`insight_type`-in-metadata writer bug |
| `coach-behavior.ts` (derivePreferences/prioritizeForCoach/recordAction/queryActions) | DARK | `golf_coach_behavior_log` has 0 rows ever written in prod |
| `CrossLearner.transferLearning` (cold-start pattern transfer) | Built, unused | No caller outside its own test; `golf_global_patterns` (25 rows) proves the team-level half it builds on works |
| `ConfidenceCalibrator` empty-construction + epsilon bucket bug | **FIXED on this branch (2026-07-25)** | Was DARK/wrong before; now correct, but still bootstrapped only for `score_to_par` — other reasoning types get mislabeled raw confidence |
| `sample_n` on `short_approach_proximity_gap`, `bunker_miss_side_amplifier`, `long_approach_3putt_cascade` composite rules | WRONG (hardcoded literal, not computed) | Each rule's `compose()` ships a literal (10, 5, 5); `lag-distance-3putt.ts` and `pressure-decel-chain.ts` compute it correctly from evidence and are the pattern to copy |
| 17 insight rows (3 players) with `coach_id=NULL AND team_id=NULL` | DARK for every coach | `resolvePlayerOwnership()` returns nulls when no active roster row exists at generation time; coach-side authorization keys off live team membership, not the row's own columns — permanently unreachable until the player has/regains an active roster row |

None of the above indicates fabricated or mock insight data — every DARK item is real computed output with no live consumer, not invented content. No route was found rendering mock/sample/placeholder insight data in production code.
