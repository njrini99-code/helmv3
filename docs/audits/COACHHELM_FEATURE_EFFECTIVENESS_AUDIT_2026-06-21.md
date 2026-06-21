# CoachHelm Feature Effectiveness Audit

Date: 2026-06-21  
Repository: `/Users/ricknini/Downloads/helmv3`  
Commit audited: `748037b56e95` (`main`, matching `origin/main`)  
Scope: CoachHelm as the AI system inside GolfHelm, for both players and coaches. This is a feature, correctness, completeness, and bottleneck audit, not a security audit.

## Executive Verdict

**Overall feature-readiness assessment: 61/100.**

CoachHelm has a strong statistical base and a broad shipped surface. It produces evidence-backed insights, rankings, standings, patterns, predictions, genomes, goals, round reviews, qualifying assistance, chat, and analytics. The canonical stats verifier is clean, and the focused CoachHelm test suite is large and green.

The main weakness is the system after generation. Several closed loops are incomplete or work backward:

- lower-is-better outcomes train coach weights in the wrong direction;
- most predictions cannot validate because they expire at the start of their creation day;
- goals are created but never measured or snapshotted;
- goal suggestions accumulate instead of staying a ranked shortlist;
- player dismiss feedback does not remove the insight from canonical reads;
- notification preferences are saved but not used by actual delivery;
- generator failures can be reported as successful analysis;
- several coach controls use a different write/read contract from the live V3 feed.

This explains the production shape: CoachHelm is **generation-heavy but learning-light**. The engine creates plenty of output, but user response, outcome measurement, and downstream adaptation are sparse or disconnected.

### Rubric

| Area | Score | Summary |
|---|---:|---|
| Data and stat foundation | 19/20 | Canonical cache/holes/rounds verifier: 20 players checked, 0 divergent. |
| Insight generation and evidence | 15/20 | Broad V3 generator coverage and honest evidence, but failures can be swallowed and composites underfire. |
| Player feature completeness | 10/20 | Strong overview/standing/genome/review surfaces; feedback, notifications, goals, archive navigation, and chat are incomplete. |
| Coach feature completeness | 11/20 | Broad Brief/Signals/Players/Ask/Effectiveness suite; several actions, ratings, caps, and error states are misleading. |
| Learning and effectiveness loop | 6/20 | Attribution exists, but directionality, prediction validation, goal evaluation, exposure tracking, and analytics contracts are incomplete. |

## Current Production Evidence

Read-only Supabase inspection on 2026-06-21 found:

| Feature data | Current state | Interpretation |
|---|---:|---|
| V3 insights | 322 | Generation is active across all 21 players with completed rounds. |
| Player feedback | 2 rows | The player feedback loop has almost no adoption and one dismissal is still visible. |
| Learned player interactions | 15 rows across 2 players | Personalization exists but is extremely thin. |
| Coach behavior events | 0 | The separate coach-behavior personalization subsystem has no production input. |
| Attribution rows | 41 | The causality job is active. Thirty target lower-is-better metrics. |
| Learned coach weights | 4 | Learning has begun, but the sign bug can move these weights incorrectly. |
| Predictions | 783 | 779 are due the same day; 623 are unvalidated and 616 are overdue. |
| Active goals | 9 | All have empty snapshots; none has been evaluated; four have null current value. |
| Goal suggestions | 417 total / 222 active pending | Fifteen players have active suggestions; median 16, maximum 18. |
| Chat | 9 conversations / 17 messages | Shipped but lightly exercised. |
| LLM calls | 190 | 22 generated responses were unverified but not replaced: 6 chat, 6 hero, 10 review. |
| Genomes | 45 | 28 are zero-round/all-null genomes; seven dimensions are currently computable. |
| Effectiveness rows | 3,062 | Recent daily snapshots are largely zero-signal and do not represent the V3 learning table directly. |

## Critical Feature Defects

### F01. Learning rewards worse outcomes for lower-is-better metrics

**Impact:** CoachHelm can learn the opposite of reality. Lower scores, penalties, big-number rates, and several scoring metrics should improve when they decrease. The attribution code computes raw `post - baseline`, and `nextWeight` treats positive lift as success.

Evidence:

- `src/lib/coachhelm/v3/causality/attribute.ts:348-415` computes raw delta/lift with no metric-direction normalization.
- `src/lib/coachhelm/v3/causality/attribute.ts:439-450` maps positive lift toward higher learned weights.
- `src/app/api/cron/v3/causality-attribute/route.ts:270-289` feeds the raw lift into coach weights.
- Live Supabase: 30 of 41 attributions target lower-is-better metrics; four learned weights already exist.

Fix:

1. Resolve canonical `MetricDefinition.direction` during attribution.
2. Normalize lift to `improvementLift` before calling `nextWeight`.
3. Recompute the 41 attribution rows and rebuild the four weights from normalized history.
4. Add paired higher-better/lower-better tests with identical real-world improvement.

### F02. Most predictions cannot validate

**Impact:** The prediction feature creates large volumes of apparently measurable forecasts but leaves most permanently unvalidated, so accuracy and calibration panels are not credible.

Evidence:

- `src/lib/coachhelm/v2/prediction/performance-predictor.ts:133-150` defaults the prediction target to `new Date()`.
- `src/lib/coachhelm/v2/prediction/performance-predictor.ts:187-209` stores that date as `due_date`.
- `src/lib/coachhelm/v2/learning/outcome-validator.ts:154-169` validates from `created_at` through `due_date` parsed at UTC midnight, usually making the window end before prediction creation.
- `vercel.json:32-39` schedules validation weekly despite the route's more frequent operating assumption.
- Live Supabase: 779/783 predictions are same-day; 623 remain unvalidated; 616 are overdue.

Fix:

- Predict a specific future round/event or a configurable future horizon.
- Validate against the first eligible completed round after creation, not midnight at the start of the due date.
- Run validation daily or event-driven after round submission.
- Repair or explicitly retire the 623 stranded predictions before displaying aggregate accuracy.

### F03. Goals are created but never measured

**Impact:** A player can accept or create a goal, but CoachHelm does not update current value, append snapshots, evaluate the outcome, or preserve engine-suggestion provenance. The product presents an active-goal loop that stops after creation.

Evidence:

- `src/app/golf/actions/v3/goals.ts:116-139` says a cron updates current value, but no production evaluator exists and every goal is stored as `origin='manual'`.
- `src/app/golf/actions/v3/goals.ts:219-256` accepts suggestions by creating an unlinked manual goal, then updates suggestion state without checking the update result.
- Live Supabase: nine goals, zero evaluations, nine empty snapshot arrays, four null current values, all origin `manual`.

Fix:

- Build one goal evaluator on the canonical metric registry.
- Snapshot active goals after eligible rounds and on a daily repair job.
- Transition goals to achieved/missed/expired with auditable evidence.
- Preserve `origin='engine_suggested'`, `origin_insight_id`, and suggestion id.
- Make acceptance transactional/idempotent.

### F04. Goal suggestions accumulate instead of remaining a shortlist

**Impact:** The UI shows only three suggestions while the database holds up to 18 active suggestions for a player. Each daily run excludes existing pending metrics, then adds two different metrics, steadily growing the backlog.

Evidence:

- `src/lib/coachhelm/v3/goals/suggestion-writer.ts:240-319` selects two new metrics after excluding pending ones.
- `src/lib/coachhelm/v3/goals/loader.ts:41` loads only three.
- Live Supabase: 222 active suggestions across 15 players; median 16, max 18.

Fix: atomically maintain at most two active ranked suggestions per player, replacing stale lower-value suggestions instead of appending forever.

### F05. Generator failures are counted as successful analysis

**Impact:** A round can be marked CoachHelm-analyzed even when one or more V3 generators failed. Repair jobs then have no reliable way to distinguish complete from partial output.

Evidence:

- `src/lib/coachhelm/v3/engine/generator-base.ts:543-548` catches errors and returns a fulfilled `{id:null}` result.
- `src/lib/coachhelm/v2/orchestrator.ts:346-379` counts every fulfilled promise as a success.
- `src/lib/coachhelm/v2/post-round-trigger.ts:109-141` writes terminal success from the resulting summary.

Fix: return explicit `generated | gated | no_data | failed` receipts, require all mandatory generators to close, and persist a partial-analysis state with retryable failure details.

## High-Impact Player Defects

### F06. Player Dismiss does not dismiss the insight

The UI saves `rating='dismissed'`, shows “Insight dismissed,” and refreshes. The canonical player feed never joins or reads the feedback table, so the card returns.

- Write: `src/app/golf/actions/player-feedback.ts:156-190`.
- Canonical select/mapping omits feedback: `src/app/golf/actions/insight-delivery.ts:174-186`, `:1014-1051`.
- Visibility only respects the shared insight status: `src/lib/coachhelm/v3/insight-visibility.ts:52-81`.
- Live Supabase confirms the only dismissed feedback row still joins a canonical-visible V3 insight.

Fix: include current-player feedback in player reads, exclude dismissed rows, expose prior rating state, and make feedback behavior consistent on Overview, Hub, and Round Review.

### F07. Notification preferences are a hollow feature

Players can configure ten CoachHelm notification categories and quiet mode, but the V3 router has no production call site.

- Preference contract: `src/lib/coachhelm/v3/notifications/router.ts:15-96`.
- Repository search finds `routeNotification()` only in its own helper and tests.
- Actual insight delivery still uses the legacy push preference path in `src/lib/notifications/insight-notifier.ts:187-219`.

Fix: introduce one notification dispatcher that loads `golf_player_notification_state`, calls the V3 router, and dispatches push/email/in-app consistently for every category.

### F08. Round review can perform up to three analyses for one cold review

The page and `useRoundReviewV2` independently load and auto-generate. The hook then calls another AI review action after the first stored-review action already ran the engine. The database upsert prevents duplicate rows, not duplicate compute.

- Page generator: `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:411-445`.
- Hook generator: `src/hooks/coachhelm/useRoundReviewV2.ts:218-354`, `:388-439`.
- Engine work before upsert: `src/app/golf/actions/round-review-system.ts:1422-1545`.

Fix: one controller owns load/generate/persist; add an idempotency key around computation, not only the final upsert.

### F09. Player-facing focus-area ratings mix incompatible units

`buildFocusAreasFromAnalysis` turns pattern impact, distance error divided by ten, and causal strength into one number. `FocusAreasGrid` labels all of them “strokes/round.”

- `src/app/golf/actions/insights.ts:2659-2715`.
- `src/components/golf/coachhelm/player/FocusAreasGrid.tsx:138-169`.

Fix: only label canonical `evidence.strokes_impact` as strokes. Present unconverted signals as qualitative opportunities or convert them with explicit, tested domain models.

### F10. Player insight history is not a real feature

The overview caps secondary insights, then links “View more” to My Development. `/my-insights` redirects back to the same capped overview.

- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx:430-449`.
- `src/app/golf/(dashboard)/dashboard/my-insights/page.tsx:1-7`.

Fix: ship a player insight archive/list with filters and feedback state, or paginate in place.

### F11. Player chat is absent

Coach chat is real, but player “Ask CoachHelm” remains intentionally disabled and the chat route/API are coach-only.

- `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx:27-39`.
- `src/app/api/coachhelm/v3/chat/send/route.ts:52-64`.
- `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx:370-398`.

This is an enhancement gap rather than a regression. A useful implementation would be self-only and context-carrying from an insight, goal, or round.

## High-Impact Coach Defects

### F12. Scan Team writes rows the live feed filters out

`ScanTeamControl` invokes `generateAlerts`, then reloads the canonical V3 feed. `generateAlerts` also creates hand-built rows without V3 engine/evidence/signature fields, so they default to V2 and never appear in the feed. Insert failures still return success and the requested count.

- Trigger: `src/components/fairway/pages/coachhelm/signals/ScanTeamControl.tsx:54-68`.
- Legacy row creation: `src/app/golf/actions/alerts.ts:302-396`.
- False-success return: `src/app/golf/actions/alerts.ts:408-418`.
- V3-only visibility: `src/lib/coachhelm/v3/insight-visibility.ts:24-81`.
- Live Supabase contains 25 V2 `pattern_detected` rows that are outside canonical visibility.

The underlying `analyzePlayer` call may still create V3 generator output, so the entire scan is not a no-op. The explicit alert rows and generated count are nevertheless misleading.

Fix: invoke the canonical V3 roster-sweep service, remove the second legacy alert writer, and report the actual visible-row delta.

### F13. Failed chat turns persist invisible and can duplicate on retry

The API writes the user message before the budget gate and model call. On failure, the client removes its optimistic copy, but the database row remains. Retrying writes another copy.

- `src/app/api/coachhelm/v3/chat/send/route.ts:71-125`.
- `src/components/fairway/pages/coachhelm/useCoachChatSend.ts:133-151`.

Fix: budget-check first, attach a client turn id, and atomically commit user/tool/assistant state or persist an explicit failed turn.

### F14. Player drill-down renders invented ratings as authoritative

The coach player page uses local heuristic ratings instead of canonical standing/composite logic. No-round data defaults to 50, short-game is derived by averaging unrelated dimensions, and active focus areas add rating points.

- `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx:399-482`.
- Displayed as standing/composite UI in `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx:603`.

Fix: use canonical standing/stat loaders and render unavailable dimensions as unavailable. Assignment activity must never improve a performance rating.

### F15. Team Brief does not actually take ten rounds per player

One global date-sorted query uses `limit(playerIds.length * 10)`. Players with more recent rounds can consume another player's quota, so team trends can overrepresent a subset of the roster.

- `src/app/golf/actions/team-category-insights.ts:697-734`.
- Empty categories can be counted as healthy at `:853`.

Fix: partition by player in SQL/RPC, or paginate and retain ten per player before aggregation.

### F16. Pattern and insight errors masquerade as empty/all-clear states

- Pattern query errors return `success:true, patterns:[]`: `src/app/golf/actions/pattern-management.ts:374-386`.
- Pattern reads cap at 200 while UI can say “Showing all”: `src/app/golf/actions/pattern-management.ts:89`, `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:1184`.
- Insight database errors return `[]`: `src/app/golf/actions/insight-delivery.ts:552-558`.
- Signals loads only the top 100: `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:373`.

Fix: use discriminated `{data,error,total,capped}` results, server pagination, stale-data retention, and reserve “all clear” for a successful complete read.

### F17. Development progress history is never built

The coach UI calls `updateFocusAreaProgress(id, value)` without a note; the action appends the history entry only when a note exists. The sparkline therefore never receives normal progress updates.

- `src/components/fairway/pages/coachhelm/PlayersGridView.tsx:494`.
- `src/app/golf/actions/development.ts:292-322`.

Fix: always append timestamp/value; make the note optional.

### F18. Qualifying selection can be incomplete or misleading

- The coach picker includes null-rank players although the state-machine contract excludes them: `src/components/golf/coachhelm/v3/QualifyingBoard/CoachPickPanel.tsx:38`, `src/lib/coachhelm/v3/qualifying/state-machine.ts:50`.
- Confirmation does not prove the required final roster is full: `src/lib/coachhelm/v3/qualifying/state-machine.ts:83-98`.
- The chat brief is built from a pre-insert workspace: `src/lib/coachhelm/v3/qualifying/service.ts:143-195`.
- Player lineup status is inferred from rank rather than confirmed selection rows: `src/components/fairway/pages/qualifiers/FairwayQualifierLeaderboard.tsx:198-240`.

Fix: centralize eligibility in `classifySlots`, finalize through a transactional RPC, reload committed selections before the brief, and show players actual confirmed status.

## Engine and Measurement Gaps

### F19. V2/V3 transition duplicates work and confuses observability

The current orchestrator runs V3 generators/composites and then the full legacy analysis pipeline, while canonical insight visibility filters to V3. Generation logs and some notification decisions still use legacy counts.

- `src/lib/coachhelm/v2/orchestrator.ts:270-453`.
- `src/lib/coachhelm/v3/insight-visibility.ts:24-81`.
- `src/app/golf/actions/insights.ts:3408-3515`.
- Latest 1,000 generation-log rows: 996 labeled V2, none labeled V3.

Fix: define one generation receipt covering V3 generators, composites, patterns, predictions, and notifications; retire hidden legacy insight creation once dependent surfaces are migrated.

### F20. LLM verification is advisory, not enforced

`verifyCitations` checks numeric tokens only. Failed verification is logged but generated prose is returned unchanged and displayed.

- `src/lib/coachhelm/v3/llm/citations.ts:22-52`.
- `src/lib/coachhelm/v3/llm/compose.ts:146-179`.
- Live Supabase: 22 generated, unverified responses, including 16 player-visible hero/review responses.

Fix: require structured evidence references, retry once with explicit correction, then fall back to the deterministic template when verification still fails.

### F21. Composite rules underfire or use invalid inputs

- Synthesis returns before loading raw context when there are no visible Tier-1 rows: `src/lib/coachhelm/v3/composite/synthesis.ts:171-190`.
- Flyer detection queries `lie_before='light_rough'`, which is not the canonical lie value: `src/lib/coachhelm/v3/composite/hole-sequence-loader.ts:116-145`.
- Short-game distance is compared without selecting/normalizing the unit: `src/lib/coachhelm/v3/composite/hole-sequence-loader.ts:85-113`.

Live composite rows currently contain no flyer, closing, front-nine, or long-approach outputs.

### F22. Effectiveness analytics and V3 learning are separate truths

V3 attribution writes `golf_insight_outcome_attribution`, but analytics primarily reads `golf_coach_insights.outcome_status` and legacy effectiveness rollups. Attribution also treats every visible insight as surfaced without a durable exposure event.

- `src/app/api/cron/v3/causality-attribute/route.ts:91-116`, `:231-289`.
- `src/app/golf/actions/coachhelm-analytics.ts:848`.
- Only 23 of 322 V3 insights currently have an outcome status.

Fix: one exposure/action/outcome event model should feed learning and Effectiveness. Do not claim causal effectiveness for an insight that was never actually shown or acted upon.

### F23. External-data ingest is incomplete and can preserve partial rounds

Arccos inserts round, holes, and shots separately. A later failure leaves a completed partial round that future sync deduplication can skip. The sync route advances `last_synced_at` despite item errors and is not scheduled. Garmin and TrackMan are explicit stubs.

- `src/lib/coachhelm/v3/ingest/providers/arccos.ts:150-243`.
- `src/app/api/cron/v3/ingest-sync/route.ts:83-105`.
- `vercel.json` has no ingest-sync schedule.

Fix: transactional RPC per external round, per-round cursor/receipt, retry partial imports, and clearly label Garmin/TrackMan as unavailable until implemented.

## Feature Matrix

### Player

| Feature | Status | Main issue |
|---|---|---|
| CoachHelm overview/brief | Partial | Live analysis runs on every page load; redundant reads and synthetic focus-area units. |
| Evidence insight feed | Partial | Dismiss/acknowledge state is not consumed; no real archive. |
| Themes | Implemented | Still shares the canonical error-to-empty weakness. |
| Predictions / What-if | Partial | Prediction validation horizon is broken. |
| Round review | Partial | Duplicate/triple cold-start compute and stale sharing metadata risk. |
| My Development | Partial | Goals exist but do not update/evaluate; lifecycle controls are incomplete. |
| Standing | Implemented | Canonical stats currently reconcile. |
| Genome/game profile | Partial | Seven real dimensions; 28 empty zero-round rows; source errors can overwrite with nulls. |
| Notifications | Broken | Preferences do not govern delivery. |
| Qualifying | Partial | Final status is inferred from rank rather than committed selection. |
| Player chat | Missing | Reserved/disabled by design. |

### Coach

| Feature | Status | Main issue |
|---|---|---|
| Team Brief | Partial | Per-player trend sampling is incorrect. |
| Signals / alerts | Partial | Scan Team's explicit rows are outside V3 visibility. |
| Insights | Partial | Top-100 archive and errors shown as empty/all-clear. |
| Patterns | Partial | Errors shown as empty and cap claimed as complete. |
| Players / development | Partial | Drill-down ratings are noncanonical; progress history is broken; N+1 bottlenecks. |
| Genome / compare | Partial | Seven live dimensions; error handling can persist empty profiles. |
| Ask CoachHelm | Partial | Real tool loop, but failed turns persist and retry duplicates. |
| Effectiveness | Partial | Duplicate/silent reads and disconnected outcome models. |
| Qualifying | Partial | Eligibility/finalization/brief state are not one atomic workflow. |
| Philosophy | Partial | Some controls affect legacy generation only or have no consumer. |
| Digest / notification controls | Partial | Displayed preference does not control the morning-digest field. |
| Export | Partial | Limited to the currently loaded top-100 insight set. |

## Recommended Implementation Sequence

### Phase 0: Stop incorrect learning and false state

1. Normalize attribution by metric direction and rebuild learned weights.
2. Repair prediction horizon/window semantics and backfill stranded predictions.
3. Replace generator false-success with explicit receipts and retryable partial state.
4. Make player dismissal part of the canonical player read contract.

Exit gates:

- paired direction tests pass;
- every new prediction has a future validation target;
- no run is marked complete with an unclosed required generator;
- player dismiss read-after-write integration test proves the card stays gone.

### Phase 1: Build one closed-loop product contract

1. Introduce `InsightExposure`, `InsightAction`, and `InsightOutcome` events.
2. Make those events the input for both learning and Effectiveness.
3. Add the goal evaluator/snapshot job and cap suggestions at two.
4. Implement the V3 notification dispatcher and migrate existing producers.

Exit gates:

- analytics and learning reconcile to the same source rows;
- goals progress after an eligible round;
- no player has more than two active engine suggestions;
- notification category/quiet-mode integration tests exercise real dispatchers.

### Phase 2: Remove duplicate and divergent workflows

1. One post-round analysis coordinator and one round-review generator.
2. One canonical roster-scan service; remove hand-built V2 alerts.
3. One coach player-rating source based on canonical standing/composite metrics.
4. One discriminated query result and pagination contract for insights/patterns/analytics.
5. One transactional qualifying finalization flow.

### Phase 3: Complete the differentiated product

1. Player insight archive and self-only contextual chat.
2. Practice-Rx composer wired to goals and insights.
3. Genome expansion beyond seven real dimensions.
4. Transactional external-provider ingest; ship or remove provider stubs.
5. Retire the hidden V2 insight path and legacy design fork after parity tests.

## Verification Performed

- `npm run typecheck`: passed.
- Focused CoachHelm Vitest run: **111 files passed, 1,030 tests passed, 7 skipped**.
- `DOTENV_CONFIG_PATH=.env.local npm run check:stats`: **20 players checked, 0 divergent**.
- Read-only live Supabase schema/data inspection: completed; no writes or migrations performed.
- Production browser route check: reached the GolfHelm login gate; no authenticated click-through was possible in the available browser session. Runtime interaction findings are therefore based on current code chains, tests, logs, and live database state rather than manual authenticated UI execution.
- Existing unrelated worktree changes were left untouched.

## Test Gaps To Add

- lower-is-better attribution changes weights in the correct direction;
- prediction creation-to-future-round validation integration;
- goal suggestion acceptance, provenance, snapshots, evaluation, and idempotency;
- player feedback read-after-write visibility across Overview, Hub, and Review;
- notification preference-to-real-delivery integration;
- generator partial-failure receipt and repair retry;
- round-review single-computation cold start;
- Scan Team visible-row delta and persistence failure;
- chat budget/model failure idempotency;
- per-player team-trend sampling;
- insight/pattern query error versus genuine empty state;
- qualifying eligibility, final slot count, committed brief, and player final status;
- genome source-read failure preserves last good profile;
- LLM verification failure falls back before display.

