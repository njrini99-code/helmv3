# CoachHelm Master Engine, Feature, and Output Remediation Audit

Date: 2026-06-21  
Repository: `/Users/ricknini/Downloads/helmv3`  
Purpose: combine the feature-effectiveness audit and the engine/output-accuracy deep dive into one implementation-grade report.  
Scope: CoachHelm as the AI system inside GolfHelm, for player and coach experiences. This is feature, correctness, output quality, and product completeness work. It is not a security audit.

## Grade

Current engine/output grade: **64/100**.

| Dimension | Current | Target | Gap |
|---|---:|---:|---|
| Raw golf data foundation | 18/20 | 20/20 | Strong data exists; complete missed-direction coverage and provider integrity. |
| Weakness detection | 15/20 | 20/20 | V3 generators are good; hidden V2/V3 split and stale/partial states reduce trust. |
| Root-cause accuracy | 10/20 | 20/20 | Root cause is mostly prose; diagnosis is not structured or auditable. |
| Coach output usefulness | 11/15 | 15/15 | Coach surfaces are broad but some controls lie about state or omit error/cap context. |
| Player output usefulness | 9/15 | 15/15 | Player cards are useful; feedback, LLM fallback, notifications, archive, goals, and chat are incomplete. |
| Learning and validation loops | 1/10 | 10/10 | Goals, predictions, effectiveness, attribution, feedback, and exposure tracking are not one closed loop. |

To reach 100/100, CoachHelm needs fewer new ideas and more contract discipline:

1. Every generated output must say: what was measured, why CoachHelm thinks it happened, whether the "why" is observed or inferred, what action to take, and what future data proves it worked.
2. Every user-visible action must write to the same model the read path consumes.
3. Every learning panel must be backed by exposure, action, outcome, and validation events, not inferred from row existence.
4. Every LLM output must be blocked or retried when citation verification fails.
5. V2 legacy generation must stop creating invisible or misleading output once V3 parity is complete.

## Production Evidence Snapshot

Read-only Supabase inspection on 2026-06-21:

| Area | Current state | Meaning |
|---|---:|---|
| Players with completed scored rounds | 21 | CoachHelm has an analyzable active golf population. |
| Completed scored rounds | 185 | Score/stat foundation is deep enough for real trends. |
| Shot rows | 13,928 | Shot-level root-cause potential exists. |
| Shots with type, club, lie, distance before/after | 13,928 each | The core shot context is present. |
| Shots with miss direction | 4,271 | Miss-direction causality exists but is incomplete. |
| Putt rows with distance/break | 6,030 | Putting root-cause work can be much stronger than it is now. |
| V3 insights | 322 | Generation is active across all 21 analyzed players. |
| V3 insights with structured root cause | 0 | Biggest output contract gap. |
| V3 insights with structured drivers | 0 | Downstream UI cannot audit "why." |
| V3 composite insights | 26 | Best root-cause layer, but too hypothesis-like for its current confidence contract. |
| V3 rows with measured recency/variance | 2 | Confidence mostly means sample adequacy, not stability. |
| Player feedback rows | 2 | Player learning loop has almost no production signal. |
| Coach behavior events | 0 | Coach behavior personalization has no production input. |
| Goal suggestions | 417 total, 222 active pending | Backlog grows instead of staying a ranked shortlist. |
| Goals | 9 active, 0 evaluated, 9 empty snapshots | Goal loop stops after creation. |
| Predictions | 783 total, 623 same-day unvalidated | Prediction panels are not reliable. |
| Chat | 9 conversations, 11 user messages, 6 assistant messages, 0 tool ledgers | Coach chat can orphan turns and cannot prove grounding. |
| LLM calls | 190, with 22 generated unverified non-fallback calls | Verification exists but does not gate display. |
| Insight effectiveness rows | 3,062 | Analytics exists, but it is not unified with V3 attribution and exposure. |
| Outcome attribution rows | 41 | Causality job exists but direction handling is wrong for many metrics. |
| Coach weights | 4 | Too thin to affect ranking; sign bug can make them worse. |

## Supabase Tables and Contracts

Exact production tables used in this audit:

| Table | Rows | Role | Current issue | 100/100 contract |
|---|---:|---|---|---|
| `golf_coach_insights` | 454 | Canonical insight storage. | V3 evidence has metrics but no structured diagnosis/root cause. | Add `evidence.diagnosis`, or migrate diagnosis to first-class columns/table. |
| `golf_patterns_v2` | 247 | Pattern mining output. | Pattern errors/caps can look like empty/all-clear states. | Return paginated data with `{data,total,capped,error}` semantics. |
| `golf_predictions` | 783 | Player forecasts. | Same-day `due_date` strands validation. | Predict future eligible round/event and validate after creation. |
| `golf_prediction_validations` | 17 | Prediction validation rows. | Too few compared with total predictions. | One validation per eligible prediction or explicit retired reason. |
| `golf_prediction_model_performance` | 246 | Model performance rollups. | Polluted by stranded predictions. | Recompute after repairing/retiring invalid horizon rows. |
| `golf_goal_suggestions` | 417 | Engine-suggested goal candidates. | Pending backlog grows to 16-18 per player. | Maintain top two active pending suggestions per player. |
| `golf_goals` | 9 | Player/coach goal loop. | No snapshots/evaluation; accepted suggestions become manual goals. | Snapshot after eligible rounds; preserve suggestion provenance; evaluate. |
| `golf_insight_player_feedback` | 2 | Player rating/dismiss feedback. | Writes are not consumed by canonical player feed. | Feedback read state affects all player insight surfaces. |
| `golf_coachhelm_chat_conversations` | 9 | Coach chat threads. | Some threads contain only user turns. | Each turn has committed `assistant|failed|cancelled` terminal state. |
| `golf_coachhelm_chat_messages` | 17 | Coach chat messages and tool ledger. | No `tool` messages in production. | Persist tool calls/results for data-grounded answers. |
| `golf_coachhelm_llm_calls` | 190 | LLM governance and verification. | `verified=false` text can still render. | Unverified text retries or falls back before display. |
| `golf_coachhelm_llm_budget` | 19 | Daily LLM spend gate. | Chat can write user turn before gate fails. | Gate before turn write, or write visible failed assistant turn. |
| `golf_insight_outcome_attribution` | 41 | V3 causal attribution. | Lower-is-better metrics train backward. | Store normalized `improvement_lift` by metric direction. |
| `golf_coachhelm_coach_weights` | 4 | Learned coach ranking weights. | Too few samples; sign bug can poison rows. | Rebuild after attribution fix; use only calibrated rows. |
| `golf_insight_effectiveness` | 3,062 | Effectiveness rollups. | Separate truth from V3 attribution/exposure. | Roll up from the same event ledger used by learning. |
| `golf_insight_generation_log` | 1,133 | Generation observability. | Mostly legacy V2 labels; no V3 receipt model. | Log generator-level receipts for V3, composites, predictions, goals, notifications. |
| `golf_player_genome` | 45 | Player genome vector. | 28 zero-round/all-null rows. | Only persist valid dimensions; preserve last good vector on source failure. |
| `golf_player_standing` | 305 | Team/college/Tour standing. | Good foundation, but not enough UI state explanation. | Treat as canonical standing source everywhere. |
| `golf_player_notification_state` | 17 | Player notification prefs and quiet mode. | V3 router has no production call site. | Every CoachHelm notification category goes through this router. |
| `golf_coachhelm_settings` | 7 | Coach settings. | Some controls affect legacy or unused behavior. | Each toggle maps to one read/write consumer and one test. |
| `golf_team_coachhelm_settings` | 1 | Team-level generation settings. | Some generator toggles can diverge from visible rows. | Toggle disables generation and retracts relevant visible rows. |
| `golf_rounds` | 191 | Round source data and analysis status. | `coachhelm_analyzed_at` can mark partial failures as success. | Store `analysis_status`, mandatory-generator receipts, retry state. |
| `golf_holes` | 3,375 | Hole scorecard data. | Strong source; composite context sometimes underuses it. | Use for direct sequence/cascade measurement when possible. |
| `golf_shots` | 13,928 | Shot-level root-cause source. | Miss direction incomplete; some composite loaders use wrong lie assumptions. | Normalize units/lies and expose root-cause drivers from shot data. |
| `golf_round_reviews` | 51 | Persisted review output. | Cold review can compute repeatedly before upsert. | One idempotent generation coordinator per round. |

## Main Code and Surface Map

### Engines

| Engine area | Paths |
|---|---|
| V3 base generation | `src/lib/coachhelm/v3/engine/generator-base.ts`, `src/lib/coachhelm/v3/engine/types.ts`, `src/lib/coachhelm/v3/engine/diagnosis.ts`, `src/lib/coachhelm/v3/engine/hole-diagnosis.ts`, `src/lib/coachhelm/v3/engine/shot-source.ts`, `src/lib/coachhelm/v3/engine/window-honesty.ts` |
| V3 generators | `src/lib/coachhelm/v3/generators/approach-miss.ts`, `course-mgmt.ts`, `par-type.ts`, `pressure-gap.ts`, `putt-bias.ts`, `putt-distance.ts`, `scrambling.ts`, `tee-strategy.ts`, `warmup-hole.ts` |
| V3 composites | `src/lib/coachhelm/v3/composite/synthesis.ts`, `loader.ts`, `hole-sequence-loader.ts`, `rules/*.ts`, `types.ts` |
| V3 ranking | `src/lib/coachhelm/v3/ranking/score.ts` |
| V3 counterfactuals | `src/lib/coachhelm/v3/counterfactual/compute.ts`, `lookup-tables.ts`, `baseline-loader.ts`, `player-cohort-loader.ts`, `cohort-baselines.ts` |
| V3 standing | `src/lib/coachhelm/v3/standing/refresh.ts`, `loader.ts`, `metric-config.ts`, `gender-anchor.ts`, `pga-standards.ts` |
| V3 causality and learning | `src/lib/coachhelm/v3/causality/attribute.ts`, `metric-sources.ts`, `src/app/api/cron/v3/causality-attribute/route.ts` |
| V3 goals | `src/app/golf/actions/v3/goals.ts`, `src/lib/coachhelm/v3/goals/loader.ts`, `suggestion-writer.ts`, `types.ts` |
| V3 LLM | `src/lib/coachhelm/v3/llm/compose.ts`, `citations.ts`, `hero-narrative.ts`, `round-review.ts`, `budget.ts`, `types.ts`, `src/app/golf/actions/v3/llm.ts` |
| V3 chat | `src/lib/coachhelm/v3/chat/agent.ts`, `tools.ts`, `persistence.ts`, `types.ts`, `src/app/api/coachhelm/v3/chat/send/route.ts` |
| V3 notifications | `src/lib/coachhelm/v3/notifications/router.ts`, `types.ts`, `src/lib/notifications/insight-notifier.ts` |
| V3 genome | `src/lib/coachhelm/v3/genome/orchestrator.ts`, `loader.ts`, `normalize.ts`, `persona.ts`, `registry.ts`, `dimensions/*.ts` |
| V3 ingest | `src/lib/coachhelm/v3/ingest/providers/arccos.ts`, `arccos-client.ts`, `arccos-mapper.ts`, `garmin.ts`, `trackman.ts`, `src/app/api/cron/v3/ingest-sync/route.ts` |
| Legacy V2 pipeline | `src/lib/coachhelm/v2/orchestrator.ts`, `post-round-trigger.ts`, `prediction/performance-predictor.ts`, `learning/outcome-validator.ts`, `mining/*.ts`, `insights/upsert.ts` |

### Coach UI, Hooks, Routes

| Surface | Paths |
|---|---|
| Coach CoachHelm shell/nav | `src/components/fairway/pages/coachhelm/CoachHelmShell.tsx`, `CoachHelmSubNav.tsx` |
| Brief | `src/components/fairway/pages/coachhelm/FairwayBrief.tsx`, `src/app/golf/actions/team-category-insights.ts` |
| Signals | `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx`, `signals/ScanTeamControl.tsx`, `signals/SignalsToolbar.tsx`, `src/app/golf/actions/alerts.ts`, `pattern-management.ts`, `insight-delivery.ts` |
| Players | `src/components/fairway/pages/coachhelm/PlayersGridView.tsx`, `FairwayPlayerInsight.tsx`, `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx`, `src/app/golf/actions/development.ts` |
| Ask CoachHelm | `src/components/fairway/pages/coachhelm/AskWorkspace.tsx`, `AskThreadPane.tsx`, `AskConversationRail.tsx`, `useCoachChatSend.ts`, `src/app/api/coachhelm/v3/chat/*` |
| Effectiveness | `src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx`, `src/components/golf/coachhelm/analytics/*`, `src/app/golf/actions/coachhelm-analytics.ts` |
| Goals and practice Rx | `src/components/fairway/pages/coachhelm/GoalsSection.tsx`, `FairwayGoalCard.tsx`, `PracticeRxForInsight.tsx`, `PracticeRxPanel.tsx`, `src/lib/coachhelm/v3/practice-rx/composer.ts` |
| Coach settings | `src/hooks/coachhelm/useCoachHelmSettings.ts`, `useCoachPhilosophy.ts`, `src/components/golf/coachhelm/settings/*` |
| Qualifying | `src/components/golf/coachhelm/v3/QualifyingBoard/*`, `src/lib/coachhelm/v3/qualifying/*`, `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/page.tsx` |

### Player UI, Hooks, Routes

| Surface | Paths |
|---|---|
| Player CoachHelm overview | `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx`, `components/PlayerCoachHelmDashboard.tsx`, `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx` |
| Player insight cards | `src/components/golf/coachhelm/insight-card/*`, `src/components/golf/coachhelm/insights/*`, `src/app/golf/actions/insight-delivery.ts` |
| Feedback | `src/app/golf/actions/player-feedback.ts`, `src/app/golf/actions/insight-delivery.ts`, `src/lib/coachhelm/v3/insight-visibility.ts` |
| Round review | `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`, `src/hooks/coachhelm/useRoundReviewV2.ts`, `src/app/golf/actions/round-review-system.ts`, `src/components/golf/coachhelm/v3/RoundReviewLlmCard.tsx` |
| Hero narrative | `src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx`, `src/app/golf/actions/v3/llm.ts`, `src/lib/coachhelm/v3/llm/hero-narrative.ts` |
| Player goals | `src/components/golf/coachhelm/v3/GoalCard/index.tsx`, `GoalCreationModal/index.tsx`, `src/app/golf/actions/v3/goals.ts` |
| Player predictions | `src/components/golf/coachhelm/player/PerformancePrediction.tsx`, `WhatIfPanel.tsx`, `src/app/golf/actions/coachhelm-data.ts` |
| Player development | `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx`, `FocusAreaCard.tsx`, `src/app/golf/(dashboard)/dashboard/my-development/page.tsx` |
| Player chat placeholder | `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx`, `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx` |
| Notification prefs | `src/app/golf/(dashboard)/dashboard/settings/notifications/NotificationPrefsClient.tsx`, `src/components/fairway/pages/settings/FairwaySettingsNotifications.tsx`, `src/lib/coachhelm/v3/notifications/router.ts` |

## Findings

### P0-01. Attribution learns in the wrong direction for lower-is-better metrics

**Why this matters:** This can make CoachHelm prefer worse recommendations. If penalties, score-to-par, double rate, or other lower-is-better metrics go down, that is improvement. Current lift is raw `post - baseline`, so a lower-is-better improvement becomes negative and can reduce weights.

**Evidence:**

- Code: `src/lib/coachhelm/v3/causality/attribute.ts:348-415`, `src/lib/coachhelm/v3/causality/attribute.ts:439-450`.
- Cron: `src/app/api/cron/v3/causality-attribute/route.ts:270-289`.
- Tables: `golf_insight_outcome_attribution`, `golf_coachhelm_coach_weights`.
- Production: 41 attribution rows; 30 target lower-is-better metrics; 4 learned weights.

**Fix:**

- Resolve metric direction from `src/lib/coachhelm/v3/metrics/registry.ts`.
- Store both `raw_delta` and `improvement_lift`.
- Feed only `improvement_lift` into `nextWeight`.
- Rebuild `golf_coachhelm_coach_weights` from corrected history.

**Acceptance tests:**

- A score-to-par drop from `+6` to `+3` increases attribution success.
- A make-rate rise from `40%` to `50%` increases attribution success.
- Identical real-world improvements produce positive `improvement_lift` regardless of metric direction.

### P0-02. Prediction validation is structurally broken

**Why this matters:** CoachHelm presents predictive intelligence, but most predictions cannot validate because they are due the same day they are created.

**Evidence:**

- Code: `src/lib/coachhelm/v2/prediction/performance-predictor.ts:133-150`, `src/lib/coachhelm/v2/prediction/performance-predictor.ts:187-209`.
- Validator: `src/lib/coachhelm/v2/learning/outcome-validator.ts:154-169`.
- Schedule: `vercel.json:32-39`.
- Tables: `golf_predictions`, `golf_prediction_validations`, `golf_prediction_model_performance`.
- Production: 783 predictions; 779 same-day due; 623 same-day unvalidated; 616 overdue unvalidated.

**Fix:**

- Create predictions only for a future eligible round/event, or set `due_date = created_at + prediction_window_days`.
- Validate against the first completed round after `created_at`.
- Exclude or retire old same-day predictions from performance rollups.

**Acceptance tests:**

- A prediction created at 3 PM cannot validate against a round completed before 3 PM.
- A prediction validates against the first subsequent eligible completed round.
- Performance rollups exclude retired invalid-horizon predictions.

### P0-03. LLM verification catches unsupported claims but still displays them

**Why this matters:** Player-visible hero narratives and round reviews can show unsupported numbers even after the verifier marked them unverified.

**Evidence:**

- Verifier: `src/lib/coachhelm/v3/llm/citations.ts:31-52`.
- Return path: `src/lib/coachhelm/v3/llm/compose.ts:146-179`.
- Player actions: `src/app/golf/actions/v3/llm.ts:125-130`, `src/app/golf/actions/v3/llm.ts:222-228`.
- Player components: `src/components/golf/coachhelm/v3/RoundReviewLlmCard.tsx:61-64`, `src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx:65-68`.
- Tables: `golf_coachhelm_llm_calls`, `golf_coachhelm_llm_budget`.
- Production: 6 unverified non-fallback hero calls; 10 unverified non-fallback round-review calls; 6 unverified chat calls.

**Fix:**

- In `compose()`, if `verification.verified === false`, retry once with unmatched-token feedback.
- If retry fails, return `fallbackText` and `used_llm=false`.
- Store `fallback_to_template=true`, `verified=false`, and `citations.reason='verification_failed'`.
- Update UI to display AI badge only when `used_llm && citations_verified`.

**Acceptance tests:**

- A generated text containing an unmatched number returns fallback text.
- UI does not swap fallback text for unverified LLM text.
- LLM call log stores unmatched token evidence.

### P0-04. Round analysis can be marked successful after generator failure

**Why this matters:** A round can look fully analyzed even when a mandatory generator failed. Repair jobs cannot distinguish complete, partial, gated, or failed output.

**Evidence:**

- Error swallowing: `src/lib/coachhelm/v3/engine/generator-base.ts:543-548`.
- Legacy orchestrator counting: `src/lib/coachhelm/v2/orchestrator.ts:346-379`.
- Status write: `src/lib/coachhelm/v2/post-round-trigger.ts:109-141`.
- Tables: `golf_rounds.coachhelm_analyzed_at`, `golf_rounds.coachhelm_failed_at`, `golf_rounds.coachhelm_failure_reason`, `golf_insight_generation_log`.

**Fix:**

- Replace `{ id: null, gated: false }` with explicit receipts:
  - `generated`
  - `gated`
  - `no_data`
  - `standing_lag`
  - `failed`
  - `partial`
- Persist a JSON receipt per generator in `golf_insight_generation_log` or a new `golf_coachhelm_analysis_runs` table.
- Mark `golf_rounds.analysis_status='partial'` when mandatory generators fail.

**Acceptance tests:**

- Forced generator throw marks run partial and retryable.
- Gated/no-data exits do not count as failed.
- Round is not marked analyzed until mandatory receipts close.

### P0-05. Root cause is not a structured output

**Why this matters:** CoachHelm can generate useful diagnosis sentences, but downstream surfaces cannot filter, audit, compare, or learn from root causes because they are embedded in prose.

**Evidence:**

- Tables: `golf_coach_insights.evidence`.
- Production: 322 V3 rows; 0 have `evidence.root_cause`; 0 have `evidence.drivers`; 0 have `evidence.confidence_reason`.
- Code: `src/lib/coachhelm/v3/engine/generator-base.ts:416-529`, `src/lib/coachhelm/v3/composite/types.ts:50-66`.

**Fix:**

Add `evidence.diagnosis` for every V3 insight:

```json
{
  "symptom": "3-5 ft putting below benchmark",
  "root_cause": "start line or face control under short-putt pressure",
  "causality_level": "inferred_hypothesis",
  "drivers": [
    {
      "metric": "putts_made_3_5ft_pct",
      "value": 43,
      "unit": "percent",
      "sample_n": 30,
      "source": "golf_shots.putt_distance_feet"
    }
  ],
  "recommended_action": "Gate drill from 3-5 ft with fixed routine",
  "confidence_reason": "30 attempts; recency measured false; sample adequate but variance unknown"
}
```

**Acceptance tests:**

- Every V3 generator emits `diagnosis`.
- Every composite emits `causality_level`.
- UI renders "observed" versus "inferred" differently.

### P0-06. Composite insights are strong but over-confident

**Why this matters:** Composites are CoachHelm's best root-cause layer, but many are hypotheses formed by combining signals. They should be presented as coach hypotheses unless the actual sequence was measured.

**Evidence:**

- Runner: `src/lib/coachhelm/v3/composite/synthesis.ts:252-284`.
- Lag estimate: `src/lib/coachhelm/v3/composite/rules/lag-distance-3putt.ts:74-80`, `src/lib/coachhelm/v3/composite/rules/lag-distance-3putt.ts:118-125`.
- Pressure inference: `src/lib/coachhelm/v3/composite/rules/pressure-decel-chain.ts:73-119`.
- Tables: `golf_coach_insights`.
- Production: 26 composite rows; 0 have `confidence_factors.factors_measured`; average confidence around 0.77.

**Fix:**

- Add composite confidence normalization in `synthesis.ts`.
- Copy source insight windows into composite windows.
- For estimated chains, set `causality_level='inferred_hypothesis'`.
- For direct shot-sequence chains, set `causality_level='observed_sequence'`.

**Acceptance tests:**

- Composite with static factors gets `factors_measured=false`.
- Estimated 3-putt rate is labeled "estimated" in evidence and UI.
- Direct measured chain can be labeled observed only when source shot sequence proves it.

### P1-07. Goals are created but not measured

**Why this matters:** Goals look like a coaching loop, but the loop stops at creation. That makes player progress and coach intervention look more mature than they are.

**Evidence:**

- Actions: `src/app/golf/actions/v3/goals.ts:116-139`, `src/app/golf/actions/v3/goals.ts:219-256`.
- Suggestion writer: `src/lib/coachhelm/v3/goals/suggestion-writer.ts`.
- Loader: `src/lib/coachhelm/v3/goals/loader.ts`.
- Tables: `golf_goals`, `golf_goal_suggestions`.
- Production: 9 active goals; 0 evaluated; 9 empty snapshots; 4 null current values; all `origin='manual'`.

**Fix:**

- Add `src/lib/coachhelm/v3/goals/evaluator.ts`.
- Evaluate goals from canonical metric registry and standing/stat loaders.
- Snapshot after every eligible completed round and via daily repair.
- Make suggestion acceptance transactional:
  - create goal with `origin='engine_suggested'`;
  - preserve `origin_insight_id`;
  - mark suggestion accepted only if goal insert succeeds.

**Acceptance tests:**

- Accepting suggestion creates an engine-suggested goal with provenance.
- Active goal appends a snapshot after a new eligible round.
- Goal transitions to achieved/missed/expired with evidence.

### P1-08. Goal suggestions grow into a backlog

**Why this matters:** The UI only shows a few suggestions, but the database keeps accumulating hidden pending suggestions. The ranking signal gets noisy.

**Evidence:**

- Writer: `src/lib/coachhelm/v3/goals/suggestion-writer.ts:240-319`.
- Loader: `src/lib/coachhelm/v3/goals/loader.ts:41`.
- Table: `golf_goal_suggestions`.
- Production: 222 active pending suggestions across 15 players; median 16, max 18.

**Fix:**

- Enforce unique active pending suggestion per `(player_id, metric_id)`.
- Keep only top two active suggestions per player.
- Expire or replace stale lower-value suggestions.

**Acceptance tests:**

- Running suggestion writer repeatedly never creates more than two pending active suggestions per player.
- Higher-ranked suggestion replaces lower-ranked stale suggestion.

### P1-09. Player dismiss feedback does not affect canonical visibility

**Why this matters:** The player thinks an insight is dismissed, but the card can return because the read path ignores `golf_insight_player_feedback`.

**Evidence:**

- Feedback write: `src/app/golf/actions/player-feedback.ts:156-190`.
- Canonical read: `src/app/golf/actions/insight-delivery.ts:174-186`, `src/app/golf/actions/insight-delivery.ts:1014-1051`.
- Visibility helper: `src/lib/coachhelm/v3/insight-visibility.ts:52-81`.
- Table: `golf_insight_player_feedback`.

**Fix:**

- Join latest feedback by `(player_id, insight_id)` in player read paths.
- Hide `rating='dismissed'`.
- Return feedback state for UI chips.
- Apply consistently on Overview, Hub, Round Review, and any insight archive.

**Acceptance tests:**

- Dismissed insight disappears after refresh.
- Useful/not-useful state persists on reload.
- Coach visibility is not removed by player-only dismissal unless desired.

### P1-10. Notification preferences are not wired to actual delivery

**Why this matters:** Notification settings become a hollow feature when user preferences and quiet mode do not govern real dispatch.

**Evidence:**

- Router: `src/lib/coachhelm/v3/notifications/router.ts:15-96`.
- Legacy sender: `src/lib/notifications/insight-notifier.ts:187-219`.
- Tables: `golf_player_notification_state`, user notification preference JSON.
- Production: 17 notification-state rows; no production call site for `routeNotification()`.

**Fix:**

- Create `src/lib/coachhelm/v3/notifications/dispatch.ts`.
- All CoachHelm notifications call `routeNotification()`.
- Dispatch respects:
  - category prefs;
  - quiet mode;
  - channel prefs;
  - throttle keys;
  - in-app receipt.

**Acceptance tests:**

- Quiet mode suppresses push/email but can still create in-app receipt if configured.
- Disabled category never dispatches.
- Insight landed/matured/resolved notifications all route through V3 dispatcher.

### P1-11. Coach chat can orphan turns and cannot prove grounding

**Why this matters:** Coach chat should be a reliable analytics assistant. Current production has user-only turns and no persisted tool evidence.

**Evidence:**

- API: `src/app/api/coachhelm/v3/chat/send/route.ts:86-113`, `src/app/api/coachhelm/v3/chat/send/route.ts:125-188`.
- Agent: `src/lib/coachhelm/v3/chat/agent.ts`.
- UI hook: `src/components/fairway/pages/coachhelm/useCoachChatSend.ts`.
- Tables: `golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`, `golf_coachhelm_llm_calls`, `golf_coachhelm_llm_budget`.
- Production: 11 user messages, 6 assistant messages, 0 tool messages.

**Fix:**

- Add `client_turn_id` to requests/messages.
- Budget check before appending user turn, or append an assistant failed-turn message.
- Persist `tool_calls` and `tool_results` for every data-grounded answer.
- Require tool calls for questions containing team/player/stat/pattern/why/compare language.

**Acceptance tests:**

- Budget failure creates no orphan user-only turn.
- Model failure creates visible assistant failure state.
- Retrying same `client_turn_id` is idempotent.
- Data question without tool call fails verification and falls back.

### P1-12. Effectiveness and learning are separate truths

**Why this matters:** CoachHelm cannot honestly say which insights work until exposure, action, and outcome share one event model.

**Evidence:**

- Attribution route: `src/app/api/cron/v3/causality-attribute/route.ts`.
- Analytics: `src/app/golf/actions/coachhelm-analytics.ts`.
- Tables: `golf_insight_outcome_attribution`, `golf_insight_effectiveness`, `golf_coach_insights`.
- Production: 322 V3 insights; 23 have outcome status; 41 attribution rows; recent daily effectiveness rows are mostly zero-signal.

**Fix:**

Add or emulate this event model:

| Event | Required fields |
|---|---|
| exposure | `insight_id`, `player_id`, `coach_id`, `surface`, `shown_at`, `rank_position`, `rank_score` |
| action | `insight_id`, `actor_id`, `actor_role`, `action_type`, `action_at`, `payload` |
| outcome | `insight_id`, `metric_id`, `baseline`, `post`, `direction`, `improvement_lift`, `n_before`, `n_after` |

**Acceptance tests:**

- Analytics and learning read the same source events.
- Insight not shown cannot be counted as surfaced.
- Insight without action cannot be counted as acted.

### P2-13. Round review cold path can compute up to three times

**Why this matters:** Upsert prevents duplicate rows, but not duplicate expensive analysis. This creates latency, cost, and race risk.

**Evidence:**

- Page: `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:411-445`.
- Hook: `src/hooks/coachhelm/useRoundReviewV2.ts:218-354`, `src/hooks/coachhelm/useRoundReviewV2.ts:388-439`.
- Engine: `src/app/golf/actions/round-review-system.ts:1422-1545`.
- Table: `golf_round_reviews`.

**Fix:**

- Create one `getOrCreateRoundReview(round_id)` coordinator.
- Lock by `round_id` before computation.
- Page and hook only subscribe to the coordinator.
- Cache in-progress status.

**Acceptance tests:**

- Two concurrent cold requests create one analysis job.
- UI receives same review id from both callers.

### P2-14. Scan Team writes invisible legacy alert rows and reports false counts

**Why this matters:** Coach clicks Scan Team, sees success/counts, then canonical V3 feed may not reflect those generated rows.

**Evidence:**

- Trigger: `src/components/fairway/pages/coachhelm/signals/ScanTeamControl.tsx:54-68`.
- Legacy action: `src/app/golf/actions/alerts.ts:302-418`.
- V3 visibility: `src/lib/coachhelm/v3/insight-visibility.ts:24-81`.
- Table: `golf_coach_insights`.

**Fix:**

- Replace `generateAlerts` with a V3 roster sweep service.
- Return visible-row delta from canonical read.
- Remove hand-built V2 alert rows once migrated.

**Acceptance tests:**

- Scan Team visible count equals rows returned by canonical feed after reload.
- Insert failure returns error, not success with requested count.

### P2-15. Pattern and insight errors are shown as empty or all-clear

**Why this matters:** A query failure can look like no problems. That is dangerous for coach trust.

**Evidence:**

- Pattern action: `src/app/golf/actions/pattern-management.ts:374-386`.
- Pattern cap: `src/app/golf/actions/pattern-management.ts:89`, `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:1184`.
- Insight read: `src/app/golf/actions/insight-delivery.ts:552-558`.
- Signals top-100 read: `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:373`.
- Tables: `golf_patterns_v2`, `golf_coach_insights`.

**Fix:**

- Use discriminated result:

```ts
type CoachHelmListResult<T> =
  | { ok: true; data: T[]; total: number; capped: boolean; nextCursor?: string }
  | { ok: false; error: string; staleData?: T[] };
```

**Acceptance tests:**

- DB error renders error state, not "all clear."
- Cap renders "showing 100 of N", not "showing all."

### P2-16. Coach player drill-down uses invented ratings

**Why this matters:** Coaches see authoritative-looking ratings that are local heuristics, not canonical standing or evidence.

**Evidence:**

- Page logic: `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx:399-482`.
- Display: `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx:603`.
- Canonical alternative: `golf_player_standing`, V3 ranking/evidence.

**Fix:**

- Replace invented ratings with standing-derived metrics.
- Render unavailable dimensions as unavailable.
- Do not let active focus areas increase performance ratings.

**Acceptance tests:**

- No-round player shows "insufficient data", not rating 50.
- Active focus area does not alter performance score.

### P2-17. Team Brief sampling is not per-player

**Why this matters:** Team trends can overrepresent players with more recent rounds.

**Evidence:**

- Query: `src/app/golf/actions/team-category-insights.ts:697-734`.
- Empty categories counted healthy: `src/app/golf/actions/team-category-insights.ts:853`.
- Tables: `golf_rounds`, `golf_holes`, `golf_shots`.

**Fix:**

- Use SQL `row_number() over (partition by player_id order by round_date desc)` and keep `rn <= 10`.
- Compute team trends only after balanced per-player sampling.

**Acceptance tests:**

- Player A cannot consume Player B's ten-round quota.
- Empty category is "insufficient data", not healthy.

### P2-18. Focus-area ratings mix incompatible units

**Why this matters:** A distance error divided by ten, a causal strength, and a stroke impact can all be displayed as "strokes/round." That is mathematically wrong.

**Evidence:**

- Builder: `src/app/golf/actions/insights.ts:2659-2715`.
- UI: `src/components/golf/coachhelm/player/FocusAreasGrid.tsx:138-169`.

**Fix:**

- Only `evidence.strokes_impact` can be labeled strokes/round.
- Other signals must show their native unit or qualitative opportunity.

**Acceptance tests:**

- Every "strokes/round" label traces to `evidence.strokes_impact`.
- Non-stroke signals render non-stroke units.

### P2-19. V2/V3 transition creates hidden output and confusing logs

**Why this matters:** The system does more work than the visible product uses. Some logs and counts say V2 while the feed filters V3.

**Evidence:**

- Orchestrator: `src/lib/coachhelm/v2/orchestrator.ts:270-453`.
- V3 visibility: `src/lib/coachhelm/v3/insight-visibility.ts`.
- Generation logs: `golf_insight_generation_log`.
- Production: latest 1,000 generation logs were nearly all V2-labeled in prior audit.

**Fix:**

- Create one V3 generation receipt.
- Retire hidden V2 insight creation after parity.
- Keep V2 only for components still explicitly dependent on V2 data.

**Acceptance tests:**

- New generation logs identify V3 generator and composite receipts.
- No invisible V2 alert rows are created by coach-visible controls.

### P2-20. Composite rules underfire due to context/loader issues

**Why this matters:** CoachHelm has enough shot/hole data for more root-cause composites, but some rules do not fire because loaders or preconditions are too narrow.

**Evidence:**

- Early return before raw context when no Tier-1 rows: `src/lib/coachhelm/v3/composite/synthesis.ts:171-190`.
- Flyer lie query: `src/lib/coachhelm/v3/composite/hole-sequence-loader.ts:116-145`.
- Short-game distance unit issue: `src/lib/coachhelm/v3/composite/hole-sequence-loader.ts:85-113`.
- Production: no flyer, closing, front-nine, or long-approach composite outputs in current rows.

**Fix:**

- Load raw context before early return for context-only composites.
- Normalize lie vocab.
- Select and normalize distance units.

**Acceptance tests:**

- Context-only composite can fire without visible Tier-1 rows.
- Lie and unit fixtures fire expected composites.

### P2-21. Genome has empty profiles and incomplete dimensions

**Why this matters:** Genome can become a powerful player identity layer, but empty vectors undermine trust.

**Evidence:**

- Paths: `src/lib/coachhelm/v3/genome/orchestrator.ts`, `src/lib/coachhelm/v3/genome/dimensions/*.ts`.
- Table: `golf_player_genome`.
- Production: 45 genome rows; 28 zero-round/all-null vectors; seven dimensions currently computable.

**Fix:**

- Persist only profiles with at least one valid dimension.
- Preserve last good profile on loader/source failure.
- Label unavailable dimensions explicitly.
- Expand dimensions only when source data is stable.

**Acceptance tests:**

- Zero-round player does not get all-null vector.
- Source failure does not overwrite last good vector.

### P2-22. External ingest can preserve partial completed rounds

**Why this matters:** A failed external import can leave a completed partial round. Later sync can skip it, and CoachHelm will analyze incomplete data.

**Evidence:**

- Arccos provider: `src/lib/coachhelm/v3/ingest/providers/arccos.ts:150-243`.
- Sync route: `src/app/api/cron/v3/ingest-sync/route.ts:83-105`.
- Stubs: `src/lib/coachhelm/v3/ingest/providers/garmin.ts`, `trackman.ts`.
- Schedule: no ingest route in `vercel.json`.

**Fix:**

- Transactional RPC per external round.
- Per-round import receipt and retry state.
- Do not advance provider cursor past failed items.
- Label Garmin/TrackMan unavailable until real.

**Acceptance tests:**

- Hole insert failure rolls back round insert.
- Failed item is retried on next sync.

### P3-23. Player insight history/archive is not real

**Why this matters:** Players cannot review prior CoachHelm intelligence or see what they dismissed, acted on, or outgrew.

**Evidence:**

- Capped overview: `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx:430-449`.
- Redirect: `src/app/golf/(dashboard)/dashboard/my-insights/page.tsx:1-7`.
- Table: `golf_coach_insights`, `golf_insight_player_feedback`.

**Fix:**

- Build `/golf/dashboard/my-insights` as a real archive.
- Filters: active, dismissed, archived, resolved, category, priority, goal-linked.
- Include feedback state and evidence.

**Acceptance tests:**

- Player can find dismissed insight in archive.
- Active overview stays capped while archive paginates.

### P3-24. Player chat is missing

**Why this matters:** Coach chat exists, but players cannot ask contextual questions about their own insights, goals, or rounds.

**Evidence:**

- Disabled page: `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx:27-39`.
- Coach-only route: `src/app/api/coachhelm/v3/chat/send/route.ts:52-64`.
- Player UI teaser: `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx:370-398`.

**Fix:**

- Add player-scoped `src/app/api/coachhelm/v3/player-chat/send/route.ts`.
- Tools limited to self-owned player context.
- Start chats from an insight, round, or goal.
- Use same citation enforcement as coach chat.

**Acceptance tests:**

- Player cannot query another player.
- Insight context is carried into first turn.

### P3-25. Qualifying finalization can be incomplete or misleading

**Why this matters:** Qualifying is coach-critical. Selection state must be atomic and visible to players exactly as committed.

**Evidence:**

- UI: `src/components/golf/coachhelm/v3/QualifyingBoard/CoachPickPanel.tsx:38`.
- State machine: `src/lib/coachhelm/v3/qualifying/state-machine.ts:50`, `src/lib/coachhelm/v3/qualifying/state-machine.ts:83-98`.
- Service: `src/lib/coachhelm/v3/qualifying/service.ts:143-195`.
- Player status: `src/components/fairway/pages/qualifiers/FairwayQualifierLeaderboard.tsx:198-240`.

**Fix:**

- Centralize eligibility in `classifySlots`.
- Finalize via transactional RPC.
- Reload committed selections before travel brief/chat push.
- Player UI reads confirmed selection rows, not inferred rank.

**Acceptance tests:**

- Null-rank players cannot enter coach-pick eligible list.
- Finalize fails unless required final roster is full.
- Player status matches committed selection row.

## 100/100 Implementation Batches

### Batch 0: Protect trust immediately

| Work | Files | Tables | Exit criteria |
|---|---|---|---|
| Enforce LLM verification fallback | `src/lib/coachhelm/v3/llm/compose.ts`, `citations.ts`, `src/app/golf/actions/v3/llm.ts`, `HeroNarrativeCard.tsx`, `RoundReviewLlmCard.tsx` | `golf_coachhelm_llm_calls` | No unverified generated text replaces deterministic fallback. |
| Fix attribution sign | `src/lib/coachhelm/v3/causality/attribute.ts`, `src/app/api/cron/v3/causality-attribute/route.ts`, `src/lib/coachhelm/v3/metrics/registry.ts` | `golf_insight_outcome_attribution`, `golf_coachhelm_coach_weights` | Lower-is-better improvements produce positive learning lift. |
| Add generator receipts | `src/lib/coachhelm/v3/engine/generator-base.ts`, `src/lib/coachhelm/v2/orchestrator.ts`, `src/lib/coachhelm/v2/post-round-trigger.ts` | `golf_rounds`, `golf_insight_generation_log` or new run table | No partial failure is marked complete. |
| Fix coach chat orphan turns | `src/app/api/coachhelm/v3/chat/send/route.ts`, `useCoachChatSend.ts`, `persistence.ts` | `golf_coachhelm_chat_messages`, `golf_coachhelm_llm_budget` | Every user turn gets assistant/tool/failure terminal state. |

### Batch 1: Build the diagnosis contract

| Work | Files | Tables | Exit criteria |
|---|---|---|---|
| Add `evidence.diagnosis` type | `src/lib/coachhelm/v2/insights/types.ts`, `src/lib/coachhelm/v3/engine/types.ts`, `src/lib/coachhelm/v3/composite/types.ts` | `golf_coach_insights` | Type-level requirement for V3 diagnosis. |
| Emit diagnosis from generators | `src/lib/coachhelm/v3/generators/*.ts`, `src/lib/coachhelm/v3/engine/diagnosis.ts` | `golf_coach_insights` | 100% of new V3 insights have symptom/root cause/action/confidence reason. |
| Emit diagnosis from composites | `src/lib/coachhelm/v3/composite/rules/*.ts`, `synthesis.ts` | `golf_coach_insights` | Every composite labels observed vs inferred. |
| Render why panel | `src/components/fairway/pages/coachhelm/CausalWhyPanel.tsx`, `src/components/golf/coachhelm/insight-card/WhyPopover.tsx`, `src/components/golf/coachhelm/insights/EvidencePanel.tsx` | `golf_coach_insights.evidence` | Coach/player can see exact drivers and causality level. |

### Batch 2: Close goals, feedback, notifications

| Work | Files | Tables | Exit criteria |
|---|---|---|---|
| Goal evaluator | new `src/lib/coachhelm/v3/goals/evaluator.ts`, cron route, `src/app/golf/actions/v3/goals.ts` | `golf_goals`, `golf_goal_suggestions` | Goals snapshot and evaluate after eligible rounds. |
| Suggestion cap | `src/lib/coachhelm/v3/goals/suggestion-writer.ts`, `loader.ts` | `golf_goal_suggestions` | Max two active pending suggestions per player. |
| Player feedback read contract | `src/app/golf/actions/player-feedback.ts`, `insight-delivery.ts`, `src/lib/coachhelm/v3/insight-visibility.ts` | `golf_insight_player_feedback` | Dismiss read-after-write passes on all player surfaces. |
| V3 notification dispatcher | new `src/lib/coachhelm/v3/notifications/dispatch.ts`, `router.ts`, `src/lib/notifications/insight-notifier.ts` | `golf_player_notification_state` | Prefs/quiet mode control real delivery. |

### Batch 3: Repair predictions and analytics

| Work | Files | Tables | Exit criteria |
|---|---|---|---|
| Prediction horizon | `src/lib/coachhelm/v2/prediction/performance-predictor.ts`, `src/lib/coachhelm/v2/learning/outcome-validator.ts` | `golf_predictions`, `golf_prediction_validations` | New predictions target future eligible rounds/events. |
| Retire stranded predictions | migration/backfill script | `golf_predictions`, `golf_prediction_model_performance` | Accuracy excludes invalid horizon rows. |
| Unified event ledger | new event actions/RPCs, `coachhelm-analytics.ts`, causality route | new or existing events tables | Analytics and learning reconcile to same events. |
| Exposure tracking | read surfaces: player feed, coach feed, digest, chat | event table | Only shown insights can count as surfaced. |

### Batch 4: Remove duplicate/divergent workflows

| Work | Files | Tables | Exit criteria |
|---|---|---|---|
| Round-review coordinator | `round-review-system.ts`, `useRoundReviewV2.ts`, review page | `golf_round_reviews` | One cold request equals one compute. |
| Scan Team canonical service | `ScanTeamControl.tsx`, `alerts.ts`, V3 sweep route/service | `golf_coach_insights`, `golf_insight_generation_log` | Scan count equals canonical visible row delta. |
| Error/cap result contract | `pattern-management.ts`, `insight-delivery.ts`, `FairwayCoachHelmSignals.tsx` | `golf_patterns_v2`, `golf_coach_insights` | Errors never render as empty/all-clear. |
| Coach player ratings canonicalization | player page, `FairwayPlayerInsight.tsx` | `golf_player_standing`, `golf_coach_insights` | No invented ratings. |

### Batch 5: Complete product surfaces

| Work | Files | Tables | Exit criteria |
|---|---|---|---|
| Player insight archive | `src/app/golf/(dashboard)/dashboard/my-insights/page.tsx`, player insight components | `golf_coach_insights`, `golf_insight_player_feedback` | Search/filter/paginate all player insights. |
| Player chat | new player chat route and tools | chat tables or new player chat tables | Player can ask self-scoped questions. |
| Genome cleanup and expansion | `src/lib/coachhelm/v3/genome/*` | `golf_player_genome` | No all-null vectors; more real dimensions. |
| Ingest transactionality | `src/lib/coachhelm/v3/ingest/*`, ingest cron | provider/round tables | No partial completed external rounds. |
| Qualifying finalization | `src/lib/coachhelm/v3/qualifying/*`, QualifyingBoard components | qualifying tables | Atomic final roster and accurate player status. |

## Target Architecture for 100/100

### Core insight object

Every visible insight should have this shape:

```ts
type CoachHelmInsightEvidenceV3 = {
  metric: string;
  metric_label: string;
  unit: 'percent' | 'strokes' | 'count' | 'yards' | 'feet';
  your_value: number;
  your_value_display: string;
  comparison_value: number;
  comparison_label: string;
  comparison_source: string;
  sample_n: number;
  window_days: number;
  window_start: string;
  window_end: string;
  strokes_impact: number;
  strokes_impact_method: string;
  confidence: number;
  confidence_factors: {
    sample_adequacy: number;
    recency: number;
    variance: number;
    factors_measured: boolean;
  };
  diagnosis: {
    symptom: string;
    root_cause: string | null;
    causality_level: 'observed' | 'observed_sequence' | 'correlated' | 'inferred_hypothesis' | 'unknown';
    drivers: Array<{
      label: string;
      metric?: string;
      value?: number;
      display?: string;
      sample_n?: number;
      source_table?: string;
      source_field?: string;
    }>;
    recommended_action: string;
    confidence_reason: string;
    proof_needed_next: string;
  };
};
```

### Event model

CoachHelm should use one event chain:

1. `generated`: generator produced a receipt.
2. `visible`: insight was eligible for a surface.
3. `exposed`: user actually saw it.
4. `acted`: player/coach accepted, dismissed, assigned, practiced, or shared.
5. `measured`: metric was re-read after eligible rounds.
6. `attributed`: outcome linked to insight with normalized direction.
7. `learned`: rank weights and analytics updated.

Without this chain, the product should not claim effectiveness or personalization.

## Final State UI/UX Remediation

This section adds the Fairway product remediation layer on top of the engine and
data remediation above. The goal is not "make CoachHelm prettier." The goal is
to make CoachHelm actionable, organized, truthful about confidence, and useful
for both coaches and players after the engines are corrected.

The desired final state is:

1. CoachHelm becomes an operating system for daily coaching decisions.
2. Every UI surface shows the same evidence contract the engine writes.
3. Every recommendation has one next action, one owner, one proof target, and one
   outcome state.
4. Coaches can triage a team without hunting across Brief, Signals, Players,
   Effectiveness, Ask, roster, analytics, and settings.
5. Players can understand what to work on today without needing to interpret
   coach-facing analytics.
6. Legacy V2 and pre-Fairway surfaces are retired once the Fairway shell reaches
   parity.

### Current Fairway Surface Map

| User | Surface | Route | Main component | Current role | Final-state role |
|---|---|---|---|---|---|
| Coach | Brief | `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx` | `src/components/fairway/pages/coachhelm/FairwayBrief.tsx` | Team snapshot with category signals. | Daily command brief: what changed, why, who needs action, what is blocked. |
| Coach | Signals | `src/app/golf/(dashboard)/dashboard/alerts/page.tsx`, `insights/page.tsx`, `patterns/page.tsx` | `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx` | Unified triage list for insights and patterns. | Evidence-backed triage inbox with statuses, bulk actions, confidence, source, owner, and outcome. |
| Coach | Players | `src/app/golf/(dashboard)/dashboard/development/page.tsx` | `src/components/fairway/pages/coachhelm/PlayersGridView.tsx` | Roster development grid with focus areas and goals. | Player operating board: readiness, top root cause, active plan, goal progress, last coach action. |
| Coach | Player detail | `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx`, `coachhelm/genome/[playerId]/page.tsx` | `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx`, `GenomeDetailView.tsx` | Player drill-down and genome detail. | One player command page: measured weakness, diagnosis, plan, history, coach notes, Ask context. |
| Coach | Effectiveness | `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/page.tsx` | `src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx` | Analytics cockpit over insight/prediction/pattern performance. | Trust dashboard: where CoachHelm helped, where it was wrong, what is unverifiable, and what changed in ranking. |
| Coach | Ask | `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx` | `src/components/fairway/pages/coachhelm/AskWorkspace.tsx`, `useCoachChatSend.ts` | Two-pane coach chat history. | Evidence-first analyst with visible sources, failed-state repair, and one-click conversion into signal, plan, or message. |
| Coach | Settings | `src/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence.tsx`, `src/components/golf/coachhelm/settings/*` | Settings components and `src/hooks/coachhelm/useCoachHelmSettings.ts` | Mixed settings and legacy controls. | Clear control center for generation, visibility, notification, LLM, ranking, and evidence strictness. |
| Coach | Qualifying | `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/page.tsx` | `src/components/golf/coachhelm/v3/QualifyingBoard/*` | Qualifying selection support. | Decision workspace with locked criteria, CoachHelm rationale, commit preview, and roster status truth. |
| Player | Overview | `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx` | `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx` | Player cockpit with hero insight, themes, prediction, deep dive. | Daily player plan: today's priority, why it matters, what to do, how to prove progress. |
| Player | Development | `src/app/golf/(dashboard)/dashboard/my-development/page.tsx` | `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx`, `GoalsSection.tsx` | Focus areas plus active goals and suggestions. | Work queue: active goals, practice tasks, source insight, progress snapshots, coach/shared state. |
| Player | Game Profile | `src/app/golf/(dashboard)/dashboard/my-game-profile` and `coachhelm/genome/[playerId]` | `GenomeDetailView.tsx`, `src/components/golf/coachhelm/v3/Genome/*` | Genome/standing profile. | Stable identity layer: strengths, tendencies, confidence, last updated, what can change next. |
| Player | Standing | `src/app/golf/(dashboard)/dashboard/my-standing/page.tsx` | `CoachHelmShell role="player"` plus standing components | Personal comparison view. | Context page: you vs team vs benchmark with exact metric direction and next improvement target. |
| Player | Round review | `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` | `src/hooks/coachhelm/useRoundReviewV2.ts`, `src/components/golf/coachhelm/round-review/*`, `RoundReviewLlmCard.tsx` | Post-round review with duplicate-generation risk. | One idempotent post-round review: key change, root cause, next practice, confidence, coach-share state. |
| Player | Chat | `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx` currently gates to coach-only. | `AskWorkspace.tsx` is coach-only. | Disabled/reserved from player insight actions. | Player-scoped Ask CoachHelm, limited to own data, with coach-share and source citations. |
| Player | Notifications | `src/app/golf/(dashboard)/dashboard/settings/notifications/NotificationPrefsClient.tsx`, `FairwaySettingsNotifications.tsx` | Settings and `src/lib/coachhelm/v3/notifications/router.ts` | Preferences exist, router is not fully wired to delivery. | Player controls what CoachHelm can nudge, when, and why. |

### Current UI/UX Bottlenecks

| ID | Bottleneck | Evidence paths | Why it hurts users | Remediation |
|---|---|---|---|---|
| UX-01 | CoachHelm is spread across route islands. | `CoachHelmShell.tsx`, `CoachHelmSubNav.tsx`, `intelligence/page.tsx`, `alerts/page.tsx`, `insights/page.tsx`, `patterns/page.tsx`, `development/page.tsx`, `analytics/coachhelm/page.tsx`, `coachhelm/chat/page.tsx` | The shell unifies presentation, but the product model is still distributed across old route meanings. Coaches must infer whether a thing is a signal, insight, alert, pattern, development item, or analytics row. | Promote the Fairway shell to the canonical CoachHelm route group after parity. Keep legacy paths as redirects or aliases, but expose one mental model: Brief, Signals, Players, Effectiveness, Ask. |
| UX-02 | The UI does not yet force the engine evidence contract. | `src/components/golf/coachhelm/insight-card/*`, `FairwayPlayerCoachHelm.tsx`, `FairwayCoachHelmSignals.tsx`, `FairwayPlayerInsight.tsx` | A card can look confident even when root cause is inferred, sample is thin, LLM verification failed, or the metric direction is uncertain. | Add a shared `EvidenceSummary`, `DiagnosisPanel`, and `ConfidenceMeter` primitive consumed by every insight card and panel. |
| UX-03 | Actions are not one shared loop. | `GoalsSection.tsx`, `FairwayGoalCard.tsx`, `PracticeRxPanel.tsx`, `PracticeRxForInsight.tsx`, `rateInsightAsPlayer`, `player-feedback.ts` | Helpful, dismiss, acknowledge, make a plan, assign focus area, practice Rx, and coach follow-up each write different state. The user cannot see what happened after they acted. | Create one action bar contract: `acknowledge`, `dismiss`, `assign_goal`, `practice`, `message`, `share`, `snooze`, `mark_done`. All actions write event ledger rows and update the card state. |
| UX-04 | Player Ask is teased but not available. | `FairwayPlayerCoachHelm.tsx` disables "Ask CoachHelm about this"; `coachhelm/chat/page.tsx` returns coach-only `FeatureUnavailable`. | Players see a natural next step that does not work. This makes the AI feel unfinished. | Add player-scoped Ask with strict data scope and context injection from the insight, goal, or round review. |
| UX-05 | Effectiveness is too separate from the surfaces where work happens. | `FairwayEffectiveness.tsx`, `coachhelm-analytics.ts`, `golf_insight_effectiveness`, `golf_insight_outcome_attribution` | Coaches see analytics after the fact, but not inline when deciding whether to trust a recommendation. | Surface inline trust chips: "worked 7/11 times for similar players", "new hypothesis", "needs validation", "last 3 outcomes worsened." |
| UX-06 | Signal triage can still become a dense inbox. | `FairwayCoachHelmSignals.tsx`, `SignalsToolbar.tsx`, `ScanTeamControl.tsx` | Grouping, smart defaults, and contextual suppression help, but coaches still need to decide from rows. | Replace raw row scanning with work states: New, Needs coach decision, Assigned, Waiting for data, Improved, Dismissed. |
| UX-07 | Goals look like product objects before the engine can evaluate them. | `GoalsSection.tsx`, `FairwayGoalCard.tsx`, `src/app/golf/actions/v3/goals.ts`, `golf_goals` | Empty snapshots and unevaluated goals can still appear as real plans. | Goal cards must show baseline, target, measurement cadence, next eligible round, last measured value, and evaluation state. |
| UX-08 | Round review and player overview duplicate concepts. | `rounds/[id]/review/page.tsx`, `FairwayPlayerCoachHelm.tsx`, `RecentRoundReviews.tsx`, `RoundReviewViewer.tsx` | Players can get a post-round takeaway and a weekly insight that do not clearly connect. | Round review should feed the same insight/action model. The review's "next practice" becomes a plan candidate in Development. |
| UX-09 | Coach settings are not understandable as product controls. | `FairwaySettingsCoachingIntelligence.tsx`, `useCoachHelmSettings.ts`, `src/components/golf/coachhelm/settings/*`, `golf_coachhelm_settings`, `golf_team_coachhelm_settings` | A coach cannot tell which toggles affect generation, display, notifications, LLM, or ranking. | Rebuild settings around five sections: Generation, Evidence Strictness, Player Visibility, Notifications, Ranking Preferences. Each toggle lists its consumer path and last applied timestamp. |
| UX-10 | Empty, loading, error, and partial states are inconsistent. | `ErrorState` in player page, `FeatureUnavailable`, `InlineNotice`, `InsufficientData`, `CoachHelmDisabledState`, `FairwayEffectiveness.tsx` | Some failures look like no data, some no-team states look like empty analytics, and thin-data states can read as zero. | Create a CoachHelm state taxonomy: `not_configured`, `not_enough_data`, `partial_generation`, `stale`, `failed`, `ready`, `learning`. Apply it to all surfaces. |
| UX-11 | Legacy redesign flag leaves two product languages alive. | `isRedesignEnabled()` forks in all main routes. | The system can pass tests while still shipping old mental models to many users. | Use the remediation batches to remove flag-off CoachHelm branches once each Fairway surface has data parity and test coverage. |
| UX-12 | Coach and player versions do not always share language. | `CoachHelmSubNav.tsx`, `FairwayPlayerCoachHelm.tsx`, `FairwayMyDevelopment.tsx`, `PlayersGridView.tsx` | A coach may assign "focus areas" while a player sees "themes", "goals", "development", and "performance overview." | Standardize vocabulary: Signal, Diagnosis, Plan, Practice, Goal, Outcome. Use the same words in coach and player UI, with role-appropriate detail. |

### Final Coach Information Architecture

Coach IA should be organized around coaching decisions, not internal table names.

| Tab | Primary question | Primary objects | Required data contract | Primary action |
|---|---|---|---|---|
| Brief | What needs my attention today? | Team trend, top 3 decisions, blocked loops, new outcomes. | `golf_coach_insights`, `golf_player_standing`, event ledger, active goals, recent rounds. | Start triage, assign plan, ask why. |
| Signals | Which recommendations need a decision? | Insight rows, pattern rows, composite hypotheses, LLM outputs awaiting verification. | Canonical visible insights plus `evidence.diagnosis`, status, owner, confidence, source, action state. | Acknowledge, assign, snooze, dismiss, batch review. |
| Players | Who needs what from me? | Roster, active plans, risk/readiness, latest root cause, outcomes. | Player summary view built from standings, active goals, insights, events, coach notes. | Open player, assign/reassign, message, mark reviewed. |
| Effectiveness | Can I trust CoachHelm? | Accuracy, lift, validation failures, dead recommendations, model drift. | Event ledger plus predictions, attribution, feedback, generation receipts. | Inspect failing loop, tune settings, retire weak recommendation class. |
| Ask | What does the data say and what should I do? | Conversation, cited facts, tool calls, suggested actions. | Tool ledger rows, source citations, scope, terminal turn state. | Convert answer to signal, plan, message, note, or saved query. |

#### Coach Brief Final State

Current paths:

| Layer | Path |
|---|---|
| Route | `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx` |
| Fairway component | `src/components/fairway/pages/coachhelm/FairwayBrief.tsx` |
| Data loaders | `src/app/golf/actions/team-category-insights.ts`, `src/app/golf/actions/alerts.ts` |
| Shell | `src/components/fairway/pages/coachhelm/CoachHelmShell.tsx` |

Final layout:

| Zone | Content | UX rule |
|---|---|---|
| Masthead | "CoachHelm Brief" plus last generated time, partial/fresh/stale state, signal count. | Never just "Team Brief"; show data freshness because the brief is a decision surface. |
| Today rail | Top 3 coaching decisions, each with player, root cause label, confidence, and action. | One primary CTA per decision. |
| Team movement | What changed since last brief: improved, worsened, newly measurable, stale. | Shows only deltas that have supporting event/round data. |
| Blocked loops | Goals without snapshots, predictions past due, unverified LLM outputs, failed generation receipts. | Makes system incompleteness visible to coaches. |
| Next session plan | Suggested practice clusters by player group. | Must link back to source signals and affected players. |

Example final Coach Brief card:

```tsx
<DecisionCard
  player="Mason Reed"
  title="Short approach misses are feeding 3-putt risk"
  diagnosisLevel="observed_sequence"
  confidence="medium"
  evidence={[
    { label: "Approach 75-125y", value: "31 ft avg proximity", sample: 18 },
    { label: "Following putts", value: "2.4 putts/hole", sample: 18 },
  ]}
  primaryAction={{ label: "Assign distance-control plan", action: "assign_goal" }}
  secondaryAction={{ label: "Ask why", action: "ask", contextId: insight.id }}
/>
```

#### Coach Signals Final State

Current paths:

| Layer | Path |
|---|---|
| Routes | `alerts/page.tsx`, `insights/page.tsx`, `patterns/page.tsx` |
| Component | `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx` |
| Toolbar | `src/components/fairway/pages/coachhelm/signals/SignalsToolbar.tsx` |
| Scan control | `src/components/fairway/pages/coachhelm/signals/ScanTeamControl.tsx` |
| Adapters | `src/components/fairway/pages/coachhelm/signals/patternToInsightVocabulary.ts` |
| Actions | `src/app/golf/actions/alerts.ts`, `pattern-management.ts`, `insight-delivery.ts` |

Final triage states:

| State | Meaning | Entry condition | Exit action |
|---|---|---|---|
| New | CoachHelm generated it and it is visible. | `visible` event exists, no action event. | Review, assign, dismiss, snooze. |
| Needs decision | High confidence or high impact and no owner. | priority high/urgent and no plan/focus/goal. | Assign to player, assign to practice group, message player. |
| Waiting for data | Action exists but outcome window is not ready. | `acted` event exists, next eligible round not complete. | No forced action; show expected measurement date. |
| Measuring | Eligible round exists and snapshot job pending. | round complete, no `measured` event. | Retry measurement or mark blocked. |
| Improved | Outcome lift positive. | `attributed.improvement_lift > threshold`. | Celebrate, archive, convert to habit. |
| No change | Enough data but outcome flat. | measured event with flat result. | Adjust plan or ask CoachHelm for alternative. |
| Worsened | Outcome negative. | normalized lift below threshold. | Escalate, pause, revise diagnosis. |
| Dismissed | Coach/player dismissed. | feedback/action event. | Restore if needed. |

Required UI changes:

1. Replace "all rows first" with grouped work queues.
2. Add row-level confidence badges from `evidence.diagnosis.causality_level`.
3. Add source badges: V3 generator, composite, prediction, LLM, pattern.
4. Add "why this is here" popover on every signal.
5. Add batch action preview before bulk dismiss/assign.
6. Make `ScanTeamControl` show exactly what it generated: added, updated,
   retired, failed, skipped for insufficient data.
7. If pattern or insight query is capped, show the cap and the hidden count in
   the toolbar, not only in a banner.

#### Coach Players Final State

Current paths:

| Layer | Path |
|---|---|
| Route | `src/app/golf/(dashboard)/dashboard/development/page.tsx` |
| Grid | `src/components/fairway/pages/coachhelm/PlayersGridView.tsx` |
| Player drill-down | `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx` |
| Stats cockpit | `src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx` |
| Goals | `GoalsSection.tsx`, `FairwayGoalCard.tsx` |
| Data | `golf_player_stats_cache`, `golf_player_focus_areas`, `golf_goals`, `golf_player_standing` |

Final roster grid columns:

| Column | Source | Why |
|---|---|---|
| Player | `golf_players`, team membership | Stable roster identity. |
| Readiness | standings, recent rounds, active injuries/availability when present | Coach needs triage, not raw stats first. |
| Top diagnosis | `golf_coach_insights.evidence.diagnosis` | Shows root cause, not just weakness. |
| Confidence | sample, variance, causality level, citations verified | Prevents over-trust. |
| Active plan | `golf_goals`, focus areas, practice Rx | Shows whether insight became work. |
| Last action | event ledger | Prevents duplicate coaching. |
| Next proof | goal/effectiveness measurement schedule | Shows when the system will know if it worked. |
| Status | New, waiting, measuring, improved, blocked | Makes player management actionable. |

Final player drill-down sections:

1. Player header: name, team role, last round, data freshness, current status.
2. Root-cause stack: top three diagnoses, causality level, sample, raw facts.
3. Active plan: goals, focus areas, practice Rx, coach ownership.
4. Trend and standing: canonical standing values with metric direction.
5. Outcome history: what CoachHelm recommended, what happened, what it learned.
6. Ask panel: prefilled with the player and selected diagnosis.
7. Coach notes/messages: separate human coaching from AI evidence.

#### Coach Effectiveness Final State

Current paths:

| Layer | Path |
|---|---|
| Route | `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/page.tsx` |
| Component | `src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx` |
| Legacy analytics | `src/components/golf/coachhelm/analytics/*` |
| Actions | `src/app/golf/actions/coachhelm-analytics.ts` |

Final effectiveness cockpit:

| Instrument | Shows | Data requirement |
|---|---|---|
| Trust score | Percentage of outputs with verified evidence and closed-loop measurement. | generation receipts, citation verification, event ledger. |
| Insight lift | Normalized improvement after acted insights. | fixed `improvement_lift`, exposure/action/outcome events. |
| Prediction accuracy | Validated predictions only, excluding retired invalid horizons. | repaired prediction horizon and validation status. |
| Recommendation dead zones | Categories with many suggestions but low action or low lift. | goal suggestion status, feedback, action events. |
| Data health | stale players, missing shots, unverified LLM, failed generators. | generation logs and source-data coverage. |
| Coach preference learning | Which coach actions changed ranking and whether that improved outcomes. | coach behavior events, coach weights, attribution. |

The cockpit should not claim "CoachHelm is helping" until the event ledger can
back that claim. Before then, it should say "Measurement coverage" and show what
percentage of recommendations are actually measurable.

#### Coach Ask Final State

Current paths:

| Layer | Path |
|---|---|
| Route | `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx` |
| Workspace | `src/components/fairway/pages/coachhelm/AskWorkspace.tsx` |
| Send hook | `src/components/fairway/pages/coachhelm/useCoachChatSend.ts` |
| Thread pane | `src/components/fairway/pages/coachhelm/AskThreadPane.tsx` |
| Rail | `src/components/fairway/pages/coachhelm/AskConversationRail.tsx` |
| API | `src/app/api/coachhelm/v3/chat/send/route.ts`, `conversations/[id]` |
| Engine | `src/lib/coachhelm/v3/chat/agent.ts`, `tools.ts`, `persistence.ts` |

Final Ask requirements:

| Requirement | Current weakness | Final behavior |
|---|---|---|
| Tool ledger visible | Production has 0 tool ledger messages. | Every answer can expand "Sources used" with tables, row counts, filters, and timestamps. |
| Terminal turn state | Failed turns can leave orphan user messages. | Assistant reply is `answered`, `failed`, `cancelled`, or `needs_more_data`; no silent orphan. |
| Conversion actions | Chat answer is disconnected from work loop. | Convert answer into signal, goal, focus area, practice group, player message, or saved note. |
| Context launch | Ask can be generic. | Every insight, player, goal, and effectiveness chart has "Ask about this" with context id. |
| Scope clarity | User cannot always tell what data was included. | Thread header shows scope: team, player, date range, sources, exclusions. |

### Final Player Information Architecture

Players need fewer surfaces than coaches. The player experience should be
organized around "what should I do today and how will I know it worked?"

| Tab | Primary question | Primary objects | Required data contract | Primary action |
|---|---|---|---|---|
| Overview | What matters most right now? | Hero diagnosis, next action, recent round delta, active plan. | Top visible insight, diagnosis, standing, feedback state, active goal. | Start practice, ask why, acknowledge, dismiss. |
| Development | What am I working on? | Goals, focus areas, practice Rx, snapshots. | Active goals with baseline, target, current value, source insight, next measurement. | Log progress, mark complete, message coach. |
| Game Profile | What kind of player am I becoming? | Genome, standings, tendencies, strengths, constraints. | Valid genome dimensions only, no all-null vectors, confidence and last update. | Pick focus, compare, share with coach. |
| Standing | Where do I stand? | Player vs team vs benchmark metrics. | `golf_player_standing` with metric direction and cohort size. | Add target to plan. |
| Ask | Why this, what should I practice, what changed? | Player-scoped chat with cited personal facts. | Tool ledger limited to own player data and share controls. | Ask, save answer, share with coach. |

#### Player Overview Final State

Current paths:

| Layer | Path |
|---|---|
| Route | `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx` |
| Fairway component | `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx` |
| Legacy component | `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx` |
| Data loaders | `src/app/golf/actions/insights.ts`, `insight-delivery.ts`, `shot-analytics.ts`, `coachhelm-data.ts` |

Final player overview hierarchy:

1. "Today" card: one top priority, one reason, one action.
2. Evidence strip: metric, sample, comparison, causality label.
3. Practice block: exact drill or task, expected dose, source insight.
4. Progress block: active goal and next measurement.
5. More insights: collapsed, ranked, and clearly lower priority.
6. Deep dive: optional, not competing with the daily priority.

Required player copy pattern:

| Copy field | Example | Rule |
|---|---|---|
| Diagnosis title | "Short approach misses are leaving long first putts." | Must name a measurable pattern. |
| Why it matters | "It added about 2.1 strokes across your last 5 rounds." | Must include sample or comparison. |
| Confidence | "Medium confidence: observed in 18 holes, needs 2 more rounds." | Must say what limits confidence. |
| Action | "Practice 75-100y distance control twice this week." | Must be behavioral and time-bound. |
| Proof | "CoachHelm will recheck proximity and 3-putt rate after your next 2 rounds." | Must explain outcome measurement. |

#### Player Development Final State

Current paths:

| Layer | Path |
|---|---|
| Route | `src/app/golf/(dashboard)/dashboard/my-development/page.tsx` |
| Fairway component | `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx` |
| Goal section | `src/components/fairway/pages/coachhelm/GoalsSection.tsx` |
| Goal card | `src/components/fairway/pages/coachhelm/FairwayGoalCard.tsx` |
| Actions | `src/app/golf/actions/v3/goals.ts`, focus area actions in development route |

Final Development sections:

| Section | Content | Acceptance rule |
|---|---|---|
| Active plan | Up to 3 active goals/focus areas, ranked by importance. | No more than 3 primary items above the fold. |
| Suggestions | Max 2 pending suggestions with source insight and expiry. | No backlog firehose. |
| Practice Rx | Drills grouped by skill and linked to a diagnosis. | No drill without source and target metric. |
| Progress snapshots | Recent values, round links, and notes. | A goal cannot appear "on track" without a snapshot. |
| Completed work | Archived wins and lessons. | Shows outcome, not just completed date. |

Final goal card fields:

| Field | Source | Required? |
|---|---|---|
| Title | `golf_goals.title` | Yes |
| Source | source insight/suggestion/focus area | Yes |
| Baseline | `baseline_value` or first snapshot | Yes for measured goals |
| Target | `target_value`, target source | Yes for numeric goals |
| Current | latest snapshot | Yes after eligible round |
| Next proof | measurement cadence and next eligible round | Yes |
| Owner/share | player-set, coach-assigned, shared with coach | Yes |
| State | active, waiting for data, improved, no change, achieved, needs adjustment | Yes |

#### Player Ask Final State

Player Ask should use the same visual workspace as coach Ask, but with a smaller
scope and safer actions.

| Item | Coach Ask | Player Ask |
|---|---|---|
| Data scope | Team and coach-visible player data. | Authenticated player's own rounds, shots, insights, goals, standings, messages allowed by policy. |
| Context entry | From any coach signal/player/effectiveness card. | From insight, goal, round review, standing, game profile. |
| Actions | Create signal, assign goal, message player, save note. | Add to plan, save answer, share with coach, message coach. |
| Citations | Table, metric, player cohort, date range. | Personal metric, round/date, sample, benchmark. |
| Guardrails | No uncited claims; tool ledger required. | No comparison that exposes teammates unless aggregated and allowed. |

Implementation paths:

| Change | Path |
|---|---|
| Extend shell player tabs to include Ask. | `src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx` |
| Allow `AskWorkspace role="player"` or create `PlayerAskWorkspace`. | `src/components/fairway/pages/coachhelm/AskWorkspace.tsx` |
| Add player-scoped chat route. | `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx` or new `player-chat/page.tsx` |
| Add server auth branch and scoped loaders. | `src/app/api/coachhelm/v3/chat/send/route.ts`, `src/lib/coachhelm/v3/chat/tools.ts` |
| Enable insight CTA. | `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx` |

### Shared Component System Needed

CoachHelm should have a small set of primitives that make every surface speak
the same language.

| Primitive | Purpose | Consuming paths |
|---|---|---|
| `CoachHelmStateBanner` | Standard state for not enough data, partial generation, stale data, failed generation, learning pending. | All CoachHelm pages, round review, settings. |
| `EvidenceSummary` | Shows metric, sample, comparison, source table, date range. | Insight cards, Signals rows, Player Overview, Round Review, Ask citations. |
| `DiagnosisPanel` | Shows root cause, causality level, drivers, confidence reason, proof needed. | Insight panel, Player detail, Round review, Ask answer. |
| `ConfidenceMeter` | Converts sample/variance/citations/causality into a visible trust label. | Cards, panels, effectiveness, brief. |
| `ActionBar` | Standard actions and event writes. | Player cards, coach signal rows, goals, round review. |
| `OutcomeTimeline` | Shows generated, exposed, acted, measured, attributed, learned. | Effectiveness, player detail, goal detail, insight panel. |
| `SourceLedger` | Shows source tables, filters, timestamps, LLM/tool calls. | Ask, LLM cards, evidence popovers. |
| `GoalProgressStrip` | Baseline, target, current, next proof. | `FairwayGoalCard`, player overview, coach player grid. |
| `PracticeRxBlock` | Drill, dose, linked diagnosis, expected metric. | Player overview, development, coach player detail. |
| `FinalStateEmpty` | Role-aware empty states with one CTA. | All empty CoachHelm tabs. |

Suggested directory:

```text
src/components/fairway/pages/coachhelm/primitives/
  ActionBar.tsx
  CoachHelmStateBanner.tsx
  ConfidenceMeter.tsx
  DiagnosisPanel.tsx
  EvidenceSummary.tsx
  GoalProgressStrip.tsx
  OutcomeTimeline.tsx
  PracticeRxBlock.tsx
  SourceLedger.tsx
```

### Hooks and Data Contracts Needed

The current pages load data directly in server components or page-specific
actions. That is fine for SSR, but the final state needs shared view models so
coach and player surfaces cannot drift.

| Hook/loader | Responsibility | Backing tables/actions | Consuming surfaces |
|---|---|---|---|
| `loadCoachHelmBriefView(teamId, coachId)` | Daily coach brief view model. | insights, standings, goals, events, generation receipts. | Coach Brief. |
| `loadCoachSignalQueue(teamId, filters)` | Canonical triage rows with work state. | `golf_coach_insights`, patterns, event ledger. | Signals, Brief. |
| `loadCoachPlayerBoard(teamId)` | Roster rows with diagnosis, plan, outcome state. | players, stats cache, standings, goals, events. | Players. |
| `loadPlayerCoachHelmHome(playerId)` | Player overview view model. | top insight, goals, standing, recent round, feedback state. | Player Overview. |
| `loadPlayerDevelopmentView(playerId)` | Goals, focus areas, suggestions, progress snapshots. | `golf_goals`, suggestions, focus areas, snapshots. | Player Development. |
| `loadCoachHelmTrustView(teamId, range)` | Measurement coverage and trust analytics. | event ledger, predictions, attribution, LLM calls, generation logs. | Effectiveness. |
| `useCoachHelmAction()` | Writes standard event/action states. | event ledger, feedback, goals, focus areas. | Cards and panels. |
| `useCoachHelmAsk()` | Sends chat with context, handles terminal state. | chat API, tool ledger. | Coach Ask, Player Ask. |
| `useCoachHelmFilters()` | URL-synced search/filter/group state. | URL params only. | Signals, Players, Effectiveness. |

The view-model loaders should return discriminated states:

```ts
type CoachHelmSurfaceState<T> =
  | { state: 'ready'; data: T; freshness: FreshnessMeta }
  | { state: 'not_enough_data'; requirements: Requirement[]; partial?: T }
  | { state: 'partial_generation'; data: T; failures: GenerationFailure[] }
  | { state: 'stale'; data: T; staleSince: string; retryAction?: string }
  | { state: 'failed'; error: string; retryAction?: string };
```

### Supabase State Needed For UI/UX Truth

These UI/UX changes depend on the engine/database remediations. If the UI is
built first without these contracts, it will only make incomplete data look more
finished.

| UI need | Supabase source needed | Current gap |
|---|---|---|
| Show confidence honestly. | `evidence.diagnosis`, sample, variance, causality level, citations verified. | Root cause and drivers are not structured. |
| Hide dismissed player insights. | `golf_insight_player_feedback` consumed by canonical visibility reads. | Feedback writes are not applied consistently. |
| Show action state. | Unified event ledger or equivalent `generated/exposed/acted/measured/attributed/learned` records. | Action/event model is split. |
| Show goal progress. | Goal snapshots and evaluation rows. | Active goals have empty snapshots and no evaluation. |
| Show "CoachHelm learned from this." | Corrected attribution and coach weight updates. | Sign bug and tiny coach behavior sample. |
| Show Ask sources. | Chat tool ledger rows and message terminal states. | Production has no tool ledger rows. |
| Show notification control truth. | Delivery path routed through `golf_player_notification_state`. | Router exists but dispatcher is not fully wired. |
| Show "Scan Team" truth. | Generation receipts with added/updated/skipped/failed counts. | Scan can count rows not visible to canonical V3 reads. |
| Show prediction trust. | Future-horizon predictions with validation/retired status. | Same-day predictions are stranded. |

### UI/UX Implementation Batches After Engine Remediation

Do these after the P0/P1 engine contracts are in motion, so Fairway UI does not
solidify around broken data.

| Batch | Name | Scope | Paths | Done when |
|---|---|---|---|---|
| UI-0 | State and vocabulary cleanup | Define shared state taxonomy and CoachHelm vocabulary. | `CoachHelmShell.tsx`, `CoachHelmSubNav.tsx`, new primitives folder. | Every CoachHelm page uses the same empty/error/partial/stale language. |
| UI-1 | Evidence-first cards | Add `EvidenceSummary`, `DiagnosisPanel`, `ConfidenceMeter` to insight cards and panels. | `src/components/golf/coachhelm/insight-card/*`, `FairwayPlayerCoachHelm.tsx`, `FairwayCoachHelmSignals.tsx`, `FairwayPlayerInsight.tsx` | A user can expand any output and see metric, sample, comparison, diagnosis, drivers, confidence reason. |
| UI-2 | Unified action loop | Replace one-off card actions with event-backed `ActionBar`. | `FairwayPlayerCoachHelm.tsx`, `GoalsSection.tsx`, `FairwayGoalCard.tsx`, `PracticeRxPanel.tsx`, `player-feedback.ts`, `goals.ts` | Acknowledge/dismiss/assign/practice/share actions update card state and event ledger. |
| UI-3 | Coach command center | Convert Brief, Signals, Players into one work system. | `FairwayBrief.tsx`, `FairwayCoachHelmSignals.tsx`, `PlayersGridView.tsx` | Coach can start from Brief, triage Signals, and act on Players without losing context. |
| UI-4 | Player daily plan | Convert Overview and Development into one daily plan loop. | `FairwayPlayerCoachHelm.tsx`, `FairwayMyDevelopment.tsx`, `GoalsSection.tsx`, round review page. | Player sees one priority, one plan, progress, proof, and coach-share state. |
| UI-5 | Ask everywhere | Add coach/player context launches and source ledger. | `AskWorkspace.tsx`, `useCoachChatSend.ts`, chat API, insight cards, goal cards, player pages. | Every answer shows sources and can become an action. No orphan turns. |
| UI-6 | Effectiveness as trust layer | Add inline trust chips and rebuild Effectiveness around measurement coverage. | `FairwayEffectiveness.tsx`, analytics components, `coachhelm-analytics.ts` | Effectiveness explains what is measured, unmeasured, wrong, improving, and learned. |
| UI-7 | Retire legacy branches | Remove flag-off CoachHelm branches after parity. | All `isRedesignEnabled()` forks in CoachHelm routes. | The Fairway system is canonical; old UI is deleted or redirected. |

### UI Acceptance Criteria

| Surface | Acceptance tests |
|---|---|
| Coach Brief | Shows top three decisions with evidence and action. Shows stale/partial generation. Links every item to Signals or Player detail. |
| Coach Signals | Filters sync to URL. Work-state buckets reconcile with events. Bulk actions preview affected players. Scan Team reports added/updated/skipped/failed exactly. |
| Coach Players | Roster row shows top diagnosis, active plan, last action, next proof. Player detail keeps the same diagnosis/action/event language. |
| Coach Effectiveness | Does not show authoritative accuracy when validation coverage is thin. Separates verified, unverified, retired, failed, and measured outputs. |
| Coach Ask | Failed send creates visible terminal state. Answer includes source ledger. "Create plan/message/signal" writes the standard action event. |
| Player Overview | One priority above the fold. Dismiss hides it from player feed. Ask CTA works when player chat is enabled, or is absent rather than teased. |
| Player Development | Active goals show baseline, target, current, next proof. Suggestions are capped and expirable. Progress cannot be shown as on-track without snapshots. |
| Player Round Review | One idempotent generation. Next action can be added to Development. LLM text is hidden/retried if unverified. |
| Player Settings/Notifications | Preferences match actual delivery categories. Quiet mode blocks CoachHelm notifications. |
| Responsive shell | Mobile shows one primary action, one nav row, no compressed desktop grids, touch targets remain usable. |

### Final CoachHelm Product Standard, UI Version

CoachHelm reaches 100/100 in UI/UX when every coach and player screen can answer
these questions without opening another tab:

1. What is CoachHelm asking me to pay attention to?
2. Why does CoachHelm think it matters?
3. How strong is the evidence?
4. Is the root cause observed, correlated, inferred, or unknown?
5. What exactly should I do next?
6. Who owns the action?
7. When will CoachHelm re-measure it?
8. What happened last time we acted on this kind of signal?
9. Can I trust this output enough to use it today?

## Required Test Matrix

| Area | Test |
|---|---|
| Attribution | Lower-is-better and higher-is-better paired fixtures. |
| LLM | Unverified text retries/falls back; no UI swap without `citations_verified`. |
| Generator receipts | Mandatory generator throw creates partial state and retry path. |
| Diagnosis | Every V3 generator and composite emits `evidence.diagnosis`. |
| Composite confidence | Static factors become `factors_measured=false`; estimated chains labeled inferred. |
| Goals | Accept suggestion, snapshot, evaluate, expire, idempotent retry. |
| Feedback | Dismiss hides in player feed but not coach feed unless intended. |
| Notifications | Quiet mode and category prefs hit real dispatcher. |
| Chat | Budget/model failure leaves terminal assistant state; data questions require tool evidence. |
| Predictions | Future horizon and first-subsequent-round validation. |
| Analytics | Exposure/action/outcome events reconcile with effectiveness panel. |
| Round review | Concurrent cold loads produce one compute. |
| Signals | Scan Team count equals canonical visible delta. |
| Patterns/insights | DB error renders error; cap renders capped state. |
| Coach ratings | No synthetic performance scores when canonical standing missing. |
| Team brief | Ten rounds per player enforced by partitioned query. |
| Genome | Source failure preserves last good vector; no all-null vector. |
| Ingest | Partial import rolls back; retry advances cursor only after success. |
| Qualifying | Atomic roster finalization and committed player status. |

## How The Grade Moves To 100

| Grade band | What changes |
|---|---|
| 64 -> 72 | Enforce LLM verification, fix attribution sign, repair chat orphan turns, add generator receipts, and make partial/stale/failed UI states visible instead of letting broken outputs look complete. |
| 72 -> 80 | Add structured diagnosis contract and composite hypothesis labeling, then render that contract everywhere through shared evidence, diagnosis, and confidence UI primitives. |
| 80 -> 88 | Goals, feedback, notifications, and prediction validation become closed loops, with unified action bars and visible player/coach work states. |
| 88 -> 94 | Effectiveness and learning use the same exposure/action/outcome event model, and the coach Effectiveness tab becomes a trust dashboard rather than a disconnected analytics page. |
| 94 -> 100 | Remove V2/V3 divergence, complete player archive/chat, harden ingest/genome/qualifying, retire legacy CoachHelm UI branches, finish the Fairway coach/player final IA, and add full engine plus UI coverage. |

## Final Product Standard

CoachHelm reaches 100/100 when a coach or player can open any output and answer:

1. What exactly did CoachHelm measure?
2. How many observations support it?
3. What comparison makes it important?
4. Is the root cause observed, correlated, inferred, or unknown?
5. Which raw facts drove that root-cause claim?
6. What should I do next?
7. Did I do it?
8. Did the relevant metric improve afterward?
9. Did CoachHelm learn from that result?

For coaches, the final Fairway state is Brief -> Signals -> Players -> Effectiveness -> Ask, all backed by the same evidence, action, and outcome ledger. For players, the final state is Overview -> Development -> Game Profile -> Standing -> Ask, all centered on one priority, one plan, and one proof loop.

Right now, CoachHelm mostly answers 1-3 and sometimes 6. The work above gets it answering all nine consistently, then makes those answers visible in the exact UI surfaces where coaches and players decide what to do next.
