# Workflow Maps

> Purpose: give a reviewer (human or Greptile) and a new engineer a route -> server action -> table -> result trace for every core GolfHelm workflow, and flag which cross-cutting invariants each step touches.

This doc is the "how a click becomes a row" reference. Each workflow below is written as a numbered pipeline: **route** (where the user is) -> **server action** (`src/app/golf/actions/*.ts`, invoked from a Client Component) -> **table(s) written/read** -> **result / downstream fan-out**. Where a step touches a cross-cutting invariant (RLS/tenancy, destructive-write ban, SG correctness, LLM budget, timezone/scheduling correctness), it is called out inline as `[INVARIANT: ...]`. See `03-product-invariants.md` for the full invariant catalog and `01-personas.md` / `02-jobs-to-be-done.md` for who is doing each of these actions and why.

All workflows below are College Golf (GolfHelm). The one BaseballHelm workflow is intentionally kept to a single high-level map — see the note at the end.

---

## 1. Round & Shot Entry

The highest-frequency, highest-stakes data-entry workflow in the product: every downstream stat, insight, qualifier standing, and AI review is derived from this pipeline. This is also the primary destructive-write-ban battleground (`.greptile/instructions.md:69-72`).

### 1a. New round (happy path)

```
Route:   /golf/dashboard/rounds/new  (src/app/golf/(dashboard)/dashboard/rounds/new/page.tsx)
Client:  new-round-client.tsx — 4-step wizard
  Step 1  Setup: course, round type, optional qualifier_id, saved-course lookup
  Step 2  Hole config: par/yardage per hole (skipped if a saved course supplies it)
  Step 3  Shot tracking: ShotTrackingComprehensive.tsx
            -> useAutoSaveRound hook fires every 15s
            -> Action: round-drafts.ts (draft save)
            -> Table: golf_rounds (status='in_progress')
  Step 4  Submit -> Action: submitGolfRoundComprehensive() in src/app/golf/actions/golf.ts
```

- **Write**: `golf_rounds` (status -> `completed`), `golf_holes` (9–18 rows), `golf_shots` (~50–120 rows), `putt_details` (per-putt miss tags).
- **Write pattern**: hole/shot rows are written via `upsert(..., { onConflict: 'round_id,hole_number' })` / `onConflict: 'round_id,hole_number,shot_number'`, never delete-then-insert (`src/app/golf/actions/golf.ts:4752`, `:4804`). An orphan-trim pass runs only *after* every upsert has succeeded (`golf.ts:4878`), so a mid-save failure leaves prior data intact. `[INVARIANT: destructive-write ban]`
- **Fan-out (async, non-blocking)**:
  - `invalidateOnRoundComplete()` marks `golf_player_stats_cache` stale (Redis) and attempts SG-recalculation RPCs — SG columns remain the source of truth only once populated; a broken recalculation must not silently leave a stale number, it must leave `null`. `[INVARIANT: SG correctness — SG is cached, not recomputed on read, per golf_player_stats_cache; do not let a failed recompute serve a stale/wrong SG]`
  - `triggerPlayerInsightsAfterRound()` -> CoachHelm V2 pipeline (pattern mining -> insight persistence). `[INVARIANT: LLM budget — any LLM-backed step here must check golf_coachhelm_llm_budget before composing]`
  - `generateRoundReview()` -> AI round review (`src/app/golf/actions/round-reviews.ts`). Must verify citations against real shot data and regenerate-once before falling back to a template (`.greptile/instructions.md:139-146`).
  - `updateQualifierEntryStats()` (only if `qualifier_id` set) — see workflow 2.
- **Result**: player sees a completed round, stats cache is (lazily) refreshed on next read, coach sees the round in roster/round-history views.

### 1b. Resume an in-progress round

```
Route:  /golf/dashboard/rounds/continue/[id]
Action: golf.ts (load) — reconstructs ShotRecord[] from golf_shots + golf_holes,
        resumes from current_hole, reloads course hole yardages for reference.
Tables: golf_rounds (status='in_progress'), golf_holes, golf_shots, golf_courses/golf_course_holes
```

- No new tables; this is a read-then-continue path into the same submit pipeline as 1a.

### 1c. Round review

```
Route:  /golf/dashboard/rounds/[id]/review
Action: round-reviews.ts, round-review-system.ts (share-with-coach)
Tables: golf_round_reviews (read), golf_review_events, golf_review_insights
```

- `shared_with_coach` exists as a field but the formal coach-approval workflow around it is not fully built (`memory/context/golfhelm-features.md`, "Coach verification workflow" gap) — do not assume a review is coach-vetted just because it exists.

### Known correctness gaps to watch in review (repo-documented, not invented)
- Strokes Gained is architecturally cached (`golf_player_stats_cache`) but the SG columns can be null if the recompute step didn't run — a PR that reads SG without a null-check is a bug, not just a UX gap.
- Offline shot sync (`src/lib/offline/sync-engine.ts`, `use-offline-sync` hook) is currently disabled due to a `ShotRecord` <-> `OfflineShot` type mismatch; DB auto-save is the only persistence path today. A PR that re-enables offline sync must resolve the type mismatch, not paper over it.
- Draft JSON is stored in `golf_rounds.notes`, colliding with the user-facing notes field — flag any PR that writes user notes without namespacing against draft JSON.

---

## 2. Qualifier Setup + Travel Selection

The repo's own competitive research names the coach's travel-roster selection process "the most-painful, most-frequent, most-poorly-tooled workflow in college golf" and treats the qualifying/travel-selection workspace as a stated differentiator vs. Clippd/DECADE (`docs/v3-research-competitive-landscape.md:393`). Correctness and RLS here are high-stakes: this workflow decides which real student-athletes travel and compete.

### 2a. Qualifier creation (coach)

```
Route:  /golf/dashboard/qualifiers/new
Action: createGolfQualifier() — src/app/golf/actions/golf.ts:2765
Tables: golf_qualifiers (INSERT), golf_qualifier_entries (INSERT per invited player)
```

- `QualifierStatus`: `upcoming` -> `in_progress` -> `completed` | `cancelled`, transitioned via `updateQualifierStatus()` (`golf.ts:3075`).
- Round-course assignment per qualifier round is set via `getQualifierRoundCourses()` / `setQualifierRoundCourses()` (`golf.ts:2962`, `:3007`), which explicitly documents a **stage-and-swap** strategy on `golf_qualifier_round_courses` via `upsert(rows, { onConflict: 'qualifier_id,round_number' })` (`golf.ts:3001`, `:3044`) — not delete-then-insert. `[INVARIANT: destructive-write ban]`

### 2b. Qualifying rounds -> leaderboard

```
Round submit (workflow 1) with qualifier_id set
  -> updateQualifierEntryStats() aggregates scores into golf_qualifier_entries
  -> getQualifierLeaderboard() (golf.ts:5293) computes positions/ties for display
Route: /golf/dashboard/qualifiers/[id] (coach + player, shared)
Route: /golf/dashboard/my-qualifiers (player-only progress view)
```

### 2c. v3 travel-selection workspace (the differentiator workflow)

```
Route:   /golf/dashboard/coachhelm/qualifying/[id]
Actions: src/app/golf/actions/v3/qualifying.ts
           advanceSelectionState()      -> transitionSelectionState() in
                                            src/lib/coachhelm/v3/qualifying/service.ts
           setQualifierCoachPick() /
           removeQualifierCoachPick()   -> upsert on golf_qualifier_selections
                                            (onConflict: 'qualifier_id,player_id')
           confirmQualifierSelection()  -> canConfirmSelection() gate, then commit
Tables:  golf_qualifiers.selection_state (state machine field)
         golf_qualifier_selections (coach-pick rows, upserted not replaced)
```

- **State machine**: `transitionSelectionState()` reads current `selection_state`, checks `canTransition(current, target)` from `state-machine.ts`, and **rejects skip/reverse transitions** — a PR that writes `selection_state` directly instead of going through the guarded transition is a correctness bug.
- **Selection commit**: `setQualifierCoachPick()` always **upserts** into `golf_qualifier_selections` on `(qualifier_id, player_id)` (`service.ts:102-111`) — never delete-then-insert, even for "coach changed their mind" edits. `[INVARIANT: destructive-write ban — qualifier selections are named explicitly as a highest-risk surface]`
- **Business rule**: "Coach picks cannot exceed the total travel-squad size" is enforced as a schema-level validation (`golf.ts:499`).
- **AI assist**: on confirm, `composeTravelBrief()` + `pushTravelBriefToChat()` (best-effort, "never blocks selection" per the code comment in `service.ts:193`) generate a narrative summary of the selected travel squad into CoachHelm chat. This is an LLM-composed artifact — it must sit behind the same budget/citation/fallback discipline as round review. `[INVARIANT: LLM budget; never block a real coach action (confirming who travels) on an LLM call succeeding]`
- **Tenancy note**: `service.ts` explicitly documents that it "trusts its Supabase client — auth + team-coach guards happen in the server-action wrapper. RLS at the DB enforces the team boundary regardless." This is the correct layered-defense pattern — flag any new mutation path into `golf_qualifier_selections` that bypasses either layer. `[INVARIANT: RLS/tenancy — organization -> team -> coach/player isolation via golf_team_coach_staff, never golf_coaches.team_id]`

### 2d. Travel logistics (separate from selection)

```
Route:  /golf/dashboard/travel
Actions: src/app/golf/actions/travel.ts
  createGolfTravelItinerary() / updateGolfTravelItinerary() / deleteGolfTravelItinerary()
  createTravelExpense() / updateTravelExpense() / deleteTravelExpense() / uploadExpenseReceipt()
  setBudget() / getBudgetsForItinerary() / exportExpensesToCSV()
Tables: golf_travel_itineraries (implied), travel expense/budget tables
```

- This is the logistics half (itinerary, expenses, budgets) — distinct from the *who travels* selection workflow in 2c. A PR that conflates the two (e.g., mutates roster selection from an expense action) should be flagged.
- Feature registry marks Travel as ⚠️ partially implemented — do not assume full parity with the qualifying-selection workspace.

---

## 3. Coach Insight / CoachHelm Review

CoachHelm is not a separate product — it is the AI insight/narrative layer embedded in GolfHelm, spanning a legacy V1 engine (still active, deprecated) and the current V2 intelligence engine (`memory/context/coachhelm-ai.md`).

```
Trigger: round submit (workflow 1) -> triggerPlayerInsightsAfterRound()
  -> src/lib/coachhelm/v2/orchestrator.ts (main pipeline, ~1500 lines)
       gate.ts            — feature flags (global / per-user / per-team) gate the whole run
       mining/*            — pattern-miner, shot-pattern-miner, causal-engine,
                              correlation-engine, pressure-analysis, resilience-analysis
       prediction/*        — performance-predictor, trajectory-forecaster, team-forecaster
       features/*          — temporal, sequence, contextual feature engineering
       learning/*          — behavior-learner, cross-learner, outcome-validator
       reasoning/*          — reasoning-engine, confidence-calibrator
       nlg/insight-composer.ts — turns structured findings into prose
       services/insight-persistence.ts -> WRITE golf_coach_insights, golf_patterns_v2,
                              golf_predictions, golf_insight_generation_log

Route (coach):  /golf/dashboard/insights            -> insight-management.ts (search/filter/
                                                         acknowledge/dismiss/export)
Route (coach):  /golf/dashboard/patterns             -> pattern-management.ts (validate/
                                                         address/resolve/dismiss)
Route (coach):  /golf/dashboard/alerts               -> alerts.ts (get/acknowledge/dismiss/
                                                         generate)
Route (coach):  /golf/dashboard/intelligence         -> intelligence-dashboard.ts
Route (coach):  /golf/dashboard/analytics/coachhelm  -> coachhelm-analytics.ts (effectiveness)
Route (coach):  /golf/dashboard/settings/coaching-intelligence -> golf_coach_philosophy
                                                         (priority weights, alert toggles,
                                                         thresholds — see coachhelm-ai.md)
Route (player): /golf/dashboard/coachhelm            -> player-facing insight dashboard
Route (player): /golf/dashboard/coachhelm/chat       -> composeCoachChat()
```

- **Invariant surface (`v2/` scoring functions)**: pattern-mining and composite-scoring functions under `v2/insights/`, `v2/composite/` **must stay pure — no fetches/Supabase calls inside scoring** (`.greptile/instructions.md:139-146`). Flag any PR that adds a network or DB call inside a `mining/` or `prediction/` scorer.
- **LLM discipline**: `composeRoundReview`, `composeHeroNarrative`, `composeCoachChat` must (a) verify citations against real underlying data, (b) regenerate once on failure, (c) fall back to a deterministic template rather than surface a hallucinated narrative — and must **never be called client-side**. `[INVARIANT: LLM budget]`
- **Budget enforcement**: `src/lib/coachhelm/v3/llm/budget.ts` checks `golf_coachhelm_llm_budget` (coach_id + date, `budget_usd`/`spent_usd`) before every `compose()` call, governed by `golf_coachhelm_settings.llm_budget_usd_per_day`. On exhaustion, the priority fallback order is **round_review > coach_chat > hero_narrative -> template**. A PR that lets any composer skip this check, or that hardcodes a $/token number instead of reading the per-team setting, is a budget-bypass bug — one of the six named high-severity classes for this business.
- **Effectiveness ledger**: `golf_insight_effectiveness`, `golf_insight_feedback`, `golf_prediction_model_performance`, `golf_review_events`/`golf_review_insights` close the loop on whether an insight was acted on and whether the outcome improved — insights carry `outcome_status`: `pending | improved | no_change | worsened | inconclusive`. Any insight-generation PR that doesn't wire into this ledger should be flagged as incomplete, not silently accepted.
- **Coach philosophy** (`golf_coach_philosophy`) drives weighting (`weightHistorical` + `weightRecentForm` + `weightTournament` + `weightQualifying` + `weightSubjective` must sum to 100%) and alert sensitivity — a PR that changes scoring weights without preserving that invariant will silently mis-rank insights.

---

## 4. Calendar Event Creation + Player Acknowledgement

```
Route (coach):  /golf/dashboard/calendar (create)
Action:         createGolfEvent() — src/app/golf/actions/golf.ts:2031
Tables:         golf_events (INSERT)
                golf_event_attendance (implicitly seeded per invited player, or created on
                                        first RSVP)
Fan-out (best-effort, non-blocking, each independently caught):
  - notification INSERT — upsert(notifications, { onConflict:
    'event_id,user_id,notification_type', ignoreDuplicates: true }) (golf.ts:2190) — an
    upsert, not delete-then-insert, so a retried notification fan-out cannot duplicate or
    wipe prior notification state. [INVARIANT: destructive-write ban]
  - email notification fan-out (logs partial failure counts, does not roll back the event)
  - in-app notification channel fan-out

Route (player): /golf/dashboard/calendar (RSVP)
Action:         respondToEvent() (golf.ts, comment at :3364: "the event's team may RSVP.
                The write is an upsert on ...")
Table:          golf_event_attendance — status: pending | accepted | declined | tentative
                upserted per (event_id, user_id), never replaced destructively.
                [INVARIANT: destructive-write ban]

Route (coach):  Day-of check-in via AttendanceCheckIn component
Action:         checkInPlayer() / bulkCheckIn() / markNoShow() — attendance.ts
Table:          golf_event_attendance (checked_in, checked_in_at, absence reason)
                -> feeds golf_attendance_summary / golf_player_attendance_stats
```

- **Recurring events**: RRULE-based, with edit scopes `this | thisAndFuture | all` (`recurring-events.ts`). A PR that edits a recurring series must respect the chosen scope and must not silently cascade a "this instance only" edit to the whole series.
- **Academic conflict detection**: event creation/edit checks `golf_academic_exclusions`, `golf_player_availability_blocks`, and `golf_coach_blocked_time` (`src/lib/calendar/conflicts.ts`) against player-uploaded class schedules (workflow: `/golf/dashboard/classes`). `[INVARIANT: calendar/scheduling timezone correctness — this is one of six named high-severity classes for this business; a timezone bug here can silently schedule a required team event over a player's class, or mis-fire an RSVP-cutoff]`
- **iCal / CalDAV feeds**: `calendar-feeds.ts` (token-authed, RFC 5545, rate-limited) and `caldav-sync.ts` re-expose event data outside the app boundary — any change to feed generation must be checked against the same tenancy boundary as in-app reads (a leaked/guessable feed token is effectively an RLS bypass). `[INVARIANT: RLS/tenancy]`
- **Status lifecycle**: `golf_events` moves `draft -> confirmed -> completed | cancelled` via `golf_event_status_log` — flag any direct status write that skips logging.

---

## 5. Team Messaging

```
Route:   /golf/dashboard/messages
Actions: src/app/golf/actions/messages.ts (re-exports), message-attachments.ts
Client:  sendGolfMessageWithAttachments()
  1. Upload files to Supabase Storage (client-side)
  2. INSERT golf_messages (has_attachments flag)
  3. INSERT golf_message_attachments (per file)
  4. UPDATE golf_conversation_participants.last_read_at
  5. Supabase Realtime pushes to all participants (use-golf-messages hook)
Tables: golf_conversations, golf_conversation_participants, golf_messages,
        golf_message_attachments
```

- **Tenancy**: conversation participation must be scoped through `golf_conversation_participants`, gated by `is_team_coach()` / `is_team_player()` RLS helpers — a conversation query that lists messages without joining through participants (or that trusts a client-supplied `team_id`) is a cross-tenant leak candidate. `[INVARIANT: RLS/tenancy]`
- Realtime fan-out means a message write and its "delivered" state are eventually consistent — do not assume synchronous delivery when reasoning about read-receipt correctness.

---

## 6. Roster Management

Invite-code-based team building with coach approval gating.

```
Route (player): /golf/join/[code]
Table:  golf_teams.invite_code (lookup)
Write:  INSERT golf_team_join_requests (status: pending)

Route (coach):  /golf/dashboard/roster
Action:         roster.ts — getTeamPlayers() (list + pending requests)
Approve:        INSERT golf_team_members (status: active) — approval action reads the
                pending golf_team_join_requests row and materializes team membership.
Manage status:  UPDATE golf_team_members.status
                (active | inactive | redshirt | medical | transfer)
Remove:         removePlayerFromTeam(playerId) — src/app/golf/actions/roster.ts:51

Route (shared): /golf/dashboard/roster/[id] — player profile detail
  -> Suspense-loaded: scoring stats, short game, long game, course-by-course breakdown,
     trend charts (reads golf_player_stats_cache, same SG-correctness invariant as
     workflow 1)
```

- **Coach<->team binding**: coach access to a roster is via `golf_team_coach_staff`, never `golf_coaches.team_id` — this is called out repeatedly in the RLS template (`docs/v3-rls-template.md:11-57`) and is the single most common tenancy foot-gun in this codebase. `[INVARIANT: RLS/tenancy]`
- **Destructive-write risk**: roster is named explicitly as one of the highest-risk surfaces for the delete-then-insert ban (`.greptile/instructions.md:69-72`) — removing/reactivating a player must be a status UPDATE (or upsert), never a delete-then-reinsert of `golf_team_members`. A transient failure mid-operation must not be able to permanently drop a real roster row; there is a documented prior incident of exactly this class of bug. `[INVARIANT: destructive-write ban]`
- **Minors' PII**: roster rows carry academic + athletic PII for players who are frequently minors — any new roster export, bulk-action, or admin view must be checked against FERPA/COPPA-adjacent handling expectations, not just RLS. `[COMPLIANCE SURFACE]`

---

## 7. Coach & Player Onboarding

```
Coach (3 steps): Organization -> Team -> Profile -> Dashboard
Route:  /golf/(onboarding)/coach
Action: completeCoachOnboarding(input) — src/app/golf/actions/onboarding.ts:60
Writes (transaction-shaped): organizations, golf_teams, golf_coaches
                              (golf_coaches.organization_id links tenant),
                              golf_team_coach_staff (coach<->team join row — this is the
                              row that makes every subsequent RLS check pass)

Player (4 steps): Basic info -> Golf info (year, handicap) -> Academic (major, GPA) ->
                   Photo -> Dashboard
Route:  /golf/(onboarding)/player
Action: completePlayerOnboarding(input, joinCode?) — onboarding.ts:353
        ensurePlayerRecord() — onboarding.ts:267 (idempotent player-row creation,
        called defensively wherever a player record might not yet exist)
Writes: golf_players, golf_team_members (status seeded per join-code flow — see
        workflow 6 if joining an existing team by code at signup time)
```

- **Tenant boundary is created here**: onboarding is the one workflow that *creates* the `organization -> team -> coach/player` chain the rest of the app assumes exists. A bug in `completeCoachOnboarding()` that fails to write `golf_team_coach_staff` (or writes it inconsistently with `golf_coaches.organization_id`) will not fail loudly — it will silently produce a coach who can authenticate but whose every subsequent RLS-gated query returns empty or, worse, cross-tenant, results. `[INVARIANT: RLS/tenancy — treat onboarding as the highest-leverage place to catch a tenancy bug before it ships]`
- **Idempotency**: `ensurePlayerRecord()` is explicitly a defensive re-entrant helper — a PR that assumes it can only run once (e.g., adds a non-idempotent INSERT without an existence check) will break re-entry from interrupted onboarding flows.
- **Minors' PII collection point**: the player academic step (major, GPA) is the first place academic PII enters the system for what is frequently a minor — flag any onboarding change that logs, emails, or otherwise exfiltrates this payload outside the normal DB write path. `[COMPLIANCE SURFACE]`

---

## BaseballHelm Recruiting — stable high-level map only

BaseballHelm (college baseball recruiting + team management) is under active, structural change right now. Do **not** treat any BaseballHelm route/action file as a stable contract, and do not document its current implementation details here — see `feedback_baseball_remediation_rules` guidance (spec-first, delete dead code) and the in-flight migration plan referenced from the operator's memory (`fairway_baseballhelm_migration_deferred`). The detailed BaseballHelm workflow "brain" is being built at `memory/context/baseballhelm-features.md` — once that lands, this section should be expanded to match the golf sections above; until then, treat this as a placeholder pointer, not a spec.

At the highest, stable level, the shape mirrors GolfHelm's tenancy pattern (organization -> team -> coach/player, RLS-isolated) but with a recruiting-pipeline object model layered on top (prospect discovery/watchlist -> college interest -> pipeline stage -> commitment), plus its own AI settings surface analogous to CoachHelm's coach-philosophy config. Routes exist under `/baseball/dashboard/*` for the analogous team-management and recruiting surfaces — see `memory/registry.yml` or the codebase for current routes, not this doc — but their server-action wiring, table schema, and invariants are intentionally **not** mapped here because they are mid-rebuild.

**For the reviewer of any BaseballHelm PR right now**: hold it to the same non-negotiable cross-product invariants as golf — RLS/tenancy isolation, no delete-then-insert in save/submit/sync, no client-side LLM calls, no hardcoded LLM pricing — even though the feature-level workflow map for baseball is not yet written.

---

## For the reviewer

- **Flag a PR when** a save/submit/sync path (round submit, qualifier selections, roster status change, event RSVP, notification fan-out) uses DELETE-then-INSERT instead of `upsert(...).onConflict(...)` or stage-and-swap — this is a named, previously-incident-causing pattern (`.greptile/instructions.md:69-72`).
- **Flag a PR when** a new query against a coach/player/team-scoped table filters by `team_id` or `organization_id` in application code instead of relying on RLS + the canonical helpers (`current_player_id()`, `is_team_coach()`, `is_team_player()`), or when a coach<->team check uses `golf_coaches.team_id` instead of `golf_team_coach_staff`.
- **Flag a PR when** SG values are read from `golf_player_stats_cache` without handling `null` (unpopulated SG), or when SG math changes without re-grounding in `docs/v3-research-golf-domain.md`.
- **Flag a PR when** any LLM composer (`composeRoundReview`, `composeHeroNarrative`, `composeCoachChat`, `composeTravelBrief`, or any new one) is callable client-side, skips the `golf_coachhelm_llm_budget` check, hardcodes a dollar/token figure instead of reading `golf_coachhelm_settings.llm_budget_usd_per_day`, or drops the citation-verify -> regenerate-once -> template fallback chain.
- **Flag a PR when** a `v2/mining/` or `v2/composite/` scoring function performs a fetch or Supabase call inside pure scoring logic.
- **Flag a PR when** calendar/scheduling logic (event creation, RRULE expansion, conflict detection, iCal/CalDAV feed generation) does timezone math without an explicit, tested timezone — this is a named high-severity class for this business.
- **Flag a PR when** onboarding writes a coach or player record without also writing the corresponding tenancy join row (`golf_team_coach_staff` for coaches, `golf_team_members` for players) in the same logical operation.
- **Flag a PR when** a BaseballHelm change is reviewed against golf-specific workflow assumptions from this doc — baseball's detailed workflow map is intentionally not yet written; only the shared cross-product invariants apply today.
