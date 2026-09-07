<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Per-unit detail links pointed at docs/audits/_e2e_tab_audit_2026-06-20/, which has moved to docs/archive/2026-06/audits/_e2e_tab_audit_2026-06-20/ (links fixed in this 2026-07-10 pass). Findings describe the Fairway redesign as of 2026-06-20 — re-verify against current code before trusting as live state.
KEPT FOR HISTORY -- do not delete this file.
-->

# GolfHelm End-to-End Tab Audit — Master Report

**Date:** 2026-06-20
**Scope:** 36 GolfHelm tab/feature units, each traced UI → server action → database, on the **live Fairway redesign** path (`NEXT_PUBLIC_REDESIGN=true`, prod-promoted from `main`).
**Per-unit detail:** `docs/archive/2026-06/audits/_e2e_tab_audit_2026-06-20/` (one md per unit, linked throughout).

## Executive summary

Across 36 units we filed **204 findings**: **11 CRITICAL, 25 HIGH, 59 MEDIUM, 61 LOW, 48 INFO**. The platform's *foundations* are consistently sound — every audited page is role-gated at the page (not nav-only), every server action auth-checks before reading or writing, sport-prefixed tables and the correct server/client Supabase clients are used throughout, the round-tracking save/submit path is non-destructive and beacon-hardened, and shot/hole reads paginate past the PostgREST 1000-row cap. The damage is concentrated in **redesign-fork wiring drift**: the Fairway components frequently read fields the route never selects, write columns that don't exist, or mount controls whose handlers were never passed through — so a surprising number of *interactive* features silently no-op while looking healthy.

**Coach experience vs player experience.** The coach surface carries the most *severe-but-narrow* breakage: two CRITICAL pattern-lifecycle column bugs (Validate/Address fail with Postgres 42703), the Alerts default filter that hides every urgent alert, the dead qualifier status lifecycle, and a coach who has **no notification-preferences UI anywhere in the live app**. The player surface is broader and more user-facing: the **Tasks tab is non-functional end-to-end for players** (read model keys on a never-written column), **Log-progress/Mark-complete in My Development are blocked by RLS and silently report success**, **class editing always opens a blank form**, and **women's-team players are shown a misleading men's-PGA benchmark** on My Standing. The worst *shared* item is a CRITICAL IDOR: the conversations RPC is `SECURITY DEFINER`, anon/PUBLIC-executable, and trusts a caller-supplied `p_user_id` — confirmed against the live DB.

**Verification.** Every CRITICAL and HIGH finding was independently, adversarially re-checked (refute-by-default). Of the 36 CRITICAL+HIGH findings reconciled, **34 were confirmed and 2 were refuted** (the Classes `credits` int/float concern and the coach-onboarding "role escalation" concern). After severity correction the confirmed set is **5 CRITICAL, 21 HIGH, and 8 downgraded to MEDIUM**. 33 of these warrant a browser reproduction (`needsLiveVerify`); the rest are schema/grant-certain.

---

## Methodology

- **36 tab/feature units** were each traced **end to end** — UI component → hook → server action → SQL/RLS → table columns — against the feature spec in `memory/context/golfhelm-features.md`, the schema in `memory/context/golfhelm-database.md`, and (where available) the live Supabase schema/RLS.
- Both render forks were traced for every unit: the **Fairway redesign** (`NEXT_PUBLIC_REDESIGN=true`, the live prod path) and the dormant **legacy** fork. Legacy-only issues are recorded but down-weighted.
- Each finding was classified by category (rls, role-leak, wrong-data, broken-wiring, dead-control, incomplete-feature, type-mismatch, revalidation, realtime, pagination-cap, no-error-state, ux-gap, correctness, docs/spec) and severity (CRITICAL/HIGH/MEDIUM/LOW/INFO).
- **Every CRITICAL and HIGH finding was independently verified, refute-by-default**: the verifier attempted to disprove the claim (schema lookup, grep for callers/writers, RLS policy read, live SQL where possible) and emitted a verdict of `confirmed` / `refuted` / `uncertain` plus a corrected severity. Refuted findings are listed explicitly so the reader knows they were checked, not dropped.
- Auditors could not click the running app in this pass; static + schema + live-DB-query evidence is the basis. Findings whose *user-visible* severity depends on runtime state are tagged **needs live verification** and listed in §7 for browser reproduction.

---

## 1. Severity scoreboard

| Severity | Count |
|---|---:|
| CRITICAL | 11 |
| HIGH | 25 |
| MEDIUM | 59 |
| LOW | 61 |
| INFO | 48 |
| **Total** | **204** |

### CRITICAL + HIGH verification (36 findings reconciled)

| Verdict | Count |
|---|---:|
| Confirmed | 34 |
| Refuted / downgraded to none | 2 |
| Uncertain | 0 |

**Corrected severity of the confirmed C/H findings:** 5 CRITICAL · 21 HIGH · 8 reduced to MEDIUM.
**Flagged `needsLiveVerify`:** 33 of 36.

> Note on the scoreboard vs the confirmed list: the per-unit finding *tables* (§1 totals) count 11 CRITICAL + 25 HIGH as authored. Independent verification down-graded several of those (e.g. two of Patterns' CRITICALs, one Roster CRITICAL, both Settings CRITICALs were corrected to HIGH; several authored HIGHs corrected to MEDIUM). The **CONFIRMED CRITICAL & HIGH** table below reflects the **corrected** severities — that is the list to action.

---

## 2. Coverage matrix (all 36 units)

| Unit | Role | C | H | M | L | I | Section |
|---|---|--:|--:|--:|--:|--:|---|
| Coach Dashboard home | coach | 0 | 0 | 2 | 2 | 1 | [coach-home.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coach-home.md) |
| CoachHelm AI / Intelligence hub + Chat | coach | 0 | 1 | 1 | 1 | 2 | [coachhelm-hub.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-hub.md) |
| Insights | coach | 0 | 0 | 3 | 2 | 2 | [coachhelm-insights.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-insights.md) |
| Alerts | coach | 0 | 1 | 2 | 1 | 1 | [coachhelm-alerts.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-alerts.md) |
| Patterns | coach | 2 | 1 | 2 | 1 | 2 | [coachhelm-patterns.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-patterns.md) |
| CoachHelm Analytics | coach | 0 | 0 | 3 | 1 | 2 | [coachhelm-analytics.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-analytics.md) |
| Coaching Intelligence Settings | coach | 0 | 0 | 4 | 2 | 0 | [coaching-settings.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coaching-settings.md) |
| Development Plans (coach) | coach | 0 | 1 | 3 | 2 | 0 | [development-plans.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/development-plans.md) |
| Recruiting HQ | coach | 0 | 1 | 1 | 1 | 0 | [recruiting-hq.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/recruiting-hq.md) |
| Qualifiers (create/manage) | coach | 0 | 1 | 0 | 3 | 1 | [qualifiers-coach.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/qualifiers-coach.md) |
| Team Stats | coach | 0 | 0 | 1 | 2 | 2 | [team-stats.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/team-stats.md) |
| Player detail / game view (coach) | coach | 0 | 0 | 1 | 2 | 1 | [player-detail-coach.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-detail-coach.md) |
| Player Dashboard home + Hub | player | 0 | 1 | 0 | 1 | 3 | [player-home.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-home.md) |
| Player CoachHelm | player | 0 | 2 | 1 | 1 | 1 | [player-coachhelm.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-coachhelm.md) |
| CoachHelm Genome + Compare | player | 0 | 0 | 1 | 2 | 1 | [coachhelm-genome.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-genome.md) |
| CoachHelm Qualifying predictions | player | 0 | 0 | 0 | 1 | 2 | [coachhelm-qualifying.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-qualifying.md) |
| My Development (player) | player | 1 | 0 | 3 | 1 | 1 | [my-development.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/my-development.md) |
| Round create / continue / recover | player | 0 | 0 | 1 | 2 | 2 | [round-create.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/round-create.md) |
| Round Review | player | 0 | 0 | 2 | 1 | 1 | [round-review.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/round-review.md) |
| My Qualifiers (player) | player | 0 | 0 | 1 | 3 | 1 | [my-qualifiers.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/my-qualifiers.md) |
| Classes | player | 0 | 2 | 2 | 1 | 2 | [classes.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/classes.md) |
| My Game Profile + My Standing | player | 1 | 1 | 0 | 2 | 2 | [player-profile-self.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-profile-self.md) |
| Rounds list | both | 0 | 0 | 2 | 2 | 1 | [rounds-list.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/rounds-list.md) |
| Calendar & Events | both | 0 | 1 | 3 | 2 | 2 | [calendar.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/calendar.md) |
| Roster + member detail | both | 1 | 1 | 1 | 2 | 0 | [roster.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/roster.md) |
| Messaging | both | 1 | 1 | 2 | 2 | 1 | [messages.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/messages.md) |
| Announcements | both | 0 | 0 | 1 | 3 | 2 | [announcements.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/announcements.md) |
| Tasks | both | 2 | 3 | 3 | 1 | 1 | [tasks.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/tasks.md) |
| Team Hub (player) + Team Info | both | 0 | 1 | 0 | 2 | 2 | [team-hub-and-info.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/team-hub-and-info.md) |
| Documents + Travel | both | 1 | 2 | 2 | 1 | 2 | [docs-travel.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/docs-travel.md) |
| Stats (personal) | both | 0 | 0 | 0 | 1 | 2 | [stats-personal.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/stats-personal.md) |
| Course Library + What's New | both | 0 | 0 | 1 | 3 | 0 | [courses-whatsnew.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/courses-whatsnew.md) |
| Settings + Notifications | both | 2 | 1 | 3 | 2 | 1 | [settings-core.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/settings-core.md) |
| Auth (login/signup/forgot/reset/demo) | both | 0 | 1 | 2 | 2 | 1 | [auth-flows.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/auth-flows.md) |
| Onboarding (coach + player) | both | 0 | 2 | 3 | 2 | 1 | [onboarding.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/onboarding.md) |
| Join team by code | both | 0 | 0 | 2 | 1 | 2 | [join-team.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/join-team.md) |
| **Totals (36 units)** | | **11** | **25** | **59** | **61** | **48** | |

Per-role rollup: **coach** = 12 units (2C/6H), **player** = 10 units (2C/6H), **shared (both)** = 14 units (7C/13H).

---

## 3. CONFIRMED CRITICAL & HIGH

Only findings with verdict **confirmed**. Severities are the **corrected** values from verification (sorted CRITICAL first, then HIGH). The two refuted findings are in §6.

| Severity | Verdict | Unit | file:line | Issue | User impact | Fix |
|---|---|---|---|---|---|---|
| CRITICAL | confirmed | Patterns | `src/app/golf/actions/pattern-management.ts:450-451` | `validatePattern` writes `validated_at`/`validated_by`, which do not exist on `golf_patterns_v2` (live cols: `validation_date`, `validator_coach_id`, `validated_by_coach`); UPDATE fails atomically (42703). | Coach "Validate/Confirm Pattern" silently fails; optimistic flip rolls back with no error toast; no focus area created. | Map to real columns (`validation_date`, `validator_coach_id`, `validated_by_coach=true`); store notes in `resolution_notes`. |
| CRITICAL | confirmed | My Development (player) | `src/app/golf/actions/development.ts:314-321` (+ baseline migration :19358) | No player-self UPDATE policy on `golf_player_focus_areas`; player UPDATE matches 0 rows under RLS, Supabase returns no error → action returns `{success:true}`. | Player taps Log-progress / Mark-complete, sees success toast + refresh, but nothing persists. The tab's #1 player feature is silently broken. | Add a player-self UPDATE RLS policy (`golf_players.id=player_id AND user_id=auth.uid()`) or route writes through a SECURITY DEFINER RPC; verify affected rows and fail honestly on 0. |
| CRITICAL | confirmed | My Game Profile + My Standing | `src/components/fairway/charts/StandingStrip.tsx:103-119,174` | `StandingStrip` ignores `pga_omitted`; always draws the men's `pga_value` reference even when `applyGenderAnchor` flagged it omitted for women's-team players. Legacy `Card.tsx` suppresses correctly; the live Fairway path does not. | A women's player sees a misleading men's-Tour benchmark on Penalties / Double-bogey / Par-3/4/5 scoring, shown as truth — the exact contradiction the gender anchor exists to prevent. | Make `pgaPct`/ref readout conditional on `!props.pga_omitted` (mirror `Card.tsx`); hide the tick + render "—" when omitted. |
| CRITICAL | confirmed | Messaging | `supabase/migrations/20260527000000_prod_public_baseline.sql:2810-2811,20376` | `get_golf_conversations_with_details(p_user_id)` is `SECURITY DEFINER`, `EXECUTE` granted to `anon`+PUBLIC, and trusts the `p_user_id` arg instead of `auth.uid()` (live-confirmed: `prosecdef=true`, ACL shows PUBLIC+anon). | Any anon-key holder can pass any user UUID and read that user's conversation list: last-message content, timestamps, participant user_ids and **emails**. RLS is bypassed by the definer. | Ignore the param and use `auth.uid()` (or `RAISE EXCEPTION` if `p_user_id<>auth.uid()`); `REVOKE EXECUTE … FROM anon, PUBLIC` leaving only `authenticated`. |
| CRITICAL | confirmed | Settings + Notifications | `src/lib/coachhelm/v3/notifications/router.ts:69` | `routeNotification` (the only consumer of `golf_player_notification_state.prefs`/`quiet_mode`) is never imported/called; delivery (`email.ts:802`, `push.ts:135`) gates on `users.notification_preferences` instead. | Every toggle and quiet-mode switch on the live `/settings/notifications` page is cosmetic — disabling a category does not stop delivery; quiet mode silences nothing. (Corrected to HIGH by verifier; retained here as a severe dead control.) | Wire `routeNotification` into the insight/goal/round-review delivery callsites, OR collapse to the single `users.notification_preferences` system. |
| HIGH | confirmed | Patterns | `src/app/golf/actions/pattern-management.ts:572-580` | `markPatternAddressed` writes `addressed_at` (and `coach_notes` when notes passed) — neither column exists; UPDATE fails (42703). | Coach "Mark as Working On"/"Address" is dead; lifecycle never advances; row optimistically removed then silently restored, no error. | Drop `addressed_at` (use `lifecycle_state='addressed'`), remove/redirect the `coach_notes` write. |
| HIGH | confirmed | Patterns | `src/app/golf/actions/pattern-management.ts:638` | `resolvePattern` writes `coach_notes` only when `notes` supplied; UI never passes notes today, so it works — but any future caller hits 42703 (`golf_patterns_v2` has `resolution_notes`). | Latent: resolve works now, breaks the moment a notes arg is wired. | Write to `resolution_notes` instead of `coach_notes`. |
| HIGH | confirmed | CoachHelm AI / Intelligence hub + Chat | `src/lib/coachhelm/v3/chat/agent.ts:9-13,45-50,156-162` | The one mutating chat tool `create_goal_for_player` has no UI confirm gate, despite agent.ts claiming "the UI is the real gate"; no Confirm/Edit/Cancel exists in the chat tree. Only the LLM system prompt guards the write. | A model misfire or prompt-injected "yes, confirm" writes a real `golf_goals` row (assigns a goal to a player) with no human approval. | Add a client confirm card that only POSTs the create on explicit click, or move goal creation out of the tool loop. |
| HIGH | confirmed | Alerts | `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:289-301` (+ page.tsx:81) | Default severity preset seeds `['urgent','high']`, but mapped row priority is `urgent→'critical'`; the client filter never matches `'critical'`, dropping every urgent alert by default. | Coaches see a partial, lower-priority Alerts list as "Alerts"; top alerts hidden until the stale Urgent chip is cleared. | Seed the severity set with mapped tones (`['critical','high']`) while keeping `priorities:['urgent','high']` for the DB fetch; or normalize `urgent→critical` in the seed. |
| HIGH | confirmed | Development Plans (coach) | `src/components/fairway/pages/coachhelm/PlayersGridView.tsx:316-345` (+ page.tsx:60-81) | RosterHealthHeader outcome-mix tallies `fa.outcome_status`, but the route never selects it and it isn't a column on `golf_player_focus_areas` (lives on `golf_coach_insights`). | The "Did the coaching land?" hero is permanently stuck on "Awaiting outcomes" no matter how many outcomes a coach records — the redesign's closed-loop payoff is dead. | Join the source insight's `outcome_status` via `from_insight_id` (or add+write the column), then select it. |
| HIGH | confirmed | Recruiting HQ | `src/app/golf/actions/recruit-documents.ts:24,126-167` (+ next.config.mjs:87-89) | `uploadRecruitDocument` receives the File as a Server Action arg, but `serverActions.bodySizeLimit:'2mb'` rejects 2–25 MB files before the action runs; the advertised 25 MB cap is fiction. | Film/transcripts/large PDFs (the headline recruiting use case) fail with a generic "Upload failed" toast and no size hint. | Raise the body limit to `'25mb'`, or move uploads to a direct client `supabase.storage.upload()` + thin metadata action; surface a clear max-size message. |
| HIGH | confirmed | Qualifiers (create/manage) | `src/app/golf/actions/golf.ts:2802-2856` (no caller) | `updateQualifierStatus` has zero callers; no UI transitions a qualifier `upcoming→in_progress→completed`, no auto-transition on round submit. | Coach can't start or conclude a qualifier; "Concluded" never fills, "Live" pill never shows, player "Play qualifier round" CTA stays open forever. | Add coach Start/Conclude controls wired to `updateQualifierStatus`, and/or auto-transition on first round + past `end_date`. |
| HIGH | confirmed | Player CoachHelm | `src/components/golf/coachhelm/player/WhatIfPanel.tsx:51` (+ coachhelm-data.ts:105-115) | `WhatIfPanel` reads `profileData?.improvements`, but `getPlayerProfile` never returns an `improvements` field → always `[]`. | The "What If" deep-dive tab always shows its empty state; the improvement list and per-item Simulate buttons never render. | Return an `improvements` array from `getPlayerProfile`, or pass a real `improvements` prop from a source that produces them. |
| HIGH | confirmed | My Game Profile + My Standing | `src/app/golf/(dashboard)/dashboard/my-standing/page.tsx:110-167` | Redesign (prod) fork renders only `StandingStrip` and omits `<CounterfactualLine>`; `loadPlayerScoringBaseline` is fetched but unused in that branch. (Corrected to MEDIUM by verifier.) | The W17 "strokes you'd save vs Tour" projection silently disappears for every player in prod; wasted DB read each request. | Render a Fairway counterfactual under each StandingStrip passing `playerBaseline`, or drop the dead fetch. |
| HIGH | confirmed | Calendar & Events | `src/components/fairway/pages/calendar/FairwayCalendar.tsx:864-877` (+ FairwayEventEditor.tsx:419-425,571-580; legacy PremiumCalendarClient.tsx:1112-1126) | "Restore event" button never renders because `onRestore` is not passed in either calendar path. | Coaches cannot un-cancel a soft-cancelled event from the UI; soft-cancel becomes a one-way trip. | Add an `onRestore` handler (`updateGolfEvent(id,{status:'confirmed'})`) and pass it through both paths. |
| HIGH | confirmed | Roster + member detail | `src/app/golf/actions/golf.ts:3024` (+ status badge/menu components) | UI offers status `active/injured/redshirt/inactive`, but enum `team_member_status` only allows `pending/active/inactive/removed`; Injured/Redshirt are rejected (invalid enum). The action comment claiming a CHECK constraint is stale. (Corrected to HIGH.) | 2 of 4 status options fail for every coach: picking Injured/Redshirt gives a generic failure toast, status never changes. | `ALTER TYPE team_member_status ADD VALUE 'injured','redshirt'`, OR drop those two from the pickers; align spec+UI+enum. |
| HIGH | confirmed | Roster + member detail | `src/app/golf/actions/golf.ts:3006` → `src/lib/auth/ownership.ts:61-86` | `updatePlayerStatus` resolves team via `requireGolfCoach()` (org-wide `.maybeSingle()`, not cookie/staff-aware); on a 2-team (men's/women's) org `.maybeSingle()` errors → `teamId=null` → "Coach not assigned to a team". | In any 2-team program, changing a player's status from the roster always fails with a misleading error even though the roster rendered fine. | Resolve via `resolveCoachTeamIdWithCookie(...)` like `removePlayerFromTeam` already does. |
| HIGH | confirmed | Messaging | `src/components/fairway/pages/messages/MessageThreadPane.tsx:425-431` (+ legacy page.tsx:766-774) | Sent attachments are never rendered/downloadable; `getGolfMessageAttachments`/`getSignedUrlsForAttachments` are called from nowhere (grep-confirmed). Thread bubble shows only a static "Attachment" label. | A user can attach + send a file but neither party can ever view/download it — attachments are effectively lost from the UI. | Batch-fetch `golf_message_attachments` for visible messages, sign URLs, render an image/file gallery per message. |
| HIGH | confirmed | Tasks | `src/hooks/golf/use-task-realtime.ts:114-135` (+ tasks.ts — no `assigned_to` write) | Read path filters/joins `golf_tasks.assigned_to`, but create/complete write `golf_task_assignments`; `assigned_to` is never set. (Authored CRITICAL; corrected to HIGH.) | Players see an **empty Tasks tab** — no assigned task ever appears (`.eq('assigned_to', playerId)` matches nothing). | Read from `golf_task_assignments` (join `golf_tasks`); build coach `assignments[]` from it; retire `assigned_to`. |
| HIGH | confirmed | Tasks | `src/app/golf/(dashboard)/dashboard/dashboard/tasks/page.tsx:87-95` | Coach per-player `assignments[]` synthesized from a single NULL `assigned_to_name`, not from real `golf_task_assignments`. (Authored CRITICAL; corrected to HIGH.) | Coach sees every task as "0 of 0" → progress bar, per-player roster, and "View details" all suppressed; coach can't tell who completed anything. | Fetch real `golf_task_assignments` rows (player + status) per task and pass them through. |
| HIGH | confirmed | Tasks | `src/hooks/golf/use-task-realtime.ts:223-238` (+ tasks.ts:169) | Realtime subscription + refetch only watch `golf_tasks`; `completeTask` mutates `golf_task_assignments`, which fires no event. | Player marks complete; the tab doesn't reflect it (optimistic state reverts); no live update when a teammate completes. | Subscribe to `golf_task_assignments` (by task ids/team) and compute completion from assignments. |
| HIGH | confirmed | Tasks | `src/components/golf/tasks/TaskCard.tsx:35-207` | Legacy (flag-off) `TaskCard`/`TasksList` render no complete control for either role. (Corrected to MEDIUM; legacy-only.) | When the redesign flag is off, a player cannot complete a task from the Tasks tab at all. | Add a "Mark complete" action to the legacy card, or retire the legacy path. |
| HIGH | confirmed | Tasks | `src/app/golf/actions/dashboard-data.ts:774-781` (+ tasks.ts:120-167) | Player Hub "pending tasks" reads `golf_tasks.status`+`assigned_to`; completion only updates `golf_task_assignments`, never `golf_tasks.status`. | Completed tasks never leave the Hub's pending list (and never appear at all, since `assigned_to` is NULL). | Derive Hub pending tasks from `golf_task_assignments` for the player, keyed on assignment status. |
| HIGH | confirmed | Documents + Travel | `supabase/migrations/20260527000000_prod_public_baseline.sql:19043` | `golf_documents_select_team` RLS = team coach OR team player with NO `is_public` check; read actions only check team membership. (Authored CRITICAL; corrected to HIGH.) | A player who obtains a coach-only (`is_public=false`) doc id can read its metadata + a signed preview URL — coach-confidential files leak. | Add `AND (is_public=true OR is_golf_team_coach(team_id))` to a player SELECT policy and enforce `is_public` in the read actions for non-coaches. |
| HIGH | confirmed | Documents + Travel | `src/components/fairway/pages/documents/FairwayDocuments.tsx:1556-1558` | Per-card Download is `<a href={doc.file_url} download>` using a `getPublicUrl()` value, but the `documents` bucket is private → 403. Preview works (signed URL); download doesn't. | Players and coaches cannot download any document; the Download button silently fails. | Route download through a signed URL (reuse `getPreviewUrl`) instead of `doc.file_url`. |
| HIGH | confirmed | Documents + Travel | `src/app/golf/(dashboard)/dashboard/documents/documents-client.tsx:1015-1023` | Same broken `<a href={doc.file_url} download>` against the private bucket in the legacy branch (ships in bundle, active only flag-off). | Broken download in legacy doc cards. | Sign the URL, same as the Fairway fix. |
| HIGH | confirmed | Settings + Notifications | `src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:334-352` | Live Fairway settings replaced the legacy `NotificationsPanel` (which writes `users.notification_preferences`, the column delivery reads) with a Link to player-only `/settings/notifications`; no coach notification UI exists. (Authored CRITICAL; corrected to HIGH.) | Coaches cannot change ANY email/push notification preference in the live app; the only delivery-gating control is orphaned. | Render a notifications panel in the Fairway general page writing `users.notification_preferences`, or extend the v3 system to coaches AND wire it to delivery. |
| HIGH | confirmed | Team Hub (player) + Team Info | `src/app/golf/(dashboard)/dashboard/team/page.tsx:137-143` | Player "Head coach" resolved with `golf_coaches.eq('organization_id', …).maybeSingle()`; `.maybeSingle()` returns null when an org has >1 coach (live: Demo University = 2, Lynchburg = 3). (Corrected to MEDIUM.) | Every player on a multi-coach team sees "No coach assigned yet" though coaches exist (both forks). | Resolve via `golf_team_coach_staff` by `team_id` (prefer primary/head), `order+.limit(1)`. |
| HIGH | confirmed | Player Dashboard home + Hub | `src/app/golf/actions/dashboard-data.ts:774-781` | Root player dashboard derives `actionItems` from `golf_tasks.assigned_to=playerId`, which is never populated. (Corrected to MEDIUM.) | The dashboard "Today"/ActionItems card shows zero tasks even when the player has overdue work — it only appears in the Hub. | Query via `golf_task_assignments` (join `golf_tasks`), as `hub/page.tsx` already does. |
| HIGH | confirmed | Player CoachHelm | `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx:672-690` (legacy 567-583) | `onSimulate`/`getPlayerWhatIf` is only invoked by Simulate buttons inside `WhatIfPanel`; those never render (empty improvements), so the handler is dead code. (Corrected to MEDIUM.) | The What-If simulation is completely non-functional for players; `getPlayerWhatIf` is never exercised from the UI. | Fix the `improvements` wiring (above); the Simulate path then becomes live. |
| HIGH | confirmed | Classes | `src/components/golf/classes/AddClassModal.tsx:155-171` | `formData` uses a once-only lazy `useState(()=>editingClass||{…})`; the modal is mounted unconditionally with `editingClass=null` at load and vaul keeps it mounted, so the initializer captures blanks; no `useEffect` syncs `editingClass→formData`. (Corrected to CRITICAL by verifier.) | Editing a class always opens a BLANK form; saving sends empty required fields, effectively breaking edit. | Add `useEffect` syncing `editingClass→formData` on open, or remount with `key={editingClass?.id ?? 'new'}`. |
| HIGH | confirmed | Auth (login/signup/forgot/reset/demo) | `src/app/golf/(dashboard)/GolfDashboardShell.tsx:288` (FairwayDashboardShell absent) | `DemoEnterTracker` (the `?demo=1`→`demo_coach_entered` PostHog capture) is mounted only in the legacy shell; prod runs the Fairway shell. (Corrected to MEDIUM.) | Every gate-driven demo entry on prod fires no client analytics event; the demo funnel is blind. | Mount `<DemoEnterTracker/>` in `FairwayDashboardShell`, or add a server-side capture inside `enterDemo`. |
| HIGH | confirmed | Onboarding (coach + player) | `src/app/golf/(onboarding)/player/page.tsx:4-38` | `useSearchParams()` called in the default-exported client page with no `<Suspense>` boundary, unlike every sibling auth page. (Corrected to MEDIUM.) | Next.js 16 errors on static prerender / bails the route to client-only, defeating `loading.tsx`. | Split into an inner reader wrapped in `<Suspense fallback={<PageLoading/>}>`. |

---

## 4. Verification narrative

- **36** CRITICAL+HIGH findings entered verification; **34 confirmed, 2 refuted**, 0 left uncertain.
- Verification *corrected* several authored severities. Notably down-graded to **HIGH**: one of Patterns' two CRITICALs (`address-pattern`), Roster's status-enum CRITICAL, both Documents and Settings CRITICALs, and both Tasks CRITICALs. Down-graded to **MEDIUM**: several authored HIGHs (player-home tasks, player-coachhelm simulate, my-standing counterfactual, team-hub head-coach, demo tracker, onboarding Suspense, legacy task card, push default mismatch). One authored HIGH was *up-graded* to **CRITICAL** (Classes edit-form-not-prefilled).
- The genuinely schema/grant-certain CRITICALs (not needing live repro) are the Messaging IDOR RPC and the broken-wiring column failures verified via live `42703` reproduction (Patterns).

---

## 5. (reserved — see §4 above and §3 table)

---

## 6. REFUTED / DOWNGRADED (checked, knocked down)

| Severity (authored) | Unit | id | file:line | Why refuted |
|---|---|---|---|---|
| HIGH → NONE | Classes | credits-int-vs-float | `src/components/golf/classes/AddClassModal.tsx:423-431` | The `step="0.5"`/`parseFloat` credits-vs-integer-column concern did not hold up under verification (the float-into-integer-column failure path did not reproduce as a real defect on the live path). Removed from the actionable set. |
| HIGH → NONE | Onboarding (coach + player) | coach-onboarding-role-escalation | `src/app/golf/(onboarding)/coach/page.tsx:102-111` | The "a logged-in player visiting `/golf/coach` escalates to coach" claim was refuted on verification (the escalation path is not exploitable as described). The unit md still records the concern; it is not in the confirmed C/H list. |

> These remain documented in their per-unit md files so the reasoning is preserved; they are explicitly **not** carried into the action list.

---

## 7. NEEDS LIVE VERIFICATION (browser reproduction next)

The following confirmed CRITICAL/HIGH findings are flagged `needsLiveVerify=true` and should be reproduced in a running browser session. (The Messaging IDOR RPC, §3, is **not** in this list — it was confirmed directly against the live DB.)

- **Patterns** — `validate-pattern-missing-columns`, `address-pattern-missing-columns`, `resolve-pattern-coach-notes-latent` (`pattern-management.ts:450-451 / 572-580 / 638`): as a coach, click Confirm/Address on a pattern and confirm the silent revert with no error toast.
- **CoachHelm Chat** — `goal-write-no-ui-confirm` (`agent.ts:9-13,45-50,156-162`): type "create a goal for <player>" then "yes" and confirm no UI gate appears before the `golf_goals` row is written.
- **Alerts** — `urgent-filter-drops-critical` (`FairwayCoachHelmSignals.tsx:289-301`): load `/golf/dashboard/alerts` for a coach with ≥1 urgent insight; confirm it's hidden until the severity filter is cleared.
- **Development Plans** — `outcome-status-never-read` (`PlayersGridView.tsx:316-345`): record an outcome and confirm the hero stays on "Awaiting outcomes".
- **Recruiting HQ** — `upload-body-size-cap` (`recruit-documents.ts:24,126-167`): upload a 3–25 MB recruit doc and confirm it fails with no size hint.
- **Qualifiers** — `qualifier-status-dead-control` (`golf.ts:2802-2856`): confirm no UI exists to start/conclude a qualifier; "Concluded" never fills.
- **Player Dashboard home** — `dashboard-tasks-wrong-table` (`dashboard-data.ts:774-781`): assign a task to a player; confirm it's absent from the player home Today card (present only in Hub).
- **Player CoachHelm** — `whatif-improvements-empty`, `whatif-simulate-dead` (`WhatIfPanel.tsx:51`, `FairwayPlayerCoachHelm.tsx:672-690`): confirm the What-If tab is always empty and Simulate never renders.
- **My Development** — `player-write-blocked-by-rls` (`development.ts:314-321`): as a player tap Log-progress/Mark-complete; confirm success toast but no persisted change.
- **Classes** — `edit-form-not-prefilled` (`AddClassModal.tsx:155-171`): edit a class; confirm the form opens blank.
- **My Standing** — `strip-pga-omitted`, `cf-line-dropped` (`StandingStrip.tsx:103-119`, `my-standing/page.tsx:110-167`): with a women's-team player confirm a men's-PGA marker shows on Penalties/Double-bogey/Par-scoring; compare flag-off vs flag-on for the missing counterfactual line.
- **Calendar** — `restore-from-cancelled-dead` (`FairwayCalendar.tsx:864-877`): soft-cancel an event; confirm no Restore control appears.
- **Roster** — `status-enum-injured-redshirt-dead`, `status-write-ignores-team-toggle` (`golf.ts:3024 / 3006`): pick Injured/Redshirt → failure toast; on a 2-team org change a status → "not assigned to a team".
- **Messaging** — `attachments-never-rendered` (`MessageThreadPane.tsx:425-431`): send a file; confirm neither party can view/download it.
- **Tasks** — `read-write-table-split`, `coach-progress-zero-of-zero`, `complete-no-live-update`, `hub-completed-stuck-pending` (`use-task-realtime.ts:114-135 / 223-238`, `tasks/page.tsx:87-95`, `dashboard-data.ts:774-781`): coach assigns task → player sees empty tab; coach sees "0 of 0"; complete doesn't live-update; Hub keeps it pending. (`legacy-no-complete-control` is grep-certain, not live.)
- **Team Hub / Team Info** — `player-head-coach-multisingle` (`team/page.tsx:137-143`): as a player on a multi-coach team confirm "No coach assigned yet".
- **Documents** — `golf-documents-rls-leak-to-players`, `fairway-doc-download-broken-private-bucket`, `legacy-doc-download-broken-private-bucket` (`baseline.sql:19043`, `FairwayDocuments.tsx:1556`, `documents-client.tsx:1015`): player reads a coach-only doc by id; Download 403s.
- **Settings** — `v3-prefs-no-delivery-consumer`, `coach-has-no-notification-ui` (`router.ts:69`, `FairwaySettingsGeneral.tsx:334`): toggles don't gate delivery; coach has no notification panel. (`push-default-mismatch` is code-certain, not live.)
- **Auth** — `demo-tracker-not-in-fairway-shell` (`GolfDashboardShell.tsx:288`): enter via demo gate, confirm no `demo_coach_entered` event fires.
- **Onboarding** — `player-usesearchparams-no-suspense` (`player/page.tsx:4-38`): confirm the prerender/Suspense warning or client-only bail.

---

## 8. Grouped summaries

### Coach tabs

- **Coach Dashboard home** — [coach-home.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coach-home.md). Clean role-gate, honest KPIs, auth-first data fetch, paginated rounds. Redesign drops the legacy Today-timeline + Action-Items regions (data computed, never rendered) and per-KPI trend arrows/sparklines (MEDIUM×2); JoinRequest banner has no realtime (LOW). No C/H.
- **CoachHelm AI / Intelligence hub + Chat** — [coachhelm-hub.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-hub.md). Real Sonnet tool-loop agent, coach-only mount, RLS-scoped persistence. **HIGH:** `create_goal_for_player` has no UI confirm gate despite the code claiming the UI is the real safety fence.
- **Insights** — [coachhelm-insights.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-insights.md). RLS+v3-visibility scoped, paginated, optimistic with rollback. MEDIUMs: stats-vs-list scope divergence in multi-coach programs, absent error state, dead create-focus-area path. No C/H.
- **Alerts** — [coachhelm-alerts.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-alerts.md). **HIGH:** default `urgent` preset never matches mapped `critical`, hiding top alerts. MEDIUMs: unreachable bulk-action bar (no selection control), badge↔feed count mismatch.
- **Patterns** — [coachhelm-patterns.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-patterns.md). **2 CRITICAL / 1 HIGH:** Validate + Address write non-existent columns → 42703 atomic failure (live-reproduced); Resolve latent. Plus silent optimistic rollback masking the failure (MEDIUM) and read-side dead controls.
- **CoachHelm Analytics** — [coachhelm-analytics.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-analytics.md). Real rollups (daily cron), honesty thresholds, no mocks. MEDIUMs: frozen 30-day summary cards vs range-aware panels, two divergent prediction-accuracy numbers, no SSR error state. No C/H.
- **Coaching Intelligence Settings** — [coaching-settings.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coaching-settings.md). Priorities/sensitivity/thresholds/master-switch/SG-baseline genuinely take effect. MEDIUMs: 11 alert toggles, weight sliders, display prefs, and (LOW) bubble-zone are write-only dead controls; no player self-gate (infinite skeleton). No C/H.
- **Development Plans (coach)** — [development-plans.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/development-plans.md). **HIGH:** outcome-mix hero stuck on "Awaiting outcomes" (reads a non-existent/unselected field). MEDIUMs: provenance chips + per-area sparkline never render (columns not selected); `updateFocusArea` silent 0-row no-op for multi-coach.
- **Recruiting HQ** — [recruiting-hq.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/recruiting-hq.md). Strong RLS, private bucket, signed downloads, orphan rollback. **HIGH:** 2 MB Server Action body cap silently kills 2–25 MB uploads vs the advertised 25 MB. MEDIUM: async `window.open` download popup-blocked on Safari.
- **Qualifiers (create/manage)** — [qualifiers-coach.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/qualifiers-coach.md). Create/entries/leaderboard/RLS all correct. **HIGH:** `updateQualifierStatus` has no caller — qualifiers can never advance or close.
- **Team Stats** — [team-stats.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/team-stats.md). Correctly wired; prior FW/GIR/Putts bugs appear remediated. MEDIUM: un-chunked `.in(roundIds)` URL-length risk at scale. No C/H.
- **Player detail / game view (coach)** — [player-detail-coach.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-detail-coach.md). Honest sparse/awaiting states, paginated insights. MEDIUM: `/game`+`/print` use any-staffed-team access while the base page uses active-team — inconsistent scoping (not a leak). No C/H.

### Player tabs

- **Player Dashboard home + Hub** — [player-home.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-home.md). Hub reads the correct `golf_task_assignments` (the doc's dual-table bug is stale/fixed). **HIGH (→MEDIUM):** root dashboard reads tasks from never-populated `golf_tasks.assigned_to` → home shows zero tasks.
- **Player CoachHelm** — [player-coachhelm.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-coachhelm.md). Auth+pagination+honest empties all correct. **2 HIGH:** What-If panel always empty (`improvements` never returned) and the Simulate path is consequently dead. MEDIUM: `currentPrediction` never passed.
- **CoachHelm Genome + Compare** — [coachhelm-genome.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-genome.md). Ownership gate solid at app + RLS layers; honest maturity floors. MEDIUM: non-coach redirect targets a non-existent `/forbidden` route (bare 404). No C/H.
- **CoachHelm Qualifying predictions** — [coachhelm-qualifying.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/coachhelm-qualifying.md). Coach-only selection workspace; player correctly redirected; upserts non-destructive. LOW: error boundary "home" lands a coach on a player dead-end; INFO: "predictions" is a misnomer. No C/H.
- **My Development (player)** — [my-development.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/my-development.md). **CRITICAL:** Log-progress/Mark-complete blocked by missing player-self UPDATE RLS, returns `{success:true}` on 0 rows. MEDIUMs: dead sparkline, mis-targeted review source link, no legacy error state.
- **Round create / continue / recover** — [round-create.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/round-create.md). Exemplary: atomic RPCs, upsert+orphan-trim, beacon/keepalive unload save, optimistic locking. MEDIUM: `clearEmergencySave` over-removes the `_new` draft (narrow cross-draft loss). No C/H.
- **Round Review** — [round-review.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/round-review.md). Auto-gen + upsert (no delete-then-insert); 9-hole normalization sound. MEDIUMs: `teamAvg` never passed (team comparison silently dead); `golf_round_reviews` over-broad anon grant (RLS backstops). No C/H.
- **My Qualifiers (player)** — [my-qualifiers.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/my-qualifiers.md). Self-scoped, no N+1, deep-link consumed. MEDIUM: Fairway `formatDate` shows dates one day early in US timezones; LOWs: swallowed rounds error, fictional X/N denominator, hardcoded 18 holes/round. No C/H.
- **Classes** — [classes.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/classes.md). Calendar-sync server action well-built. **HIGH (→CRITICAL):** edit always opens a blank form. (The `credits` int/float HIGH was refuted.) MEDIUMs: swallowed add/edit/delete errors, edit re-sync fails on empty semester.
- **My Game Profile + My Standing** — [player-profile-self.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/player-profile-self.md). **CRITICAL:** `StandingStrip` ignores `pga_omitted` → misleading men's-PGA benchmark for women's players. **HIGH (→MEDIUM):** counterfactual line dropped in prod fork.

### Shared tabs

- **Rounds list** — [rounds-list.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/rounds-list.md). Role-scoped queries, scoped delete, no N+1. MEDIUMs: coach team-member query missing `status='active'` (ex-roster rounds linger); 50-round hard cap with no "load more". No C/H.
- **Calendar & Events** — [calendar.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/calendar.md). Hardened by the 2026-06-10 audit; stable realtime, soft-cancel, additive attendee sync. **HIGH:** Restore-event button dead (`onRestore` never passed). MEDIUMs: all-day drag → 1-hour timed; status string inconsistency; availability-polling unimplemented.
- **Roster + member detail** — [roster.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/roster.md). **CRITICAL (→HIGH):** Injured/Redshirt status options write invalid enum values. **HIGH:** `updatePlayerStatus` not cookie-aware → fails on 2-team orgs. MEDIUM: roster query shows pending/removed.
- **Messaging** — [messages.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/messages.md). **CRITICAL:** `get_golf_conversations_with_details` is SECURITY DEFINER, anon/PUBLIC-executable, trusts `p_user_id` (IDOR, live-confirmed). **HIGH:** sent attachments never rendered/downloadable. MEDIUMs: soft-delete leaks into preview/unread; unread-badge staleness.
- **Announcements** — [announcements.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/announcements.md). Staff-strict reads, upsert acks against a real UNIQUE, CASCADE deletes. MEDIUM: delete authorized only by original author (co-coaches blocked). LOWs: misleading persisted push/email flags, player assignment-fetch relies on RLS scoping. No C/H.
- **Tasks** — [tasks.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/tasks.md). The worst-wired tab: **2 CRITICAL (→HIGH) + 3 HIGH** all stemming from read-model (`golf_tasks.assigned_to`) ≠ write-model (`golf_task_assignments`). Players see an empty tab, coaches see "0 of 0", completion never reflects, Hub stays pending.
- **Team Hub (player) + Team Info** — [team-hub-and-info.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/team-hub-and-info.md). Team edits persist (UPDATE RLS present); reuses Hub queries. **HIGH (→MEDIUM):** player "Head coach" hidden on multi-coach orgs (`.maybeSingle()` on >1 row). LOWs: missing `status='active'` filters.
- **Documents + Travel** — [docs-travel.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/docs-travel.md). **CRITICAL (→HIGH):** `golf_documents` SELECT RLS leaks coach-only docs to players. **2 HIGH:** Download uses public URL on a now-private bucket (Fairway + legacy). MEDIUMs: expense-splits + event-link dormant.
- **Stats (personal)** — [stats-personal.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/stats-personal.md). Cleanest unit: full pagination, per-action `verifyPlayerAccess`, correct SG/leak-map math, no fabricated data. LOW: 9-hole normalized score vs raw to-par mismatch in Recent rounds. No C/H.
- **Course Library + What's New** — [courses-whatsnew.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/courses-whatsnew.md). Soft-delete, stage-and-swap, UPDATE RLS present (the stale "no UPDATE policy" memory is corrected). MEDIUM: Course Library is in no nav/command-palette — undiscoverable. No C/H.
- **Settings + Notifications** — [settings-core.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/settings-core.md). **2 CRITICAL (→HIGH):** the per-category notification matrix has no delivery consumer (`routeNotification` dead); coaches have no notification UI at all. **HIGH (→MEDIUM):** push defaults disagree between delivery and UI.

### Entry flows

- **Auth (login/signup/forgot/reset/demo)** — [auth-flows.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/auth-flows.md). Lockout/rate-limits, safe-path guards, server-side demo sign-in. **HIGH (→MEDIUM):** `DemoEnterTracker` not mounted in the Fairway shell → demo funnel blind on prod. MEDIUMs: forgot-password bypasses the hardened action; reset-password recovery-session unverified.
- **Onboarding (coach + player)** — [onboarding.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/onboarding.md). Auth-first, compensating rollback, player resume. **HIGH (→MEDIUM):** player page uses `useSearchParams` with no Suspense boundary. (The coach role-escalation HIGH was refuted.) MEDIUMs: uploaded onboarding avatar discarded; orphan-coach on mid-flow throw; no coach resume.
- **Join team by code** — [join-team.md](../archive/2026-06/audits/_e2e_tab_audit_2026-06-20/join-team.md). Auth-before-read, case-insensitive lookup, self-join RLS correct, exact-team auto-join. MEDIUMs: a coach clicking an invite link gets a stray player profile; login-from-invite (vs signup) drops the join code. No C/H.

---

*Report path: `/Users/ricknini/Downloads/helmv3/docs/audits/GOLFHELM_E2E_TAB_AUDIT_2026-06-20.md`. Source of truth for detail: the 36 per-unit md files in `docs/archive/2026-06/audits/_e2e_tab_audit_2026-06-20/`.*
