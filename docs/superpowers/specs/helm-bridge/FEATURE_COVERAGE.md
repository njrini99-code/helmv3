# FEATURE_COVERAGE.md — Helm Bridge Total Error-Capture Coverage + Feature Health

**Status:** Canonical spec (W15 instrumentation + W16 board build against THIS file).
**Scope (owner directive, 2026-07-01):** GOLFHELM + COACHHELM ONLY. BaseballHelm is
unstable in prod — baseball + Lift Lab are DEFERRED. No task in W15/W16 may modify any
baseball or lifting application code, and no baseball/lifting action gets wrapped. Their
feature maps live only in Appendix A (future reference). CRM is NEVER touched (no
wrapping, no tagging, no board presence beyond the "excluded" registry row).

**Companion plans:**
- `docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md` (instrumentation)
- `docs/superpowers/plans/helm-bridge/waves/w16-feature-health-board.md` (board)

---

## 0. Noise-Discipline Charter (NORMATIVE — as important as completeness)

These rules are enforced in code and tests, not aspirational. Every emitter, threshold,
and UI decision below traces back to one of them.

| # | Rule | Enforcement point |
|---|------|-------------------|
| N1 | **CAPTURE:** unexpected exceptions, DB/RPC failures, RLS denials (misconfig signal), integrity-check failures, cron failures, genuine auth anomalies. | `withAdminObserved` (src/lib/admin/observed-action.ts:17), `maybeCaptureRlsDenial` (src/lib/admin/rls-denial.ts:19), cron/integrity emitters. |
| N2 | **DO NOT capture as errors:** expected control flow (`NEXT_REDIRECT`/`NEXT_NOT_FOUND` — already skipped by `isNextControlFlowError`, observed-action.ts:10-15), user-input/validation rejections, empty/not-found results, user-aborted requests, retries that then succeed, anything benign or high-frequency. Actions that return typed failure envelopes (e.g. `ActionResult{success:false}` for a Zod rejection) are NOT errors — the wrapper only fires on `throw`. W15 batch tasks must never convert validation returns into throws. | `isNextControlFlowError` + W15 contract tests + per-batch review checklist. |
| N3 | **SEVERITY:** validation/expected → not logged (or `info` + `skipSentry`, per server-error-logger.ts:44-51); recoverable/degraded → `warning`; genuine failure → `error`; data-loss/security → `critical`. **Only `error` + `critical` may drive a RED dot or the Overview banner. Warnings surface on drill-in only.** | `get_feature_health()` counts fingerprints only for `severity IN ('error','critical')`; warnings returned as a separate drill-in count. |
| N4 | **DEDUPE:** everything groups by `admin_events.fingerprint` (written by server-error-logger.ts:158-180 via `buildIncidentSignature`). A repeating error is ONE line with a count, never N rows. Emitters MUST rate-limit: `withAdminObserved` gains a per-process fingerprint collapse window (W15 Task 2) so a loop cannot flood `admin_events` — max 1 write per (action, errorCode) per 60s per process, with a `collapsed_count` in metadata. | W15 Task 2 (`emit-throttle`), RPC `top_signatures` grouping, TriageQueue grouping (src/lib/admin/incident-grouping.ts). |
| N5 | **HEALTH DOTS:** computed from GROUPED fingerprint rate + trend over a window WITH HYSTERESIS — RED requires the threshold exceeded in **2 consecutive 24h windows**; a single blip can never flip a feature red, and leaving red requires a clean current window (never a single quiet minute). Low-traffic features judged by ratio/7-day windows, not raw 24h counts. Expected-empty / seasonal features render **NEUTRAL**, never red. | `computeFeatureStatus()` (W16 Task 1) — pure function, unit-tested for every transition. |
| N6 | **DIGEST/BANNER:** only meaningful state changes — new or regressed incident fingerprints, a feature flipping red, a cron/integrity failure. Never a wall of routine noise; never warnings. | Overview `FeatureHealthRollup` (W16 Task 5) renders only `red` features + `newFingerprints24h`; W13 digest reuses the same filter. |

**RLS-denial special case:** denials are logged at `warning` severity with
`skipSentry:true` (rls-denial.ts:31-43) so they never open Sentry issues — but they are
a first-class *misconfig* signal. They therefore get their own counter in
`get_feature_health()` (`rls_denials_24h`, `rls_denial_fingerprints_24h`) and their own
classifier rule (§5) instead of riding the generic warning bucket. A one-off denial is
drill-in-only; a *cluster* (same fingerprint ≥10×/24h, or ≥3 distinct users) is
amber; a cluster sustained 2 windows on an insert/update verb is red — that is exactly
the "missing grant / unapplied migration" incident class this platform keeps hitting
(matview re-grant, upsert UPDATE-grant, course-library migration 20260614010000).

---

## 1. Canonical Feature Registry

Registry keys are the values written to `admin_events.feature` and passed as
`feature` in `withAdminObserved` opts. They are typed as `FeatureKey` in
`src/lib/admin/feature-registry.ts` (created in W15 Task 3) — free text in the DB
(no CHECK constraint; vocabulary grows faster than sports), validated at compile time
app-side.

Column meanings:
- **Action globs** — which action exports get `withAdminObserved({feature: <key>})`. `file.ts:*` = every export; `file.ts:{a,b}` = only those; overrides in §2.2.
- **Primary table** — heartbeat/activity anchor. `—` = no reliable single table; heartbeat suppressed for that feature (activity judged by absence-of-errors only, never staleness → cannot amber on quiet).
- **Tier** — traffic tier driving thresholds (§5): `high` / `med` / `low`. Recomputed empirically from trailing-7d write volume by W16's data layer where a primary table exists; the static value here is the fallback.
- **healthSignal** — the plain-english "what green means" statement rendered on the drill-in card.

### 1.1 GolfHelm (app: `golfhelm`) — 24 features

| Key | Label | Action globs | Primary table | Tier | healthSignal (green means…) + thresholds |
|---|---|---|---|---|---|
| `round_tracking` | Round Tracking | `golf.ts:{submitGolfRoundComprehensive,savePartialRound,deleteInProgressRound,deleteShot,updateShot,getRoundShotDetails}`, `round-drafts.ts:*` | `golf_rounds` | high | Round submits/partial saves complete; no 42501 on golf_rounds/holes/shots. G: 0 error-fingerprints/24h (or ≤1 at <0.5% of writes) · A: 2–4 fp or 0.5–2% · R: ≥5 fp, any unresolved critical, or >2%, sustained 2 windows |
| `stats_analytics` | Stats & Analytics | `stats.ts:*`, `stats-data.ts:*`, `stats-intelligence.ts:*`, `stats-leak-maps.ts:*`, `shot-analytics.ts:*`, `team-sg-baseline.ts:*` | `golf_player_stats_cache` | high | Cache refresh + stats reads succeed post-round. Known-null SG columns are NOT errors (annotated gap). G/A/R: high-tier table (§5) |
| `qualifiers` | Qualifiers (coach) | `golf.ts:{createGolfQualifier,getQualifierRoundCourses,setQualifierRoundCourses,updateQualifierStatus,getNextQualifierRoundNumber,getQualifierLeaderboard}`, `v3/qualifying.ts:*` | `golf_qualifiers` | med | Qualifier CRUD + leaderboard + selection-state transitions succeed. Quiet between events is NORMAL: heartbeat window widened to 7d, never ambers on silence alone. G: 0 fp/24h · A: 1 fp · R: ≥2 fp or any critical, 2 windows |
| `my_qualifiers` | My Qualifiers (player) | `golf.ts:{getPlayerQualifiers}` | `golf_qualifier_entries` | low | Player progress reads match golf_rounds. G: 0 fp/7d · A: 1 fp/7d · R: ≥2 fp/7d or any single critical (immediate) |
| `calendar_events` | Calendar & Events | `golf.ts:` event fns (§2.2), `attendance.ts:*`, `calendar-feeds.ts:*`, `recurring-events.ts:{createRecurringEvent,editRecurringEvent,deleteRecurringEvent,getExpandedEvents}`, `event-documents.ts:*` | `golf_events` | high | Event CRUD/RSVP/attendance/iCal feeds complete; no 42501 on golf_events/golf_event_attendance. High-tier thresholds |
| `academics_classes` | Academics & Classes | `calendar-sync.ts:*`, `recurring-events.ts:{createAcademicExclusion,deleteAcademicExclusion}` | `golf_player_classes` | low | Class↔calendar sync leaves no orphaned events. Low-tier thresholds; seasonal-quiet (summer) never ambers |
| `roster_management` | Roster | `roster.ts:*`, `golf.ts:{invitePlayerToTeam,updatePlayerStatus,getPendingInvitations}` | `golf_team_members` | med | Invites/status changes/removals succeed; no 42501 on golf_team_members. Med-tier thresholds |
| `task_management` | Tasks | `tasks.ts:*`, `task-templates.ts:*`, `task-reminders.ts:*` | `golf_task_assignments` | med | Task CRUD/complete/reminders succeed. KNOWN dual-table drift (hub reads golf_task_completions, completeTask writes golf_task_assignments) is a pre-existing bug, not an outage — annotated on card. Med-tier |
| `messaging` | Messaging | `message-attachments.ts:*`, shared `src/app/actions/messages.ts` golf exports (§2.2) | `golf_messages` | high | Sends + attachment flows succeed; Realtime delivery not directly measured (absence of send errors is the proxy). High-tier |
| `announcements` | Announcements | `announcements.ts:*`, `communication.ts:*`, `golf.ts:{createAnnouncement}` | `golf_announcements` | med | createEnrichedAnnouncement multi-insert lands atomically (announcement+recipients+docs+tasks); partial-write = error. Med-tier |
| `documents` | Documents | `documents.ts:*` | `golf_documents` | low | Upload/version/signed-URL flows succeed against Storage. Low-tier |
| `travel` | Travel | `travel.ts:*` | `golf_travel_itineraries` | low | Itinerary/expense/budget CRUD succeeds. golf_travel_expense_splits unused = known gap, not an error. Low-tier |
| `team_info` | Team Info & Switcher | `teams.ts:{createTeam,updateTeam,regenerateJoinCode}`, `team-switcher.ts:*` | `golf_teams` | low | Team settings persist; join codes resolve; active-team cookie ops succeed. Low-tier |
| `join_team_flow` | Join Team | `teams.ts:` join fns (§2.2) | `golf_team_join_requests` | med | Join by code / requests / accept-reject succeed; no case-sensitivity lookup failures. Med-tier; auth-anomaly captures (N1) count here |
| `settings` | Settings & Notification Prefs | `v3/notification-prefs.ts:*` | — | low | Pref writes persist. Most sub-panels write via inline client calls (src/components/golf/settings/) — RLS-denial capture via shared helper is the only net for those (annotated gap). Low-tier |
| `course_library` | Course Library | `course-library.ts:*`, `courses.ts:*`, `golf.ts:{getPlayerSavedCourses,savePlayerCourse,touchSavedCourse,getRecentCoursesForPlayer}` | `golf_courses` | med | Course/tee CRUD + contribute-from-round succeed; a 42501 cluster on golf_courses UPDATE = the known unapplied-RLS-migration class → weight per §0. Med-tier |
| `recruiting_prospect_tracking` | Recruiting HQ (coach tracker — NOT CRM) | `recruiting.ts:*`, `recruit-documents.ts:*` | `golf_recruits` | low | Recruit CRUD + private-bucket doc flows succeed; no 42501 on golf_recruit_documents. Low-tier |
| `player_hub` | Player Hub | `dashboard-data.ts:{getPlayerDashboardData,getCachedPlayerDashboardData}` | — | high | Hub aggregate loads without error. Task-completion staleness = the known dual-table bug (see task_management), not an outage. High-tier (error-rate only, no heartbeat) |
| `coach_dashboard` | Coach Dashboard & Command Palette | `dashboard-data.ts:{getCoachDashboardData,getCachedCoachDashboardData}`, `command-palette.ts:*` | — | high | Coach aggregate + palette data load without error. High-tier (error-rate only) |
| `notifications` | Notifications & Push | `coach-notifications.ts:*`, `player-notifications.ts:*`, `push-notifications.ts:*`, `golf.ts:{getNotifications,markNotificationRead,markAllNotificationsRead}` | — | med | Counts/mark-read/device-token ops succeed. Med-tier (error-rate only) |
| `auth_onboarding` | Auth, Onboarding & Demo | `auth.ts:*`, `onboarding.ts:*`, `access-code.ts:*`, `demo-access.ts:*`, `demo-tracking.ts:*` | `golf_players` | med | Login/signup/reset/onboarding complete; `enterDemo`'s `redirect()` is control flow (N2, safe to wrap). Genuine auth anomalies (N1) captured at `error`. Med-tier |
| `whats_new` | What's New | `whats-new.ts:*` | — | low | Informational feed loads. Low-tier; never more than amber (cap enforced in classifier — low-criticality informational surface) |
| `my_game_profile` | Player Profile Surfaces (My Game / My Standing / Team Hub) | `player-profile-stats.ts:*` | `golf_player_stats_cache` | low | Profile stat reads succeed. Route-ownership partially unverified (map gap) — remaining data-fetch paths get coverage via the shared RLS helper only until traced. Low-tier |
| `admin_dashboard` | Admin Platform (self-referential) | `admin-bi-data.ts:*`, `admin-data.ts:*`, `admin-people-data.ts:*`, `admin-system-data.ts:*`, `admin-tracer-data.ts:*`, `admin/rollup-c.ts:*`, `src/app/admin/actions/triage.ts:*` | `admin_events` | med | Rollup RPCs return in budget; no 42501 on SECURITY DEFINER rollups. **Never NEUTRAL** — foundational infra; integrity-check failures red it immediately (§5 override). Dogfoods its own pipeline; wrapped FIRST (W15 Batch 0) |

### 1.2 CoachHelm (app: `coachhelm`) — 13 features

| Key | Label | Action globs | Primary table | Tier | healthSignal + thresholds |
|---|---|---|---|---|---|
| `coachhelm_ai_engine` | CoachHelm Engine | `insights.ts:` engine fns (§2.2), `insight-delivery.ts:*`, `player-fingerprint.ts:*` | `golf_coach_insights` | high (async) | Post-round trigger fan-out (`triggerPlayerInsightsAfterRound`) completes; insights/patterns accumulate per completed round. Heartbeat measured against round-submit cadence, NOT wall-clock (quiet round weeks ≠ amber). Threshold-starvation / philosophy-gate skips are `info`+`skipSentry` (server-error-logger.ts:44-51) — EXCLUDED from fingerprint math, shown as a separate "starvation rate" line on drill-in. High-tier |
| `alerts_system` | Alerts | `alerts.ts:*` | `golf_coach_insights` | med | Scan-team completes and inserts is_alert rows; ack/dismiss persist. Med-tier |
| `patterns_dashboard` | Patterns | `pattern-management.ts:*` | `golf_patterns_v2` | med | Lifecycle transitions (detected→confirmed→addressed→resolved/dismissed) persist; no stuck records. Med-tier |
| `insights_management` | Insights Management | `insight-management.ts:*`, `insight-evidence.ts:*`, `insights.ts:` lifecycle fns (§2.2) | `golf_coach_insights` | med | Search/filter/export/bulk ops return promptly; export produces a file. Med-tier |
| `intelligence_dashboard` | Intelligence Hub | `intelligence-dashboard.ts:*`, `team-category-insights.ts:*`, `coachhelm-data.ts:*`, `causal-relationships.ts:*` | `golf_patterns_v2` | med | Team summary/correlations complete without N+1 timeout (known 5+ queries/player gap — timeouts DO count as errors here). Med-tier |
| `coachhelm_analytics` | CoachHelm Analytics | `coachhelm-analytics.ts:*`, `player-effectiveness.ts:*` | `golf_insight_effectiveness` | low | Effectiveness reads succeed. Sparse table = expected-degraded, NOT an outage (all-zero dashboards don't error). Low-tier |
| `coaching_intelligence_settings` | Coaching Intelligence Settings | `coaching-philosophy.ts:*` | `golf_coach_philosophy` | low | Philosophy saves persist all fields + revalidate fires. Low-tier; any single critical reds immediately |
| `player_coachhelm_dashboard` | Player CoachHelm | `insights.ts:{getPlayerCoachHelmDashboard}`, `player-feedback.ts:*`, `insight-celebration.ts:*` | `golf_predictions` | med | Cold-start auto-generate path doesn't throw for zero-insight players. Med-tier |
| `round_review_ai` | Round Review AI | `round-reviews.ts:*`, `round-review-system.ts:*`, `round-recap.ts:*`, `v3/llm.ts:*`, `insights.ts:{generateRoundReview}` | `golf_round_reviews` | med | Review generation persists without timeout. TWO pipelines (V1/V2 rule-based + v3 LLM) both tagged here so whichever is live is covered; per-action name disambiguates on drill-in. LLM-gate skips (budget/flag, per CoachHelm v3 prereqs) are `info`, never errors. Med-tier |
| `development_plans_coach` | Development Plans (coach) | `development.ts:` coach fns (§2.2) | `golf_player_focus_areas` | med | Focus-area creation/updates visible on player side immediately. Med-tier |
| `my_development` | My Development (player) | `development.ts:{acceptFocusArea,declineFocusArea,updateFocusAreaProgress}`, `insights.ts:{getPlayerFocusAreas}` | `golf_player_focus_areas` | low | Player accept/decline/progress writes succeed; reads RLS-clean for own player_id. Low-tier |
| `drills_practice_rx` | Drills & Practice Rx | `drills.ts:*`, `v3/practice-rx.ts:*`, `v3/team-practice-rx.ts:*` | `golf_drills` | low | Rx generation + drill matching return (empty match set = degraded quality signal on drill-in, NOT an error). Low-tier |
| `coachhelm_v3_goals` | Goals & Progress (V3) | `v3/goals.ts:*`, `v3/goal-progress.ts:*`, `v3/focus-area-progress.ts:*`, `v3/intent.ts:*` | `golf_goals` | med | Goal CRUD/suggestions/progress evaluators complete. V3 surface = documented drift from the 28-feature doc, now first-class here. Med-tier |

### 1.3 Excluded from instrumentation (registry-listed for completeness)

| Key | Label | Why excluded | Files |
|---|---|---|---|
| `crm_recruiting_pipeline` | CRM Outreach (NCAA cold-email) | **Owner directive: never touch CRM.** No wrapping, no feature tag, no board dot. Filename exclusion `crm-*.ts` PLUS explicit exclusion of `resend-activity.ts` (CRM-adjacent by table/purpose, misses the filename rule — same trap as the two CRM-adjacent cron routes flagged in discovery). | `crm-assignee.ts`, `crm-automations.ts`, `crm-dedup.ts`, `crm-engagement.ts`, `crm-foundations.ts`, `crm-gmail-send.ts`, `crm-insights.ts`, `crm-manual-send.ts`, `crm-replies.ts`, `crm-sequences.ts`, `crm-templates.ts`, `crm-timeline.ts`, `resend-activity.ts` (73 exports total) |

**Also not wrapped (not action boundaries — excluded from coverage math, asserted by the
contract test's exclusion manifest):** `messages.ts` (re-export shim, no 'use server' logic),
`insight-delivery-ranking.ts`, `team-category-insights-helpers.ts`, `*-types.ts`,
`recruit-documents-categories.ts`, `team-switcher.constants.ts`, `admin/rollup-a.ts`,
`admin/rollup-b.ts`, `admin/rollup-c.shared.ts`.

---

## 2. Instrumentation Coverage Matrix

### 2.1 Totals (verified against the tree on branch `feat/helm-bridge-command-center`, 2026-07-01)

| Bucket | Count |
|---|---|
| Golf `export async function` action exports in 'use server' files, non-CRM | **413** (across 76 files under `src/app/golf/actions/`) |
| Golf messaging exports in shared `src/app/actions/messages.ts` (golf-named only) | **10** |
| Admin action (`src/app/admin/actions/triage.ts:resolveTriageEvents`) | **1** |
| **Total slated for `withAdminObserved({feature,…})`** | **424** |
| Already wrapped (W6 exemplar: `savePartialRound`, golf.ts:4949-4961) | 1 |
| **Net new wraps in W15** | **423** |
| CRM exports excluded (13 files + resend-activity.ts) | 73 |
| Baseball / lifting exports deferred (already inside their own HOFs) | 354 / 86 |

The 10 golf exports in the shared messages file (`src/app/actions/messages.ts:422,514,518,538,682,925,929,946,983,1168`):
`sendGolfMessage`, `createGolfConversation`, `markGolfMessagesAsRead`,
`createGolfTeamBroadcast`, `getGolfTeamPlayersForBroadcast`, `updateGolfMessage`,
`deleteGolfMessage`, `getGolfPlayerUserId`, `searchGolfMessages`,
`getGolfActiveTeamConversationIds`. The sport-branching generic exports
(`sendMessage`, `createConversation`, `markMessagesAsRead`, `updateMessage`,
`deleteMessage`) and all `*Baseball*` exports stay UNTOUCHED (baseball hold).

### 2.2 File → feature map (default tag per file; every wrapped export in the file gets it unless overridden below)

| Feature | Files (defaults) | Actions |
|---|---|---:|
| round_tracking | round-drafts.ts + golf.ts overrides | 10 |
| stats_analytics | stats.ts, stats-data.ts, stats-intelligence.ts, stats-leak-maps.ts, shot-analytics.ts, team-sg-baseline.ts | 31 |
| qualifiers | v3/qualifying.ts + golf.ts overrides | 10 |
| my_qualifiers | golf.ts override | 1 |
| calendar_events | attendance.ts, calendar-feeds.ts, event-documents.ts, recurring-events.ts (4 of 6) + golf.ts overrides | 34 |
| academics_classes | calendar-sync.ts, recurring-events.ts (2 of 6) | 4 |
| roster_management | roster.ts + golf.ts overrides | 5 |
| task_management | tasks.ts, task-templates.ts, task-reminders.ts | 31 |
| messaging | message-attachments.ts, src/app/actions/messages.ts (golf exports) | 14 |
| announcements | announcements.ts, communication.ts + golf.ts override | 9 |
| documents | documents.ts | 18 |
| travel | travel.ts | 14 |
| team_info | team-switcher.ts + teams.ts overrides | 7 |
| join_team_flow | teams.ts (default) | 10 |
| settings | v3/notification-prefs.ts | 4 |
| course_library | course-library.ts, courses.ts + golf.ts overrides | 35 |
| recruiting_prospect_tracking | recruiting.ts, recruit-documents.ts | 8 |
| player_hub | dashboard-data.ts overrides | 2 |
| coach_dashboard | command-palette.ts + dashboard-data.ts overrides | 3 |
| notifications | coach-notifications.ts, player-notifications.ts, push-notifications.ts + golf.ts overrides | 11 |
| auth_onboarding | auth.ts, onboarding.ts, access-code.ts, demo-access.ts, demo-tracking.ts | 9 |
| whats_new | whats-new.ts | 1 |
| my_game_profile | player-profile-stats.ts | 2 |
| admin_dashboard | admin-bi-data.ts, admin-data.ts, admin-people-data.ts, admin-system-data.ts, admin-tracer-data.ts, admin/rollup-c.ts, src/app/admin/actions/triage.ts | 14 |
| coachhelm_ai_engine | insight-delivery.ts, player-fingerprint.ts + insights.ts (default) | 25 |
| alerts_system | alerts.ts | 2 |
| patterns_dashboard | pattern-management.ts | 7 |
| insights_management | insight-management.ts, insight-evidence.ts + insights.ts overrides | 18 |
| intelligence_dashboard | intelligence-dashboard.ts, team-category-insights.ts, coachhelm-data.ts, causal-relationships.ts | 13 |
| coachhelm_analytics | coachhelm-analytics.ts, player-effectiveness.ts | 6 |
| coaching_intelligence_settings | coaching-philosophy.ts | 2 |
| player_coachhelm_dashboard | player-feedback.ts, insight-celebration.ts + insights.ts override | 3 |
| round_review_ai | round-reviews.ts, round-review-system.ts, round-recap.ts, v3/llm.ts + insights.ts override | 27 |
| development_plans_coach | development.ts (default) | 10 |
| my_development | development.ts overrides + insights.ts override | 4 |
| drills_practice_rx | drills.ts, v3/practice-rx.ts, v3/team-practice-rx.ts | 6 |
| coachhelm_v3_goals | v3/goals.ts, v3/goal-progress.ts, v3/focus-area-progress.ts, v3/intent.ts | 14 |
| **TOTAL** | | **424** |

**Function-level overrides (the only 6 multi-feature files):**

- `golf.ts` (39 exports):
  - round_tracking: `submitGolfRoundComprehensive`, `savePartialRound`(wrapped), `deleteInProgressRound`, `deleteShot`, `updateShot`, `getRoundShotDetails`
  - calendar_events: `createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent`, `deleteGolfEventPermanently`, `respondToEvent`, `sendEventReminderToPlayers`, `checkScheduleConflicts`, `getPlayerAvailability`, `getCurrentUserBusyPeriods`, `getPlayerEventRSVP`, `getEventRSVP`, `addCoachBlockedTime`, `deleteCoachBlockedTime`, `updateCoachBlockedTime`, `getCoachBlockedTime`
  - qualifiers: `createGolfQualifier`, `getQualifierRoundCourses`, `setQualifierRoundCourses`, `updateQualifierStatus`, `getNextQualifierRoundNumber`, `getQualifierLeaderboard`
  - my_qualifiers: `getPlayerQualifiers`
  - announcements: `createAnnouncement`
  - roster_management: `invitePlayerToTeam`, `updatePlayerStatus`, `getPendingInvitations`
  - notifications: `getNotifications`, `markNotificationRead`, `markAllNotificationsRead`
  - course_library: `getPlayerSavedCourses`, `savePlayerCourse`, `touchSavedCourse`, `getRecentCoursesForPlayer`
- `insights.ts` (26 exports): default `coachhelm_ai_engine`; overrides —
  insights_management: `acknowledgeInsight`, `dismissInsight`, `reactivateInsight`, `resolveInsight`, `rateInsight`, `acknowledgeComposedInsight`, `dismissComposedInsight`;
  round_review_ai: `generateRoundReview`; my_development: `getPlayerFocusAreas`;
  player_coachhelm_dashboard: `getPlayerCoachHelmDashboard`
- `dashboard-data.ts` (4): coach fns → coach_dashboard; player fns → player_hub
- `teams.ts` (13): default `join_team_flow`; overrides team_info: `createTeam`, `updateTeam`, `regenerateJoinCode`
- `development.ts` (13): default `development_plans_coach`; overrides my_development: `acceptFocusArea`, `declineFocusArea`, `updateFocusAreaProgress`
- `recurring-events.ts` (6): default `calendar_events`; overrides academics_classes: `createAcademicExclusion`, `deleteAcademicExclusion`

This exact map is encoded machine-readably in `src/lib/admin/feature-registry.ts`
(W15 Task 3) and asserted by contract tests (W15 Task 4): **no un-wrapped export in a
wrapped area, no wrap without a valid FeatureKey, no CRM file ever appearing.**

### 2.3 Wrap pattern (load-bearing — Next 'use server' constraint)

Per the W6 exemplar and its inline comment (src/app/golf/actions/golf.ts:4942-4961):
rename the body to `<name>Impl`, build the observed closure ONCE at module scope,
export a thin async-function delegator under the original name. `'use server'` files
require exported actions to be async function declarations — const-exporting the HOF
result breaks Next's build in golf's files (do NOT copy baseball's `export const =
withBaseballAction(...)` style into golf files).

```typescript
async function completeTaskImpl(taskId: string): Promise<ActionResult<void>> { /* body unchanged */ }
const observedCompleteTask = withAdminObserved(
  'completeTask',
  { sport: 'golf', feature: 'task_management' },
  completeTaskImpl,
);
export async function completeTask(taskId: string): Promise<ActionResult<void>> {
  return observedCompleteTask(taskId);
}
```

Rules: fire-and-forget logging only (wrapper contract, observed-action.ts:6-7 "NEVER
changes the wrapped function's behavior"); never introduce throws; never touch the body;
`NEXT_REDIRECT`/`NEXT_NOT_FOUND` already skipped; `handled:false` set by the wrapper.

### 2.4 RLS-denial centralization (W15 Task 15)

- `fetchAllRows` / `fetchAllRowsResult` (src/lib/supabase/fetch-all-rows.ts:24,65): widen
  the error type `{message: string}` → `{message: string; code?: string | null}` (the
  PostgREST `.code` exists at runtime; the narrow type drops it — isRlsDenial needs it,
  rls-denial.ts:15) and call `maybeCaptureRlsDenial(error, rlsCtx)` in both error
  branches when the new optional `rlsCtx` arg is provided. One change covers the 13 golf
  action files + 2 route handlers that already route reads through it.
- Golf's 7 files with ad-hoc 42501 checks (event-documents.ts, insights.ts, teams.ts,
  admin-data.ts, recruit-documents.ts, golf.ts, round-reviews.ts) additionally call
  `maybeCaptureRlsDenial` at their existing check sites (keep the user-facing message
  logic; add the capture).
- `sanitizeDbError` (src/lib/db-error.ts) has its own silent RLS detection but is on
  baseball call paths too → NOT wired in W15 (baseball hold). Open item.

---

## 3. Health-State Machine (evaluated in priority order; first match wins)

Computed by `computeFeatureStatus()` (W16 Task 1) — a pure, unit-tested function over
the `get_feature_health()` row + Sentry counts + activity. Not a weighted sum.

1. **NEUTRAL** — `seasonalEmpty: true` AND primary-table rows in lookback = 0, OR the
   feature has no primary table AND zero events ever tagged (pre-rollout). Checked FIRST
   so empty-by-design can never fall through to amber-by-staleness. (No golf/coachhelm
   feature is seasonalEmpty today; the flag exists for baseball's return and for
   pre-tagging day-1 states.) Exception: `admin_dashboard` is never NEUTRAL.
2. **RED** — any of: unresolved `critical` admin_event (24h); latest integrity check for
   the feature = fail; grouped error-fingerprint rate above the tier's RED line in the
   **current AND previous** 24h window (hysteresis); RLS-denial cluster on insert/update
   sustained 2 windows. Low-tier exception: a single `critical` reds immediately (one
   critical on a quiet feature is proportionally loud).
3. **AMBER** — fingerprint rate above the tier's AMBER line in the current window
   (single window suffices for amber); any unresolved non-critical Sentry issue tagged
   to the feature; RLS-denial cluster (first window); heartbeat stale beyond tier
   threshold AND a primary table exists AND not seasonal.
4. **GREEN** — otherwise.

**Trend badge (additive, not a 5th state):** current-24h grouped error count vs prior
24h — >20% down = improving ↓, >20% up = worsening ↑, else flat →. Rendered beside the
dot so "amber-but-improving" reads differently from "amber-and-worsening".

**Leaving red/amber:** requires a clean (below-amber) current 24h window — a quiet
minute never flips green (N5).

### Tier thresholds

| Tier (trailing-7d writes on primary table; static fallback in registry) | GREEN | AMBER | RED (2 consecutive windows) | Heartbeat stale |
|---|---|---|---|---|
| high (≥200/24h) | 0 fp/24h, or ≤1 fp affecting <0.5% of writes | 2–4 fp/24h, or 0.5–2% error rate | ≥5 fp, any unresolved critical, or >2% | 6h (in-season) |
| med (10–199/24h) | 0 fp/24h | 1 fp/24h | ≥2 fp/24h, or any critical | 72h (7d for qualifiers) |
| low (<10/24h) | 0 fp/7d | 1 fp/7d | ≥2 fp/7d, or ANY single critical (no 2-window grace) | 14d |
| seasonal/empty | rows=0 → NEUTRAL (not green) | heartbeat never ambers | critical/integrity-fail still reds | never (info chip only) |

fp = distinct `admin_events.fingerprint` values at severity error/critical. Warnings and
`info`+`skipSentry` rows never count (N3). Thresholds are first-pass constants in
`feature-registry.ts` (NOT baked into SQL) — tune after 1–2 weeks of tagged data.

---

## 4. Feature Health Board (design)

**Route:** `/admin/health` — 9th tab in `ADMIN_NAV` (src/app/admin/_components/admin-nav.ts:8-17), label "Health", key `9`.
`requireSuperAdmin()` is the FIRST LINE of the page (src/lib/admin/require-super-admin.ts:8,42). Data via
server components + the W3/W4 panel pattern (`PanelBoundary`/`PanelStates`); user-scoped
Supabase client for the RPC (the `is_super_admin()` gate needs `auth.uid()` — service
role would be rejected, same as W3's RPCs).

**Aesthetic:** Fairway — cream `#FFFEFA` canvas, helm green `#16A34A` accents, matte
cards, editorial type. Status dots are the **fw-status trio** from the Fairway tokens
(`fw-success` / `fw-warning` / `fw-danger` + `neutral`, exactly as mapped in
src/components/fairway/controls/status-pill.tsx:30-37) rendered via `StatusPill` with
`dot`, an icon, AND a text label — **never color alone** (a11y rule already encoded in
that component's header).

**Layout:**

1. **Status grid** — two labeled groups: "GolfHelm" (24 dots) and "CoachHelm" (13 dots),
   responsive grid of compact feature chips: `StatusPill` tone per state
   (green=success ✓, amber=warning ⚠, red=danger ✕, neutral=— "no data") + feature label
   + trend arrow + 24h grouped-error count (one line with a count — never N rows, N4).
   Below the two groups: a small muted note-card — **"Baseball — paused (deferred until
   prod stabilizes)"** — no dots, no data fetch, zero baseball instrumentation.
2. **Per-feature summarization card** (click a chip → right-rail/expanding card):
   healthSignal sentence from the registry; state + since-when; top-3 grouped signatures
   (`groupIncidents` from src/lib/admin/incident-grouping.ts, scoped to
   `feature = key` — fields title/occurrences/firstSeen/lastSeen already exist); RLS-denial
   count; warning count (drill-in only, N3); starvation-rate line for
   `coachhelm_ai_engine`; heartbeat "last activity Xh ago" chip; annotated known-gaps
   line (e.g. task dual-table bug) so pre-existing drift is never misread as an outage.
   Template (no LLM): `"{n} {severity} incident(s) across {fp} signature(s) in 24h,
   {trendWord} vs yesterday. Top: \"{topTitle}\" ({count}×, last seen {rel})."`
3. **Drill-in:** "View in Errors →" links to `/admin/errors?feature=<key>` (W16 adds the
   `feature` URL filter to the existing URL-persisted filter set on the Errors tab).
4. **Overview rollup** (`FeatureHealthRollup`, mounted on `/admin` Overview): one compact
   row — "Features: 35 green · 1 amber · 1 red · 0 neutral" with the red/amber feature
   chips inline (max 4, then "+n more → Health"). Banner integration per N6: the existing
   `AdminStatusBanner` may go red ONLY for a red feature, a new/regressed fingerprint, or
   a cron/integrity failure — never for warnings, never for volume alone.

**Empty/seasonal reads NEUTRAL** (gray pill, "no data" label, info chip "expected —
seasonal/pre-launch"), never red — enforced in `computeFeatureStatus` order (§3.1).

---

## Appendix A — Deferred future-reference feature maps (DO NOT INSTRUMENT)

Kept verbatim from the 2026-07-01 discovery pass so baseball/Lift Lab can be enabled
later by adding registry rows + wiring their existing HOFs — no schema or RPC change
needed (the `p_features` input is data). Prerequisites recorded for that day:
widen the `sport` union to include `'lifting'` in server-error-logger.ts:53,
observed-action.ts:19, rls-denial.ts:26; wire `maybeCaptureRlsDenial` into
`with-baseball-action.ts` / `with-lifting-action.ts` catch blocks; pass the typed
`context.sport` (not just Sentry tags) from with-lifting-action.ts.

**BaseballHelm (52, paused):** auth, demo_access, onboarding, team_join_and_staff_invites,
roster, calendar_events, messaging, announcements, tasks, documents, travel, camps,
games_and_stats_center, stat_visual_views, stat_event_imports_elite, import_center,
lineups, performance_lift_lab, dev_plans, development_metrics_snapshots,
videos_and_library, video_classes_and_class_conflicts, practice_planning,
practice_effectiveness, practice_intelligence, scrimmage_lineup_builder, postgame_review,
coachhelm_engine, coachhelm_insights, coachhelm_actions_and_signals, operational_signals,
decision_room, coach_notes, ai_governance, daily_contract, timeline_and_acknowledgements,
academics_and_eligibility, readiness_and_player_peek, recruiting_pipeline,
college_interest, player_interests_and_recruiting_exposure,
recruiting_philosophy_and_percentiles, scout_packets, passport_and_privacy_settings,
coach_philosophy_settings, program_settings_hub, roles_and_permissions, staff_settings,
team_and_season_settings, notifications, public_profiles, legacy_coach_type_redirect_shims.
Notable seasonal_empty candidates: performance_lift_lab, camps, games off-season.

**Lift Lab / lifting (15, paused):** lift_lab_standalone_app, lift_lab_athlete_roster,
lift_lab_program_builder, lift_lab_sessions_coach, lift_lab_player_today,
lift_lab_readiness_availability, lift_lab_soreness, lift_lab_weight_checkins,
lift_lab_nutrition, lift_lab_performance_profile, lift_lab_imports,
baseball_v11_premium_lifting_builder, baseball_lifting_lite_surface,
baseball_lift_builder_advanced, baseball_player_today_lift_summary.

---

## Appendix B — Open items (tracked, not blocking W15/W16)

1. Sentry per-feature bucketing spike: confirm whether the issues list endpoint returns
   per-issue tags at list scope (src/lib/admin/sentry-api.ts RawIssue has no `tags`);
   fallback = N filtered `feature_area:<key>` queries at the 60s revalidate window.
2. `sanitizeDbError` RLS wiring (shared with baseball) — do after baseball unfreezes.
3. Historical `admin_events.feature` backfill: intentionally NOT done — panel copy reads
   "feature tagging began 2026-07-02".
4. my_game_profile / my_standing / team_hub data-fetch trace (route ownership gap).
5. Threshold recalibration after 1–2 weeks of tagged production data.
6. Round-review pipeline precedence (V1/V2 vs v3 LLM) — both tagged `round_review_ai`;
   determine which is live before adding a pipeline-specific healthSignal.
7. Baseball/lifting enablement prerequisites (Appendix A header).
