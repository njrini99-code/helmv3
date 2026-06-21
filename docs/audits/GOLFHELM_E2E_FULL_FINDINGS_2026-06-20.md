# GolfHelm E2E Audit — FULL Consolidated Findings (2026-06-20)
All 213 finding rows from the 36 per-unit traces, grouped severity → tab, each with file:line / issue / impact / fix. CRITICAL+HIGH were adversarially verified; 19 browser-reproducible items were live-checked on prod (coach demo + player rinin376).

## Live verification verdicts (prod, both roles)
- **1 alerts-urgent-hidden** — REPRODUCED- **2 patterns-validate** — REPRODUCED- **3 patterns-address** — REPRODUCED- **4 development-outcome-stuck** — REPRODUCED- **5 qualifiers-no-status** — REPRODUCED- **6 roster-injured/redshirt** — REPRODUCED- **7 roster-status-2team** — N/A (single-team org)- **8 settings-coach-no-notif** — REPRODUCED- **9 docs-download-403** — PARTIAL (demo fake host; preview also fails)- **10 demo-tracker-no-event** — REPRODUCED (demo gate also server-disabled)- **11 recruiting-2mb-cap** — SKIPPED (config-certain)- **12 player-context** — Demo Univ • men’s • 2 coaches- **13 whatif-empty** — REPRODUCED- **14 mydev-write-no-persist** — SKIPPED-DESTRUCTIVE (no safe control)- **15 classes-edit-blank** — N/A (player has no classes)- **16 mystanding-pga-omitted** — N/A (men’s team)- **17 player-tasks-empty** — REPRODUCED- **18 team-hub-head-coach** — REPRODUCED- **19 messaging-attachments** — SKIPPED (no existing attachment)

---
# CRITICAL (11)

## Patterns
**`pattern-management.ts:450-451`**  
- Issue: validatePattern` writes `validated_at` + `validated_by`, neither of which exists on `golf_patterns_v2` (live schema has `validation_date`, `validator_coach_id`, `validated_by_coach`). Postgres rejects the UPDATE (error 42703, verified live: `column "validated_at" ... does not exist`). The whole UPDATE fails atomically, so `lifecycle_state`/`severity`/`coach_notes` never persist either.
- Impact: Coach "Validate"/"Confirm Pattern" silently fails. Legacy path: modal closes, `router.refresh()` shows the pattern still "Detected". Live redesign path (`FairwayCoachHelmSignals.handleConfirmPattern`, line 593): optimistic flip to "confirmed" then rolls back — and no error toast (rollback at line 597 does not call `setError`), so the coach sees the action quietly undo itself. No focus area is created (createFocusArea path at line 479 never runs).
- Fix: Map to real columns: `validation_date`, `validator_coach_id`, `validated_by_coach=true`; drop `coach_notes` writes or store coach text in `resolution_notes`.
**`pattern-management.ts:572-580`**  
- Issue: markPatternAddressed` always writes `addressed_at` (line 574) and, when notes are passed, `coach_notes` (line 579) — neither column exists on `golf_patterns_v2`. UPDATE fails (42703).
- Impact: Coach "Mark as Working On" / "Address" button is dead. Legacy: no-op. Live redesign (`handleAddressPattern` → `removePatternOptimistic`): the row is optimistically removed then silently restored, with no error surfaced. Lifecycle never advances to `addressed`.
- Fix: Drop `addressed_at` (no such column; `lifecycle_state='addressed'` is the only durable marker) or add the column via migration; remove the `coach_notes` write or redirect to an existing text column.
## Documents + Travel
**`supabase/migrations/20260527000000_prod_public_baseline.sql:19043`**  
- Issue: golf_documents_select_team` RLS = `is_golf_team_coach(team_id) OR is_golf_team_player(team_id)` with NO `is_public` check. A player can SELECT every team document, incl. coach-only (`is_public=false`) rows. UI hides them (`page.tsx:95-97`) but the `getDocument`/`getDocuments`/`getPreviewUrl`/`getVersionHistory` server actions only check team membership (`documents.ts:39-80`), never `is_public`. A player who guesses/obtains a coach-only doc id can read its metadata + a signed preview URL. The recruit_documents migration (20260614020000_recruit_documents.sql:13) explicitly documents this leak as the reason recruit docs got a separate table.
- Impact: Coach-confidential team files (policies, coach-only forms) leak to players via direct id.
- Fix: Add `AND (is_public = true OR is_golf_team_coach(team_id))` to a player SELECT policy (mirror `baseball_documents_select_player`), AND have the document read actions enforce `is_public` for non-coaches.
## Messaging
**`supabase/migrations/20260527000000_prod_public_baseline.sql:2810-2811,20376 (LIVE-confirmed)`**  
- Issue: get_golf_conversations_with_details(p_user_id)` is `SECURITY DEFINER`, granted `EXECUTE` to `anon` + PUBLIC, and trusts the `p_user_id` arg instead of `auth.uid()`.
- Impact: Any unauthenticated caller with the anon key can pass ANY user's UUID and read that user's conversation list: last-message content/preview, timestamps, sender ids, unread counts, all participant user_ids, and participant **emails**. RLS on the base tables is bypassed by the definer.
- Fix: Either (a) ignore the param and use `auth.uid()` inside the function, or add `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION ...`; and `REVOKE EXECUTE ... FROM anon, PUBLIC;` leaving only `authenticated`.
## My Development (player)
**`development.ts:314-321 (also 360-367) + baseline migration 19358`**  
- Issue: The only UPDATE policy on `golf_player_focus_areas` is `golf_player_focus_areas_update_coach` (coach staffing the team). There is NO player-self UPDATE policy in any migration. `updateFocusAreaProgress`/`completeFocusArea` run on the RLS-scoped server client. A player's UPDATE matches 0 rows under RLS; Supabase returns no error on 0 affected rows, so the action returns `{success:true}`.
- Impact: Player taps "Log progress" or "Mark complete", sees a success toast, page refreshes — but current_value/status/progress_notes never change. The tab's #1 player feature is silently broken. (Coaches still work.)
- Fix: Add a player-self UPDATE policy on `golf_player_focus_areas` (`golf_players.id = player_id AND user_id = auth.uid()`), restricting writable columns if desired; OR route player writes through a SECURITY DEFINER RPC. Then verify affected-row count and fail honestly when 0.
## My Game Profile + Standing
**`src/components/fairway/charts/StandingStrip.tsx:103-109,119,174`**  
- Issue: StandingStrip` ignores `props.pga_omitted`. It always draws the reference tick (`:174`) and the reference Readout value (`:119`) from `props.pga_value`. For a women's-team player on a metric with no women's anchor, `applyGenderAnchor` returns the **men's** `pga_value` with `pga_omitted:true` (gender-anchor.ts:86-91) expecting suppression. Legacy `Card.tsx:46,88-90,196-206` correctly suppresses; the prod Fairway path does not.
- Impact: A women's player sees a misleading men's-Tour benchmark ("PGA/LPGA") on Penalties/Double-bogey-rate/Par-3/4/5 scoring as if it were her real reference — the exact contradiction the gender-anchor was built to prevent. Shown as truth.
- Fix: In StandingStrip compute `pgaPct`/refReadout conditional on `!props.pga_omitted` (mirror Card.tsx): hide the reference Tick and render "—" / hidden for the PGA Readout when omitted.
## Roster
**`src/app/golf/actions/golf.ts:3024` + `src/components/golf/roster/PlayerActionsMenu.tsx:27`, `PlayerStatusBadge.tsx:19`, `FairwayPlayerStatusBadge.tsx:57`, `FairwayPlayerActionsMenu.tsx:66`**  
- Issue: golf_team_members.status` is the Postgres enum `team_member_status = {pending,active,inactive,removed}` (baseline migration `20260527000000_prod_public_baseline.sql:216`, db types `database.ts:11884`). The UI offers `active/injured/redshirt/inactive`. Selecting **Injured** or **Redshirt** sends a value not in the enum; Postgres rejects it (`invalid input value for enum`), so `updatePlayerStatus` returns `{success:false,'Failed to update player status'}`. The action's comment claiming a CHECK constraint allows all four is stale — no migration adds those enum values.
- Impact: 2 of 4 status options are non-functional for every coach. Coach picks "Injured", gets a generic failure toast, status never changes. Core roster-management control half-broken.
- Fix: Either `ALTER TYPE team_member_status ADD VALUE 'injured'; ADD VALUE 'redshirt';` (migration) OR drop Injured/Redshirt from the four status pickers. Pick one source of truth and align spec + UI + enum.
## Settings + Notifications
**`src/lib/coachhelm/v3/notifications/router.ts:69`**  
- Issue: routeNotification` (the only consumer of `golf_player_notification_state.prefs`/`quiet_mode`) is never imported or called by any delivery path (`email.ts:802` and `push.ts:135` gate on `users.notification_preferences` instead).
- Impact: Every toggle and quiet-mode switch on the live `/settings/notifications` page is cosmetic — turning push/email off for a category does not stop those notifications; quiet mode silences nothing.
- Fix: Wire `routeNotification` into the insight/goal/round-review delivery callsites (load the player's `golf_player_notification_state` row and honor the decision), OR collapse to the single `users.notification_preferences` system.
**`src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:334-352`**  
- Issue: Live Fairway settings replaced the legacy `NotificationsPanel` (which writes `users.notification_preferences`, the column `email.ts`/`push.ts` read) with a Link to player-only `/settings/notifications`. No coach-facing notification UI exists. `updateNotificationPreferences` is unreachable in the live app.
- Impact: Coaches cannot change ANY email/push notification preference in the live app; the only control that actually gates delivery is orphaned.
- Fix: Render a notifications panel in the Fairway general page that writes `users.notification_preferences` (reuse `getNotificationPreferences`/`updateNotificationPreferences`), or make the v3 system cover coaches AND wire it to delivery.
## Tasks
**`src/hooks/golf/use-task-realtime.ts:114-135 + src/app/golf/actions/tasks.ts (no `assigned_to` write)`**  
- Issue: Read path filters/joins `golf_tasks.assigned_to`, but create/complete write `golf_task_assignments`; `assigned_to` is never set
- Impact: Players see an EMPTY Tasks tab — no assigned task ever appears (`.eq('assigned_to', playerId)` matches nothing). Core player flow broken in all paths.
- Fix: Read from `golf_task_assignments` (join `golf_tasks`) for the player list, and build the coach `assignments[]` from `golf_task_assignments` instead of `assigned_to_name`. Pick ONE model (M:N) and retire `assigned_to`.
**`src/app/golf/(dashboard)/dashboard/tasks/page.tsx:87-95`**  
- Issue: assignments[]` is synthesized from a single `assigned_to_name` (NULL for all created tasks), not from `golf_task_assignments
- Impact: Coach sees every task as "0 of 0" → progress bar + per-player roster + "View details" all suppressed (FairwayTasks.tsx:516,586,623). Coach cannot tell who completed anything.
- Fix: Fetch real `golf_task_assignments` rows (player + status) per task and pass them through.

---
# HIGH (25)

## Auth flows
**`src/app/golf/(dashboard)/GolfDashboardShell.tsx:288 / FairwayDashboardShell (absent)`**  
- Issue: DemoEnterTracker` (the `?demo=1` → `demo_coach_entered` PostHog capture) is mounted only in the legacy shell; the Fairway shell never mounts it. Prod runs the Fairway shell (redesign LIVE).
- Impact: Every gate-driven demo entry on prod fires NO client analytics event; demo funnel is blind. `enterDemo` has no server-side capture to compensate.
- Fix: Mount `<DemoEnterTracker />` in `FairwayDashboardShell` too (or add a server-side `captureServer(DEMO_ENTER_EVENT, …)` inside `enterDemo` before redirect).
## Calendar & Events
**`FairwayCalendar.tsx:864-877` + `FairwayEventEditor.tsx:419-425,571-580`**  
- Issue: "Restore event" button never renders because `onRestore` is not passed to `FairwayEventEditor`; same in legacy `PremiumCalendarClient.tsx:1112-1126` → `EventDetailModal`.
- Impact: Coaches cannot un-cancel a soft-cancelled event from the UI at all; soft-cancel becomes a one-way trip.
- Fix: Add an `onRestore` handler in `FairwayCalendar`/`PremiumCalendarClient` that calls `updateGolfEvent(id,{status:'confirmed'})` (or a dedicated restore action) and pass it through.
## Classes
**`src/components/golf/classes/AddClassModal.tsx:155-171`**  
- Issue: formData` is set via a lazy `useState(() => editingClass \
- Impact: \
- Fix: {...})` initializer that runs ONCE. The modal is mounted unconditionally by the page (page.tsx:433 & 832) with `editingClass=null` at page load, and vaul keeps the component mounted across open/close, so the initializer captures the blank default. There is NO `useEffect` syncing `editingClass`→`formData`.
**`src/components/golf/classes/AddClassModal.tsx:423-431 → page.tsx:122`**  
- Issue: Credits `<Input>` uses `step="0.5"` + `parseFloat`, allowing `3.5`, but `golf_player_classes.credits` is `integer` (golfhelm-database.md:770). The float is inserted verbatim.
- Impact: Postgres rejects a non-integer literal for an integer column → insert throws → (combined with the swallowed-error bug below) the save silently fails with no user feedback.
- Fix: Use `step="1"` + `parseInt`, OR migrate `credits` to `numeric`. Pick one consistently.
## Alerts
**`FairwayCoachHelmSignals.tsx:289-301 + page.tsx:81`**  
- Issue: Default severity filter is seeded with `['urgent','high']`, but rows' mapped `priority` uses `urgent→'critical'` (patternToInsightVocabulary.ts:101-106; InsightPriority has no 'urgent'). The client filter `!severitySet.has(r.priority)` (line 477) therefore drops every urgent insight: `severitySet={'urgent','high'}` never contains `'critical'`.
- Impact: On the live Alerts tab, the single most-severe (urgent/critical) alerts are filtered OUT by default; only `high` rows render. Coaches see a partial, lower-priority list as "Alerts". Recoverable only if the coach removes the stale 'Urgent' chip / clears severity.
- Fix: Seed the severity set with mapped tones: pass `severity:['critical','high']` from page.tsx (keep `priorities:['urgent','high']` for the DB fetch which uses the raw enum), OR normalize the preset in the mount seed via the same `urgent→critical` map.
## CoachHelm Hub + Chat
**`src/lib/coachhelm/v3/chat/agent.ts:9-13,45-50,156-162` + `src/components/golf/coachhelm/v3/Chat/*`**  
- Issue: create_goal_for_player` is the one mutating chat tool. agent.ts states the write is gated by a UI "Confirm/Edit/Cancel dialog" ("The UI is the real gate; the instructions are the soft fence"). That dialog does NOT exist anywhere in the chat UI — `ChatDrawer`, `ChatMessageList`, `ChatComposer`, `AskWorkspace`/`AskThreadPane` have no confirm step (grep for confirm/propose/dialog in the chat tree finds only the drawer's `role="dialog"`). The ONLY guard is the LLM system prompt.
- Impact: A model misfire or prompt-injected message ("yes, confirm") writes a real `golf_goals` row (assigns a goal to a player) with no human approval. The documented load-bearing safety control is absent.
- Fix: Add a real client-side confirm gate: render a Confirm/Edit/Cancel card when the agent proposes a goal and only POST the create on explicit click — OR move goal creation out of the tool-loop into an explicit coach action. Until then the comments overstate the safety.
## Patterns
**`pattern-management.ts:638`**  
- Issue: resolvePattern` writes `coach_notes` ONLY when `notes` is passed. The UI never passes notes (legacy `handleResolve` calls `resolvePattern(pattern.id)`, redesign `handleResolvePattern` calls `resolvePattern(row.id)`), so today it succeeds; but any future caller passing notes will hit the same 42703 column failure. `golf_patterns_v2` has `resolution_notes`, not `coach_notes`.
- Impact: Latent: resolve works now but breaks the moment a notes argument is wired.
- Fix: Write to `resolution_notes` instead of `coach_notes`.
## Development Plans (coach)
**`PlayersGridView.tsx:316-345 / page.tsx:60-81`**  
- Issue: RosterHealthHeader's "Did the coaching land?" outcome-mix tallies `fa.outcome_status`, but (a) the route SELECT never selects it and (b) `outcome_status` is NOT a column on `golf_player_focus_areas` — it lives only on `golf_coach_insights` (DB doc:256, written by `recordFocusAreaOutcome` development.ts:837).
- Impact: The hero "closed-loop payoff" instrument is permanently stuck on "Awaiting outcomes" no matter how many outcomes a coach records. The whole effectiveness-loop payoff of the redesign is dead on this surface.
- Fix: Surface the verdict onto each focus-area row (e.g. join the source insight's `outcome_status` via `from_insight_id`, or add an `outcome_status` column to `golf_player_focus_areas` and write it in `recordFocusAreaOutcome`), then select it in page.tsx.
## Documents + Travel
**`src/components/fairway/pages/documents/FairwayDocuments.tsx:1556-1558`**  
- Issue: The per-card Download link is `<a href={doc.file_url} download>`. `doc.file_url` is a `getPublicUrl()` value (documents.ts:207/413/791), but the `documents` storage bucket was flipped **private** in LIVE-29 (`migrations_archive/pre_20260527/20260421100004_coachhelm_storage_buckets.sql:19`). A public URL on a private bucket 403s, so Download is broken. Preview still works (it uses `getPreviewUrl`→`createSignedUrl`).
- Impact: Players & coaches cannot download any document; the Download button silently fails.
- Fix: Route download through a signed URL (reuse `getPreviewUrl`) instead of `doc.file_url`, or make the action return a signed download URL.
**`src/app/golf/(dashboard)/dashboard/documents/documents-client.tsx:1015-1023`**  
- Issue: Same broken Download in the legacy branch — `<a href={doc.file_url} download>` against the now-private bucket. (Active only when redesign flag is off, but ships in the bundle.)
- Impact: Broken download in legacy doc cards.
- Fix: Same as above — sign the URL.
## Messaging
**`src/components/fairway/pages/messages/MessageThreadPane.tsx:425-431 (+ legacy page.tsx:766-774)`**  
- Issue: Sent attachments are never rendered or downloadable. `getGolfMessageAttachments` / `getSignedUrlsForAttachments` exist but are called from NOWHERE in the UI (grep-confirmed). The thread bubble only shows a static "Attachment" text label (Fairway) or nothing (legacy).
- Impact: A user can attach + send a file, but neither sender nor recipient can ever view/download it — the attachment is effectively lost from the UI. Core advertised feature ("file attachments") is broken on the receive side.
- Fix: Render an attachment gallery per message: on thread load, batch-fetch `golf_message_attachments` for visible message ids, call `getSignedUrlsForAttachments`, and render images/files with the signed URL.
## Onboarding
**`src/app/golf/(onboarding)/player/page.tsx:4,38`**  
- Issue: useSearchParams()` called in the default-exported client page with **no `<Suspense>` boundary**, unlike every sibling auth page (login `page.tsx:270-284`, welcome `page.tsx:232-245`, signup wraps its readers in Suspense).
- Impact: Next.js 16 errors on static prerender ("useSearchParams() should be wrapped in a suspense boundary") or bails the whole route to client-only render, defeating `loading.tsx`. Repo's own convention proves the boundary is required.
- Fix: Split the component: inner uses `useSearchParams`, default export wraps it in `<Suspense fallback={<PageLoading/>}>`.
**`src/app/golf/(onboarding)/coach/page.tsx:102-111`; `onboarding.ts:88-101`**  
- Issue: The coach page only checks `golf_coaches.onboarding_completed`; it does **not** check whether the user is already a player. A logged-in player who navigates to `/golf/coach` is shown the coach wizard, and `completeCoachOnboarding` will insert a `golf_coaches` row (the `users` upsert uses `ignoreDuplicates:true` so the existing `role:'player'` is preserved, masking the change).
- Impact: Privilege escalation: `getGolfSessionProfile` resolves role by profile presence with **coach precedence** (`session.ts:164`), so the user becomes a coach with their own org+team. No middleware gate blocks this (golf routes aren't role-checked).
- Fix: Gate the coach page: if the session already has a player profile, redirect to `/golf/dashboard` (or block). Mirror on the player page.
## Player CoachHelm
**`src/components/golf/coachhelm/player/WhatIfPanel.tsx:51` + `coachhelm-data.ts:105-115`**  
- Issue: WhatIfPanel` resolves its improvement list from `profileData?.improvements`, but `getPlayerProfile`'s `PlayerProfileData` has **no `improvements` field** (only composite/categories/percentiles/baselines/playerState). `resolvedImprovements` is therefore always `[]`.
- Impact: The "What If" Deep-Dive tab **always** renders the empty state ("No improvement data yet"). The list of improvement opportunities never appears, and the per-item **Simulate** buttons never render — so the entire What-If interactive flow is unreachable on prod.
- Fix: Either have `getPlayerProfile` return an `improvements` array, or pass a real `improvements` prop to `WhatIfPanel` from a source that produces them (e.g. derive from `getPlayerWhatIf`/focus areas). Until then the tab is dead UI.
**`FairwayPlayerCoachHelm.tsx:672-690` (also legacy `PlayerCoachHelmDashboard.tsx:567-583`)`**  
- Issue: The `onSimulate` handler (which calls `getPlayerWhatIf`) is only ever invoked by the Simulate buttons inside `WhatIfPanel`. Because the improvement list is always empty (finding above), those buttons never render, so `onSimulate`/`getPlayerWhatIf` is **dead code on this surface**.
- Impact: The What-If simulation feature is completely non-functional for players; the `getPlayerWhatIf` server action is never exercised from the UI.
- Fix: Fix the `improvements` data wiring (finding above); the Simulate path then becomes live.
## Player Dashboard + Hub
**`src/app/golf/actions/dashboard-data.ts:774-781`**  
- Issue: Root player dashboard derives `actionItems` (tasks) from `golf_tasks.assigned_to = playerId`, but the live task-assignment flow (`CreateTaskModal` → `golf_task_assignments`, `tasks.ts createTask`/`createTaskFromTemplate`) never sets `golf_tasks.assigned_to` (stays NULL). No trigger syncs it.
- Impact: The player dashboard "Today" card / ActionItemsCard shows zero tasks even when the player has assigned, overdue tasks — they only appear in the Hub. Player misses overdue work on the home screen.
- Fix: Query tasks via `golf_task_assignments` (join to `golf_tasks`, status from the assignment), exactly as `hub/page.tsx:104-196` does, instead of `golf_tasks.assigned_to`.
## My Game Profile + Standing
**`src/app/golf/(dashboard)/dashboard/my-standing/page.tsx:110-167`**  
- Issue: Redesign (prod) fork renders only `StandingStrip` and omits `<CounterfactualLine>` entirely. The legacy fork (`:234-242`) renders it under every bar. `loadPlayerScoringBaseline` is still fetched (`:89-91`) but `playerBaseline` is dead in the Fairway branch.
- Impact: The W17 "strokes you'd save vs Tour" projection — a headline player-motivation feature — silently disappears for every player in prod. Also a wasted DB read each request.
- Fix: Render `CounterfactualLine` (or a Fairway equivalent) under each `StandingStrip`, passing `player_30d_scoring_avg={playerBaseline}` as the legacy path does; or remove the now-dead `loadPlayerScoringBaseline` call if intentionally dropped.
## Qualifiers (coach)
**`src/app/golf/actions/golf.ts:2802-2856` (no caller)`**  
- Issue: updateQualifierStatus` is never invoked by any component/page. No UI to transition a qualifier `upcoming → in_progress → completed`; no auto-transition on round submit.
- Impact: Coach cannot start or conclude a qualifier. "Concluded" section never fills; "Live" pill never shows; player "Play qualifier round" CTA stays enabled indefinitely. Core manage step missing.
- Fix: Add a coach status control (e.g. Start / Conclude buttons on the detail or qualifying workspace) wired to `updateQualifierStatus`, and/or auto-set `in_progress` when first round posts and `completed` past `end_date`.
## Recruiting HQ
**`src/app/golf/actions/recruit-documents.ts:24,126-167 + next.config.mjs:87-89`**  
- Issue: uploadRecruitDocument` receives the `File` as a Server Action argument, but `next.config.mjs` sets `serverActions.bodySizeLimit: '2mb'`. The action allows up to 25 MB (`MAX_FILE_BYTES`) and the bucket `file_size_limit` is also 25 MB, so any document between 2 MB and 25 MB is rejected by Next.js **before** the action runs — the action's own size check (`:133`) never executes.
- Impact: Film/transcripts/large PDFs (the headline recruiting use case) fail. The client throws on the framework error and shows the generic "Upload failed / Try again in a moment" toast (`FairwayRecruitDocuments.tsx:127`), giving no hint that the file is too big. Effectively the 25 MB cap is fiction; the real cap is ~2 MB.
- Fix: Either raise `serverActions.bodySizeLimit` to `'25mb'` (and confirm Vercel function body limits), or move uploads to a direct client-side `supabase.storage.from('recruit-documents').upload()` (RLS already gates the bucket) + a thin metadata-insert action, bypassing the Server Action body cap. Lower the client/action `MAX_FILE_BYTES` to match whatever real limit ships, and surface a clear "max N MB" message.
## Roster
**`src/app/golf/actions/golf.ts:3006` (`updatePlayerStatus`) → `src/lib/auth/ownership.ts:61-86` (`requireGolfCoach`)`**  
- Issue: updatePlayerStatus` resolves the team via `requireGolfCoach()`, which does `golf_teams.select('id').eq('organization_id',…).maybeSingle()` — NOT cookie-aware and NOT staff-strict. For a men's/women's program (org with >1 team), `.maybeSingle()` returns an error (multiple rows) → `teamId=null` → action returns "Coach not assigned to a team". The roster READ and `removePlayerFromTeam` correctly use `resolveCoachTeamIdWithCookie`, so this is the lone write that ignores the toggle.
- Impact: In any 2-team program, changing a player's status from the roster always fails with a misleading "not assigned to a team" error, even though the page rendered the roster fine. Also, in the (single-row) case it would target the org-default team, ignoring the active-team toggle.
- Fix: Change `updatePlayerStatus` to resolve team via `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)` like `removePlayerFromTeam` does, instead of `requireGolfCoach().team_id`.
## Settings + Notifications
**`src/lib/notifications/types.ts:52-53 vs src/app/actions/notification-preferences.ts:107-108`**  
- Issue: Delivery defaults `DEFAULT_NOTIFICATION_PREFERENCES` set `push_messages:true, push_events:true`, but the settings UI panel (`page.tsx:911-912`) and `getNotificationPreferences` default both to `false`.
- Impact: A user who never saved prefs sees push OFF in the UI while the delivery layer treats push as ON (masked today only because `push_subscriptions` is empty). UI is not the source of truth shown.
- Fix: Make the three default sets identical (single shared `DEFAULT_NOTIFICATION_PREFERENCES`).
## Tasks
**`src/hooks/golf/use-task-realtime.ts:223-238 + src/app/golf/actions/tasks.ts:169`**  
- Issue: Realtime subscription + refetch only watch `golf_tasks`; `completeTask` mutates `golf_task_assignments
- Impact: Player marks complete; tab does not reflect it (optimistic state reverts on next render/refetch). No live update when a teammate completes.
- Fix: Subscribe to `golf_task_assignments` (filter by task ids/team), and have `completeTask` ALSO update the parent or have reads compute completion from assignments.
**`src/components/golf/tasks/TaskCard.tsx (whole file)`**  
- Issue: Legacy (flag-off) `TaskCard`/`TasksList` render no complete control for either role
- Impact: When the redesign flag is off, a player cannot complete a task from the Tasks tab at all.
- Fix: Add a player "Mark complete" action to the legacy card (mirror FairwayTaskCard:608-619) or retire the legacy path.
**`src/app/golf/actions/dashboard-data.ts:774-781 + src/app/golf/actions/tasks.ts:120-167`**  
- Issue: Player Hub "pending tasks" reads `golf_tasks.status` + `assigned_to`; completion only updates `golf_task_assignments`, never `golf_tasks.status
- Impact: Completed tasks never leave the Hub's pending list (and tasks never appear there at all because `assigned_to` is NULL).
- Fix: Derive Hub pending tasks from `golf_task_assignments` for the player, keyed on assignment status.
## Team Hub + Team Info
**`src/app/golf/(dashboard)/dashboard/team/page.tsx:137-143`**  
- Issue: Player "Head coach" resolved with `golf_coaches.eq('organization_id', team.organization_id).maybeSingle()`. `.maybeSingle()` returns `{data:null, error}` when the org has >1 coach; the page destructures only `data` so the error is swallowed and `teamCoach` becomes `null`.
- Impact: LIVE: 2 orgs have multiple coaches (Demo University Golf = 2 coaches/7 active players incl. the demo account; the Lynchburg org = 3 coaches). Every player on a multi-coach team sees "No coach assigned yet" even though coaches exist. Affects both legacy `TeamInfoPlayer` and redesign `FairwayTeamInfo` (shared `coach` prop).
- Fix: Resolve the head coach via `golf_team_coach_staff` filtered by `team_id` (prefer `is_primary=true`/`role='head_coach'`) and order+`.limit(1)` instead of an org-wide `.maybeSingle()`.

---
# MEDIUM (59)

## Announcements
**`src/app/golf/actions/announcements.ts:738`**  
- Issue: deleteAnnouncement` authorizes only the original author (`ann.created_by !== coach.id`). On multi-coach teams (program head + assistant, or men's/women's shared head) a co-coach cannot delete a teammate's announcement even though they share the team.
- Impact: An assistant or program head cannot remove a stale/incorrect announcement posted by another staff member — they get "Not authorized to delete".
- Fix: Authorize by team-staff membership (`validateCoachTeamAccess(supabase, coach.id, ann.team_id, ...)`) instead of strict author identity, matching the staff-strict model already used in the read paths.
## Auth flows
**`src/app/golf/(auth)/forgot-password/page.tsx:28-33`**  
- Issue: Page calls `supabase.auth.resetPasswordForEmail` directly instead of the existing `requestPasswordResetAction` server action.
- Impact: Bypasses the per-email rate limit (`RATE_LIMITS.PASSWORD_RESET`) and the email-enumeration-safe generic response; raw `resetError.message` is shown to the user. `requestPasswordResetAction` is effectively dead code.
- Fix: Call `requestPasswordResetAction(email)` from the page; render its generic `message`.
**`src/app/golf/(auth)/reset-password/page.tsx:42`**  
- Issue: updateUser({ password })` is called with no explicit recovery-session establishment; the forgot-password link points straight at `/golf/reset-password` (not `/auth/callback`), and the browser client has no explicit `flowType`/`detectSessionInUrl`/`exchangeCodeForSession` handling.
- Impact: If the Supabase project is on the PKCE flow (default for `@supabase/ssr`), a `?code=` lands on the page and must be exchanged before `updateUser` has a session; if implicit auto-detect does not fire first, the reset fails with "Auth session missing". Needs live verification.
- Fix: Verify reset E2E on prod; if it fails, add an `exchangeCodeForSession` (or route the link through `/auth/callback?next=/golf/reset-password`) before allowing `updateUser`, and handle the no-session case with a clear "link expired" state.
## Calendar & Events
**`golf.ts` / `recurring-events.ts` (no `availability-polling.ts`)`**  
- Issue: Spec marks "Availability Polling ✅" but no poll action/UI exists; `golf_availability_polls`/`golf_poll_responses` are never written.
- Impact: A feature advertised as shipped is absent; coaches expecting "poll the team for a time" find only a read-only overlay.
- Fix: Either build the poll flow (action + tables + convert-to-event) or downgrade the spec from ✅ and remove the claim.
**`PremiumCalendarClient.tsx:792-823`**  
- Issue: Drag-to-reschedule of an ALL-DAY event: `start_date===end_date` after page normalization → `durationHours===0` → else branch forces `allDay:false` + a 1-hour timed window.
- Impact: Dragging an all-day event (tournament/travel day) on the legacy Week/Month grid silently converts it to a 1-hour timed event.
- Fix: Detect `draggedEvent.all_day` and preserve `allDay:true` (reschedule the date only) instead of synthesizing a timed window.
**`golf.ts:1989-2011` (no status set → DB default `'scheduled'`) vs `recurring-events.ts:473,505` (`status:'confirmed'`)`**  
- Issue: One-off events land as `'scheduled'`, recurring as `'confirmed'`; nothing sets `'completed'`. `StatusBadge.tsx:25` enumerates `draft
- Impact: confirmed
- Fix: cancelled
## Classes
**`page.tsx:129,170,197 + AddClassModal.tsx:237-241 + ClassDetailModal.tsx:53-57`**  
- Issue: handleAddClass`/`handleUpdateClass`/`handleDeleteClass` just `throw error` on failure (no toast). The modals catch the throw silently (`catch { /* UI shows original state */ }`). Only the import-confirm and delete-all paths show a toast.
- Impact: On any add/edit/delete failure (RLS rejection, transient network error, the credits type error above) the user gets NOTHING — the modal looks frozen / the save appears to do nothing. Inconsistent with the toast feedback elsewhere on the tab.
- Fix: Surface the error: have the page handlers `showToast(...)` (or return a result) so add/edit/delete failures are visible, matching `handleConfirmClasses`.
**`page.tsx:174,318,492,891 → calendar-sync.ts:169-173`**  
- Issue: Editing a class re-syncs the calendar with `semester: ''` because semester is not stored in `golf_player_classes` (page rebuilds the edit form with `semester: ''`). `parseSemesterDates('')` returns `null` → `syncClassToCalendar` returns `{success:false}`. The page `await`s but never checks `.success`.
- Impact: On every class EDIT, the calendar event series silently fails to update (the class row updates fine, but its calendar occurrences keep the old time/title). User sees stale events on the Calendar tab with no error.
- Fix: Persist `semester`/`semesterStartDate` on the class row (add columns) so edit can re-supply it, or default to `detectSemester('')` when missing before calling sync; and check the sync result and toast on failure.
## Coach Dashboard home
**`src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx:393-456`**  
- Issue: KPI `MetricCard`s are passed only `value`+`footnote`; the computed `enhancedData.sparklines.{scoringAvg,girPct,puttsPerRound}.trend` and `.sparkline` are never passed. `MetricCard` natively supports `delta` + `sparkline` (`MetricCard.tsx:83-88`).
- Impact: Coach loses the at-a-glance "improving/declining" direction + recent-form sparkline that the legacy `StatCardSparkline` showed and that the server already computes every load. Wasted compute, weaker overview.
- Fix: Pass a `delta` (derive from `trend`/`previousAverage`) and a `sparkline` node into each `MetricCard`, mirroring the legacy `StatCardSparkline` wiring.
**`src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx` (no render of `enhancedData.todayEvents` / `enhancedData.actionItems`)`**  
- Issue: The Fairway home never renders a Today's-schedule timeline or an Action-Items list. Legacy `CoachDashboard.tsx:362-371` (`TodayTimeline`) and `:458-461` (`ActionItemsCard`) render both. In Fairway, `todayEvents` + `actionItems` only collapse into the single signal headline (`coach-signal.ts:50-53`).
- Impact: A coach landing on home no longer sees today's events or the list of pending tasks/announcements/deadlines that the server fetched — only a one-line summary count. Primary "what do I do today" surface is degraded.
- Fix: Add a Today region (reuse `todayEvents`) and an Action Items region (reuse `actionItems`) to the Fairway layout; the data is already in `enhancedData`.
## Alerts
**`FairwayCoachHelmSignals.tsx:1018-1045, 628-651`**  
- Issue: Bulk-action bar (Acknowledge / Resolve / Dismiss) is unreachable: `selectedIds` is only ever set to `new Set()` (cleared) — no per-row checkbox/selection affordance exists in `renderCard`/`InsightCard` to ADD ids. `runBulk` early-returns on empty selection; the bar only shows when `selectedCount>0`.
- Impact: The bulk Acknowledge/Resolve/Dismiss controls can never be triggered from the Alerts (or Insights) surface. Coaches must triage one card at a time. (Export survives via its all-visible fallback at line 653-654.)
- Fix: Wire a selection control on each card (checkbox prop on `InsightCard`, or a row long-press/select-mode) that calls `setSelectedIds`; or remove the dead bulk-bar wiring until selection ships.
**`FairwayCoachHelmSignals.tsx:181-186, 720-734 + page.tsx:81`**  
- Issue: Toolbar `SEVERITY_OPTIONS` only offers critical/high/medium/low, but the seeded applied-chip renders label 'Urgent' (capitalized raw value, line 725). The severity MENU shows 'Critical' as unselected while an 'Urgent' chip shows as applied — and the badge `signalCount` counts urgent+high while the feed (per the HIGH bug) shows only high.
- Impact: Confusing/inconsistent severity UI; badge count won't match the visible feed; the 'Urgent' chip maps to no menu option.
- Fix: Same fix as the HIGH finding (normalize urgent→critical end-to-end) resolves the chip label, the badge↔feed mismatch, and menu consistency.
## CoachHelm Analytics
**`coachhelm-analytics.ts:626-627,734-741`**  
- Issue: getCoachHelmOverview` hardcodes a 30-day window and does not accept a `dateRange`. In the legacy dashboard `handleDateRangeChange` never re-calls it (CoachHelmAnalyticsDashboard.tsx:119-128), so the summary cards (Total Insights / Action Rate / Improvement Rate / Prediction Accuracy / Strokes Saved) stay frozen at the 30d SSR snapshot while the panels below them update to the selected range.
- Impact: Coach selects "7 days" / "90 days" and the headline KPIs silently keep showing 30-day numbers — the cards contradict the panels on the same screen.
- Fix: Accept `dateRange` in `getCoachHelmOverview` and re-call it from both `handleDateRangeChange` paths; or label the summary cards explicitly as "last 30 days".
**`AnalyticsSummaryCards.tsx:80 vs FairwayEffectiveness.tsx:386,419`**  
- Issue: Two different "Prediction Accuracy" numbers from two sources on the same feature. Overview card uses `overview.predictionAccuracy` = raw `golf_predictions.was_accurate` averaged over the last 30d (coachhelm-analytics.ts:729-741). The redesign cockpit's hero uses `performance.summary.overallAccuracy` = mean of `accuracy_rate` across `golf_prediction_model_performance` rollup snapshots (coachhelm-analytics.ts:425). These two computations can disagree for the same team/window.
- Impact: "Is CoachHelm helping" headline accuracy can differ between the overview readout and the cockpit gauge, undermining trust in the number.
- Fix: Pick one source of truth for prediction accuracy (prefer the rollup `overallAccuracy`) and have `getCoachHelmOverview` derive `predictionAccuracy` from the same path, or drop the duplicate.
**`page.tsx:78-83,99-102,117-120`**  
- Issue: SSR loaders that return `{success:false, error}` are unwrapped with `result.data` (undefined). The page never inspects `.success`, so a server-side query failure renders the empty/"no signal" state instead of an error. The redesign component only sets `loadError` on the client re-fetch path (FairwayEffectiveness.tsx:195-201), not on the initial SSR data.
- Impact: A real DB/RLS failure on first load looks identical to "no data yet" — a coach sees a falsely-empty dashboard and has no signal that something broke or a Refresh would help.
- Fix: On SSR, capture per-loader `success` and pass an `initialError` into the component so the first paint can show the existing `InlineNotice` (redesign) / error treatment.
## Genome + Compare
**`src/app/golf/(dashboard)/dashboard/coachhelm/genome/[playerId]/page.tsx:54`**  
- Issue: Non-coach gate redirects to `/golf/dashboard/coachhelm/genome/${playerId}/forbidden`, a route segment that does not exist (no `forbidden/` dir under `[playerId]`, no golf `not-found.tsx`, no middleware rewrite).
- Impact: A player who navigates/bookmarks a coach genome URL is correctly denied, but lands on a bare Next.js 404 instead of a clean forbidden/redirect-to-dashboard. Access is NOT bypassed (security holds); only the denial UX is broken. The sibling compare page does this correctly (`redirect('/golf/dashboard')`).
- Fix: Redirect to an existing destination, e.g. `redirect('/golf/dashboard')` or `/golf/dashboard/hub`, matching the compare page.
## CoachHelm Hub + Chat
**`src/app/golf/(dashboard)/dashboard/coachhelm/chat/ChatHistoryClient.tsx:42-78`**  
- Issue: Legacy (flag-off) chat history client `fetch`es `/conversations/[id]` and `/chat/send`; the send/load wiring exists but the surrounding rail has only an empty state ("No conversations yet"), no visible error UI for a failed send/load on this legacy page (the drawer + AskWorkspace handle errors; this fallback does not surface them as clearly).
- Impact: On the legacy path a failed send/load is silent to the coach. Low blast radius since redesign-on is the live path.
- Fix: Surface a fetch/send error banner on `ChatHistoryClient` to match the drawer/AskWorkspace.
## Insights
**`insight-management.ts:704-710 vs insight-delivery.ts:508-531`**  
- Issue: StatCards/hero count via `getInsightsStats` filter by `.eq('coach_id', coachId)`, but the list (`getInsightsForCoach`, no player_id) is scoped only by RLS, which (policy `coach_insights_select_via_player_team`, baseline.sql:18551) returns insights for ANY player on a staffed team regardless of which coach generated them. In a multi-coach program the StatCards undercount what the list shows; team-wide rows (`player_id IS NULL`) created by another coach appear in the list but not the stats.
- Impact: Coach sees e.g. "12 Total Insights" while the feed lists 20 — numbers contradict the same screen.
- Fix: Make stats use the SAME scope as the list: derive counts from the RLS-scoped read (or aggregate `getInsightsForCoach` results) instead of `.eq('coach_id', coachId)`.
**`InsightsPageContent.tsx:341-358`**  
- Issue: fetchInsights` has no error branch; `getInsightsForCoach` returns `[]` on any failure (insight-delivery.ts:552-558). A failed/timed-out read renders the generic "No insights found" empty state. `fetchStats` (L360-365) also silently no-ops.
- Impact: A backend error looks identical to an empty team; coach has no signal that data failed to load and no retry affordance beyond the manual refresh.
- Fix: Surface a distinct error state (toast or inline banner) when the read throws/returns an error; have `getInsightsForCoach` return a discriminated result or set an error flag.
**`insight-card/InsightCard.tsx:744-775 + InsightsPageContent.tsx:539-552`**  
- Issue: The coach per-row "Create focus area" button uses `PromoteToFocusAreaButton` (its own drawer → `createFocusAreaFromInsightV2`) for ALL active insights (`promotable` true unless resolved). The parent `onAction('create_focus_area')` path (→ `createFocusAreaFromInsight` + redirect to `/development`) only fires for resolved insights, where it renders a *second* "Create focus area" button. So the parent handler + its redirect-to-development behavior is effectively unreachable for normal (active) insights, and the two code paths use two different server actions.
- Impact: Not user-visible breakage today (the promote drawer works), but the `handleCoachAction` create_focus_area branch is dead code for the common case and the post-create UX diverges (drawer + `router.refresh()` vs redirect to /development). Maintenance hazard / inconsistent flow.
- Fix: Pick one promotion path. Either route the promote button through `onAction`, or delete the unreachable `create_focus_area` branch + its redirect in `handleCoachAction`.
## Patterns
**`FairwayCoachHelmSignals.tsx:597`, `:573-578`**  
- Issue: The optimistic rollback for pattern mutations (`handleConfirmPattern` line 597 and `removePatternOptimistic` lines 573-578) restores prior state on `!success`/throw but never calls `setError(...)`. Combined with the two CRITICALs above, Confirm and Address fail completely silently — the UI animates the change then reverts with zero feedback.
- Impact: Coach cannot tell the action failed; looks like a flaky UI. Masks the underlying column bug from anyone testing the live app.
- Fix: On `!res.success` (and in the catch), set an InlineNotice error ("Couldn't update the pattern — try again"), as the insight-side bulk handlers already do.
**`pattern-management.ts:206-214` + `PatternCard.tsx:430-440,503-505`**  
- Issue: transformPatternRow` maps `coachNotes`/`validatedAt`/`addressedAt` from DB columns that don't exist, so they are always `undefined`. The "Coach Notes" panel (`PatternCard.tsx:431`) and the "Validated:" timestamp (`PatternCard.tsx:503`) can therefore never render, even after a (hypothetically fixed) validate — and the validate modal's notes textarea (`PatternValidationModal.tsx:247`) captures text that is dropped on write and never read back.
- Impact: Coach-entered validation notes are write-discarded and never displayed; two UI affordances are permanently dead.
- Fix: After fixing the write columns, also map the read side: `validatedAt ← validation_date`, notes ← `resolution_notes` (or add a dedicated `coach_notes` column).
## Coaching Intelligence Settings
**`coaching-intelligence/page.tsx:42-93`, Fairway `:86-110`**  
- Issue: Coach-only page has no self-gate. A player (or any user without a `golf_coaches` row) who deep-links/bookmarks the route is not redirected; `coachId` resolves to null, `useCoachPhilosophy` returns `loading=false`+`philosophy=null`, and the page is stuck on the loading skeleton forever. No data leak (RLS protects the table) but the route is reachable and never renders content/empty/error. Inconsistent with the sibling `notifications/page.tsx:23-45` which role-gates gracefully.
- Impact: Player hitting the URL sees an infinite shimmer skeleton with no way forward.
- Fix: Add a server-side gate (convert to a thin server wrapper or check `getGolfSessionProfile().coach` and `redirect('/golf/dashboard/settings')` for non-coaches), or render a "coach-only" notice like the notifications page does.
**`AlertTypeToggles.tsx` + `insights.ts:288-297`**  
- Issue: The 11 "Active Alerts" toggles persist to `golf_coach_philosophy.alert_*` but are never read to suppress alert emission. The engine loads them into the philosophy object then ignores them; no code path checks `philosophy.alertScoringDecline` etc. before generating that alert type.
- Impact: Coach disables e.g. "Plateau" or "Par 3 issues" alerts; they keep appearing. The control silently does nothing.
- Fix: Gate each alert-type generation on its toggle in the insight/alert generation path (insights.ts + orchestrator alert composition), or remove the toggles until wired.
**`WeightDistributor.tsx` + `insights.ts:283-287`**  
- Issue: The 5 "Comparison Weighting" sliders persist `weight_*` but have zero consumers in `src/` (no `philosophy.weightHistorical` read anywhere). Roster-comparison weighting described in the doc is not implemented.
- Impact: Coach tunes weights for roster decisions; nothing changes anywhere.
- Fix: Wire the weights into the comparison/ranking logic, or hide the section until consumed.
**`page.tsx:429-463` / Fairway `:388-439`, hook map `:78-81`**  
- Issue: Display Preferences (`Show Strokes Gained`, `Show advanced statistics`, `Insight Detail Level`) persist but are not consumed by any render component, and `insight_verbosity` is ignored by the NLG layer (orchestrator hardcodes `verbosity` at `orchestrator.ts:704,738,902`).
- Impact: Toggling these has no observable effect on dashboards/reports/insight length.
- Fix: Read `showStrokesGained`/`showAdvancedStats` in the stat/dashboard render gates and pass `insightVerbosity` into the NLG `verbosity` instead of the hardcoded value.
## Course Library + What’s New
**`src/app/golf/(dashboard)/FairwayDashboardShell.tsx:95-159`**  
- Issue: The Course Library route `/golf/dashboard/courses` is in NEITHER the coach nor player nav section built by `buildNavSections`, and has NO entry in `CommandPalette.tsx` either. It is only reachable by typing the URL or via the in-round tee/course picker.
- Impact: A primary feature (manage courses, tees, photos, team-saved library) is effectively undiscoverable from the app chrome for both roles.
- Fix: Add a "Courses" nav item (both roles) and/or a CommandPalette quick action pointing at `/golf/dashboard/courses`.
## Development Plans (coach)
**`FocusAreaCard.tsx:223-268 / page.tsx:60-81`**  
- Issue: SourceChip` renders a real `<Link>` "From a round review" / "From a CoachHelm insight" only when `from_review_id`/`from_insight_id` is present, but the route SELECT omits both columns (and `review_context`).
- Impact: Provenance chips never render even for focus areas created from a review/insight (which DO populate those columns). A built, real cross-feature link is silently invisible.
- Fix: Add `from_review_id, from_insight_id, review_context` to the page.tsx:63-78 select; the card already wires the links and "use my-development#insight-" anchor.
**`FocusAreaCard.tsx:99-105,140-145 / page.tsx:60-81`**  
- Issue: The per-area Sparkline consumes `progressHistory` (from `golf_player_focus_areas.progress_notes.entries[]`), but the route never selects `progress_notes` and never maps it into `progressHistory`.
- Impact: Every focus-area card shows the honest em-dash sparkline; the logged progress history (written by `updateFocusAreaProgress`, development.ts:300-312) is never visualized on the coach surface.
- Fix: Select `progress_notes` in page.tsx and map `progress_notes.entries` → `progressHistory` in `focusAreasWithPlayers` (page.tsx:164-167).
**`development.ts:177-194`**  
- Issue: updateFocusArea` filters the UPDATE by `.eq('coach_id', coach.id)`. A Supabase UPDATE matching 0 rows returns `error: null`, so the action returns `{ success: true }` even when nothing changed. Focus areas created via `createFocusAreaFromReview`/`createFocusAreaFromInsightV2` set `coach_id` to "any one coach who staffs the team" (development.ts:447,517) or null; an assistant/second coach (or any coach editing a null-coach_id row) silently no-ops.
- Impact: Editing or (legacy fork) marking complete a focus area not created by the exact logged-in coach shows a success toast + router.refresh() but the row is unchanged — confusing silent data-write failure for multi-coach programs.
- Fix: Verify the row's player via `verifyPlayerAccess` (like `completeFocusArea` already does) instead of the brittle `coach_id` self-filter; or return an error when 0 rows are affected (use `.select()` and check length).
## Documents + Travel
**`src/app/golf/actions/travel.ts:1-966`**  
- Issue: golf_travel_expense_splits` (per-player split table) is in the schema and referenced by the feature doc, but there is no split CRUD, no split calc, and no UI consuming it anywhere in travel actions/components. `paid_by:'split'` is selectable but never produces split rows.
- Impact: Coaches can mark an expense "Split" but no per-player amounts are ever created/shown — the split feature is a dead end.
- Fix: Implement split create/list against `golf_travel_expense_splits`, or remove the 'split' paid_by option until built.
**`src/components/fairway/pages/travel/FairwayItineraryModal.tsx:37-104`**  
- Issue: golf_travel_itineraries.event_id` (link to `golf_events`) exists and `createGolfTravelItinerary` accepts it (travel.ts:28,164), but the create/edit modal has no event picker, so `event_id` is always null. The documented "Links to golf_events via event_id" flow never fires from the UI.
- Impact: Travel trips are never associated with calendar events; cross-feature linkage is dormant.
- Fix: Add an optional "Link to event" select (team's upcoming `golf_events`) to the itinerary modal and pass `event_id`.
## Join team
**`src/app/golf/join/[code]/page.tsx:32-37 + src/app/golf/(onboarding)/player/page.tsx:86`**  
- Issue: A logged-in **coach** (has `golf_coaches`, no `golf_players`) who opens a `/golf/join/<code>` link is treated as a not-onboarded player and force-redirected to `/golf/player` onboarding, where `ensurePlayerRecord()` creates a `golf_players` row for them. The join route has no coach branch.
- Impact: Coaches who click their own invite link get a stray player profile and the player-onboarding wizard instead of a "you're a coach" message.
- Fix: In `page.tsx`, before the player-onboarding redirect, check for a `golf_coaches` row by `user_id` and render an explanatory state (or redirect to `/golf/dashboard`) instead of `/golf/player?joinCode=`.
**`src/components/auth/golf-sign-in-form.tsx:95-110`**  
- Issue: Invite via **login** (not signup): when an existing-but-not-onboarded user logs in at `/golf/login?returnTo=/golf/join/<code>`, `needsOnboarding` is true so `storedReturnTo` is discarded and they go to bare `/golf/player` / `/golf/coach` with **no `?joinCode=`** appended. The comment claims "the join page will redirect to onboarding with the joinCode anyway," but the user is sent straight to onboarding, not the join page, so the code is lost.
- Impact: A player who logs in (instead of signing up) from an invite link before completing onboarding never auto-joins; they land on the dashboard with no team and must re-enter the code manually.
- Fix: When `needsOnboarding` and `storedReturnTo` matches `/golf/join/<code>`, redirect to `/golf/player?joinCode=<code>` (append the extracted code) instead of dropping it.
## Messaging
**`src/hooks/golf/use-golf-messages.ts:91-97 vs supabase baseline:2822-2841`**  
- Issue: The thread fetch filters `is_deleted=false`, but the RPC's `last_message_*` preview and `unread_count` subqueries do NOT filter `is_deleted`. A soft-deleted message can drive the rail's last-message preview (shows blank/"No messages yet") and a soft-deleted unread message still increments the unread badge.
- Impact: Rail preview + unread badge can disagree with the open thread after a delete. Currently latent: live DB has 0 soft-deleted rows, so no user is affected yet — but it will surface the first time anyone deletes a message.
- Fix: Add `AND m.is_deleted = FALSE` to the three `last_message_*` subqueries and to the `unread_count` subquery in the RPC.
**`src/app/actions/messages.ts:337-344 + supabase baseline:2836-2841`**  
- Issue: "Mark as read" sets `golf_messages.read=true` only for messages where `sender_id != me`, and `unread_count` is computed from `read=FALSE`. But the rail's realtime refetch is keyed on `golf_conversation_participants`/`golf_conversations` changes, NOT on the `golf_messages` UPDATE that `markMessagesAsRead` performs. Opening a thread updates `last_read_at` (a participant row) which DOES trigger a refetch — so it mostly works — but if a read happens without a participant-row write the badge can lag.
- Impact: Unread badge in the rail can occasionally be stale relative to the opened thread until the next participant/conversation event.
- Fix: Either subscribe the conversations hook to `golf_messages` UPDATE for the user's conversations, or have `markMessagesAsRead` always touch `last_read_at` (it does) — verify the badge clears on open in live testing.
## My Development (player)
**`FairwayMyDevelopment.tsx:430-441 + page.tsx:87-106 + FocusAreaCard.tsx:475-482`**  
- Issue: The page select never fetches `progress_notes`, and neither `page.tsx` nor `FairwayMyDevelopment` ever sets `progressHistory` on the `FocusAreaCardData` passed to `FocusAreaCard`. So `series` is always empty, `hasTrend` is always false.
- Impact: The advertised "honest per-area Sparkline + TrendChip" (redesign headline feature) always renders an em-dash and the TrendChip never appears, even for areas with logged history. The trend is permanently dead, not honestly-thin.
- Fix: Select `progress_notes` in page.tsx, map `progress_notes.entries[]` → `progressHistory` on each `FocusAreaCardData`, and pass it through in both the active and completed maps.
**`FocusAreaCard.tsx:236-238`**  
- Issue: SourceChip` builds the "From a round review" href as `/golf/dashboard/rounds/${reviewId}/review` using `focusArea.from_review_id`. But `from_review_id` is a `golf_round_reviews.id` (review id), while the review route param `[id]` is a ROUND id — the review page loads `golf_rounds.eq('id', roundId)` (review/page.tsx:175, 262-264). Passing a review id as a round id queries a non-existent round.
- Impact: Clicking the review source chip lands on a not-found / failed round-review page instead of the originating review. (Redesign branch only; legacy renders a plain non-link span.)
- Fix: Resolve the round id from the review (join `golf_round_reviews.round_id`) and link `/rounds/${round_id}/review`, or carry the round id onto the focus area at creation time.
**`page.tsx:108-109, 233 (legacy branch)`**  
- Issue: The select error `focusAreasError` is only consumed in the redesign fork (`loadError` → `InlineNotice`). In the legacy (flag-OFF) branch the page derives `activeAreas`/`completedAreas` from `focusAreas
- Fix: []` and renders the "No Development Plans Yet" empty state when the select fails.
## My Qualifiers (player)
**`src/components/fairway/pages/my-qualifiers/FairwayMyQualifiers.tsx:70-72`**  
- Issue: formatDate` uses `new Date(dateStr)` on a `date`-typed `start_date`/`end_date` (`'YYYY-MM-DD'`). Date-only strings parse as UTC midnight; `toLocaleDateString` in a US (negative-offset) timezone renders the **previous calendar day**. The legacy client avoids this by string-splitting (`my-qualifiers-client.tsx:37-45`).
- Impact: On the live (redesign-on) path, qualifier start/end dates can display one day early for most US users.
- Fix: Parse as local: split `YYYY-MM-DD` and build `new Date(y, m-1, d)`, or reuse the legacy string-split formatter.
## Onboarding
**`coach/page.tsx:414-419`, `player/page.tsx:376-381`**  
- Issue: AvatarUpload` uploads the image to Storage and returns a public URL via `onUploadComplete` → stored in `avatarUrl` state, but `avatarUrl` is **never passed** to `completeCoachOnboarding` / `completePlayerOnboarding`, and neither action writes the `avatar_url` column.
- Impact: The avatar a user uploads during onboarding is silently discarded (orphaned in the `avatars` bucket); profile shows initials. `golf_coaches.avatar_url` (db doc:327) and `golf_players.avatar_url` (db doc:946) both exist and are unused here.
- Fix: Pass `avatarUrl` into both actions and write `avatar_url`.
**`onboarding.ts:62-63, 231-243`**  
- Issue: The outer `catch` cleanup tracks `createdOrgId` and `createdTeamId` but **not** the created coach id. An unexpected throw after the `golf_coaches` insert (line 157) — outside the explicit `coachError`/`teamError` handlers — deletes the org/team but leaves an **orphan `golf_coaches` row** with `onboarding_completed:true` pointing at a deleted org.
- Impact: Broken account state: user logs in, resolves as a coach (coach precedence) with no team and a dangling `organization_id`; dashboard renders against missing org. Narrow trigger window but real data-integrity gap.
- Fix: Track `createdCoachId` and delete it in the outer catch (reverse order: team → coach → org).
**`coach/page.tsx:42, 127-135`**  
- Issue: Coach wizard step is local `useState` and **no intermediate data is persisted** until the final submit; reload resets to step 1 with all program/profile fields blank. The player wizard, by contrast, persists via `ensurePlayerRecord` + prefills on reload.
- Impact: A coach who fills step 1, navigates away, or refreshes loses all entered program data — inconsistent with the player resume experience and with "back/resume" expectations.
- Fix: Persist a draft (e.g. an early `golf_coaches`/`organizations` stub or localStorage) and prefill on reload, mirroring `ensurePlayerRecord`.
## Player CoachHelm
**`WhatIfPanel.tsx:49-50,112` + `FairwayPlayerCoachHelm.tsx:677`**  
- Issue: currentPrediction` is read from `profileData?.currentPrediction`, a field `getPlayerProfile` never returns, and the parent passes no `currentPrediction` prop. So `hasPrediction` is always `false` ("Predicted: --") and `onSimulate`'s `baseline = profileData?.currentPrediction ?? 0` is always `0` — projected score = raw delta, not an actual scoring number.
- Impact: Even if improvements were fixed, the "Predicted" readout would stay "--" and the simulated "projected score" would be a bare delta mislabeled as a score.
- Fix: Source `currentPrediction` from `data.prediction.predictedValue` (already fetched on the page) and pass it into `WhatIfPanel` as a prop, and use it as the simulation baseline.
## Player detail (coach)
**`game/page.tsx:45` vs `players/[playerId]/page.tsx:131-143`**  
- Issue: The base `/players/[id]` page scopes to the coach's *active* team (cookie-resolved) and `notFound()`s if the player isn't on it; `/game` + `/print` use `verifyPlayerAccess` (ANY staffed team). A multi-team head coach toggled to team A can open `/game` for a team-B player but gets `notFound()` on the base page.
- Impact: Inconsistent scoping across two views of the same player; not a security leak (coach genuinely staffs the team) but a confusing divergence and a bypass of the active-team toggle on the game/print routes.
- Fix: Make all three routes use the same access model. Either gate `/game`+`/print` to the active team (cookie-resolved) like the base page, or relax the base page to `verifyPlayerAccess`. Pick one.
## Recruiting HQ
**`src/components/fairway/pages/recruiting/FairwayRecruitDocuments.tsx:138-141 (also legacy src/components/golf/recruiting/RecruitDocuments.tsx:138-141)`**  
- Issue: handleDownload` awaits `getRecruitDocumentUrl(doc.id)` and then calls `openExternalUrl(res.data.url)` → `window.open(url, '_blank')` (capacitor.ts:50). The `window.open` happens after an async gap, so it is no longer inside the user-gesture context — Safari (and strict popup blockers) will block the new tab.
- Impact: On web Safari, "Open" on a recruit document can silently fail to open the file (popup blocked); no error toast fires because the action succeeded. Native iOS is fine (Browser.open).
- Fix: Open a blank tab synchronously on click (`const w = window.open('', '_blank')`), then set `w.location = url` once the signed URL resolves; or render an `<a download href>` after fetching; keep the Capacitor `Browser.open` path for native.
## Roster
**`src/app/golf/(dashboard)/dashboard/roster/page.tsx:230`**  
- Issue: Coach roster query filters `golf_team_members` by `team_id` only — no `status` filter. Rows with status `pending` or `removed` are rendered as full roster cards (and counted in the header "N players"). `acceptJoinRequest` inserts `active`, but a removed player re-added, or any direct `pending`/`removed` row, would surface.
- Impact: Roster can show players who are pending/removed as if active; player count is inflated; "active" count math (`status==='active' \
- Fix: \
## Round create/continue/recover
**`src/lib/utils/emergency-save.ts:128-137`**  
- Issue: clearEmergencySave(roundId)` unconditionally `removeItem`s the `_new` key in addition to the round-specific key.
- Impact: Saving/submitting an already-server-backed round (id present) wipes a *separate* unsaved fresh-round draft stored under `_new`. Narrow but real cross-draft data-loss path.
- Fix: Only remove `_new` when `roundId` is null/undefined; when a specific roundId is cleared, leave `_new` intact.
## Round Review
**`review/page.tsx:346`**  
- Issue: getStatAverages(round.player_id)` is called with no `teamId`; the action's `teamAvg` branch (round-review-system.ts:1655) only runs when `teamId` is passed, so `teamAvg` is always null. `RoundStatsComparison teamAvg` (page:744) never gets data.
- Impact: Players never see the team-average comparison the spec promises and the component renders for. The "vs team" comparison is silently dead.
- Fix: Resolve the player's active team (e.g. via `golf_team_members`) and pass it: `getStatAverages(round.player_id, teamId)`, or remove the `teamAvg` prop wiring if intentionally deferred.
**`supabase/migrations/20260527000000_prod_public_baseline.sql:21910`**  
- Issue: GRANT ALL ON TABLE public.golf_round_reviews TO anon;` with no later REVOKE (unlike `golf_coach_insights`, relocked in 20260528011000).
- Impact: Over-broad grant to the `anon` role on a private table. RLS policies are all `authenticated`-scoped so anon rows are still blocked at the row layer (RLS is the backstop), but this violates defense-in-depth and is exactly the over-broad-anon-grant class the project rules flag.
- Fix: REVOKE ALL ON TABLE public.golf_round_reviews FROM anon;` in a new migration; verify ACL via `pg_class.relacl`.
## Rounds list
**`page.tsx:98-102`**  
- Issue: Coach team-member query has **no `status` filter** (`golf_team_members.select('player_id').eq('team_id', teamId)`), unlike every other coach surface (dashboard-data.ts:282, insights.ts:621, player-profile-stats.ts:78/323 all `.eq('status','active')`).
- Impact: A graduated/transferred/inactive/redshirt/medical player's completed rounds keep appearing in the coach's team Rounds library, while that same player's profile is access-denied to the coach (player-profile-stats is active-only) — inconsistent roster scoping.
- Fix: Add `.eq('status','active')` to the team-member query to match the established active-roster convention.
**`page.tsx:111-117 (coach), page.tsx:130-137 (player)`**  
- Issue: Completed-rounds query hard-caps at `.limit(50)` with no "load more"/range pagination. Coach teams with >50 completed rounds (easily exceeded by a full roster over a season) silently lose access to older rounds from this tab.
- Impact: Older team rounds are unreachable from the Rounds list; coach stat strip + period groups only ever reflect the most-recent 50. The Fairway header is honest about it ("showing most recent 50") but offers no way to page further.
- Fix: Add range-based pagination (`.order('round_date').range()`) or a "load more" control; or scope the cap per-player for the coach view.
## Settings + Notifications
**`src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx (no DistanceUnitsPanel)`**  
- Issue: The legacy page exposes a Distance Units (yards/meters) panel (`page.tsx:362-371`); the live Fairway page omits it entirely. `useDistanceUnits` still drives display across the app.
- Impact: Players on the live app cannot switch to meters; the preference is reachable only if it was set before the redesign.
- Fix: Add a Distance Units `SectionCard` to `FairwaySettingsGeneral` reusing `useDistanceUnits`.
**`src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:170-242`**  
- Issue: loadProfile()` has no try/catch and no error branch; if the player `golf_players`/`golf_teams` fetch fails, `setProfile` is never called and the page stays on the skeleton forever (`:278`).
- Impact: Transient query failure leaves the entire settings page stuck on loading skeleton with no retry or message.
- Fix: Wrap in try/catch; on failure set an error state with a retry, or render a minimal profile from context.
**`src/components/golf/CommandPalette.tsx:106`**  
- Issue: Command palette surfaces "Notification Preferences" → `/golf/dashboard/settings/notifications` to all users including coaches; coaches land on the player-only "not available" card.
- Impact: Coaches get a dead-end navigation target from the command palette.
- Fix: Hide the entry for coaches, or point coaches at a working notifications panel.
## Tasks
**`vercel.json:36-86 (no task-reminder cron) + src/app/golf/actions/task-reminders.ts:257 `processReminders`**  
- Issue: setTaskReminder` sets `golf_tasks.reminder_at`, but no scheduler ever calls `processReminders`/`getDueReminders`; `golf_task_reminders` is never populated by the UI (no inserts found)
- Impact: Reminders set in the create modal never fire. This is the spec's open Known Gap.
- Fix: Add a Vercel cron (or Inngest fn) invoking `processReminders`; and write `golf_task_reminders` rows (or read `golf_tasks.reminder_at` directly).
**`src/app/golf/actions/task-reminders.ts:48`**  
- Issue: setTaskReminder` selects `created_by` from `golf_tasks`, but the table has no `created_by` (it is `assigned_by`)
- Impact: This action errors on the column; it would always return "Task not found"/failure if invoked. Currently latent (file is unimported dead code).
- Fix: Change `created_by` → `assigned_by`. (And note the Fairway modal uses the correct `setTaskReminder` from `tasks.ts`, not this one.)
**`src/app/golf/actions/task-reminders.ts:182-183, 400-401`**  
- Issue: Embedded joins `users!assigned_to` / `users!created_by` / `users!assigned_by` assume `golf_tasks.assigned_to` references `users.id`, but it references `golf_players.id` (and `created_by` does not exist)
- Impact: Reminder emails/in-app notifications would target the wrong/empty user; latent because unscheduled.
- Fix: Resolve recipient `user_id` via `golf_players.user_id` (assignee) and `golf_coaches.user_id` (creator), not direct `users` FK.
## Team Stats
**`page.tsx:159-167`**  
- Issue: golf_holes` query passes the **entire** `roundIds` array into a single `.in('round_id', roundIds)` on every paginated page. The *response* is paginated, but the *filter list* is not chunked. For a large multi-season roster (>~1000 completed rounds) the round-id list is serialized into the request URL (~40 chars/UUID), which can exceed PostgREST/proxy URL length limits and 414/silently drop.
- Impact: A program with a deep historical roster could get a failed or truncated holes fetch → wrong/empty FW%/GIR%/Putts for the whole team. Edge-case (demo rosters are far under the limit) but real at scale.
- Fix: Chunk `roundIds` into batches (e.g. 300) and merge results, or filter holes by `player_id` via a join/`golf_rounds` window instead of a raw id `.in()`.

---
# LOW (61)

## Announcements
**`src/app/golf/actions/announcements.ts:120-121, 248-251`**  
- Issue: The row is always written with `send_push:false, send_email:false`, but the action unconditionally fires `sendBulkPushNotification` + `notifyTeamAnnouncement` to all target players. The persisted flags contradict the actual delivery, and there is no UI toggle to disable push/email for a given announcement.
- Impact: Coaches cannot suppress push/email for low-priority notices; the stored flags are misleading for any future audit/reporting that trusts them.
- Fix: Either expose push/email toggles in the create flow and honor them, or set the columns to reflect that notifications were sent (or drop the columns from the insert and document the always-notify behavior).
**`src/app/golf/actions/announcements.ts:165-208`**  
- Issue: Inline-task creation is a sequential await loop: per task it does INSERT golf_tasks → INSERT golf_announcement_tasks → INSERT golf_task_assignments (each awaited serially).
- Impact: For an announcement with several inline tasks on a large roster this is multiple serial round-trips; slow under latency. Low impact because task counts are small in practice.
- Fix: Batch the announcement_tasks and task_assignments inserts after collecting task ids, or run the per-task work with Promise.all. Acceptable as-is for small N.
**`src/app/golf/actions/announcements.ts:579-606 + RLS golf_task_assignments_player_select`**  
- Issue: When a PLAYER opens `getAnnouncementDetail`, the assignments query is issued unscoped (`.in(task_id, ...)`) and relies on RLS to scope it. `golf_task_assignments_player_select` returns ONLY the player's own assignment row, which is the correct outcome for the player UI (it renders only `myAssignment`). However the server code is written as if it expects all assignments back (it later filters per task), so the design intent depends silently on RLS. Not a leak — flagging as a correctness/robustness note.
- Impact: None today (RLS protects it). Risk is future drift: if RLS were loosened, the player payload would include teammates' completion status. The player card does not render others' statuses anyway.
- Fix: Make the server intent explicit: when the caller is a player, add `.eq('player_id', playerId)` to the assignments and acknowledgements fetches rather than depending on RLS to do the scoping.
## Auth flows
**`src/app/golf/(auth)/login/page.tsx:214`**  
- Issue: The already-signed-in "Continue" button uses raw `returnTo` (`router.push(returnTo
- Fix: …)`) WITHOUT `isSafeInternalPath`, unlike the auth-effect path on line 62 which guards it.
**`src/app/golf/actions/auth.ts:344-354`**  
- Issue: signupAction` performs auth mutations (signUp + session) but does not `revalidatePath` (unlike `loginAction` which revalidates `/golf/dashboard`).
- Impact: After signup the new session may not be reflected in the Next.js router cache until the form's manual `router.refresh()`; relies entirely on the client 150ms timing hack.
- Fix: Add `revalidatePath('/golf/dashboard')` (and/or the onboarding path) in `signupAction` on success.
## Calendar & Events
**`MobileEventSheet.tsx:47-58,600-610` + `PremiumCalendarClient.tsx:1146-1151`**  
- Issue: Mobile create builds a minimal `RRULE:FREQ=…;INTERVAL=1;COUNT=…` (no structured weekday/biweekly), unlike desktop which uses `serializeRecurrenceRule(data.recurrenceRule)`.
- Impact: A coach creating a recurring event from the legacy mobile sheet cannot express multi-weekday or biweekly patterns.
- Fix: Surface the structured recurrence editor on mobile, or document the limitation. (Native Fairway path is fine.)
**`page.tsx:103` and `use-calendar-range-events.ts:224`**  
- Issue: golf_events` range reads are `.limit(500)` with no pagination.
- Impact: A team with >500 events in a ±3-month window would silently drop the overflow. Realistically out of reach for golf calendars, but it is a hard cap.
- Fix: If unbounded windows are ever needed, paginate via `fetchAllRowsResult`/`.range()`.
## Classes
**`src/components/golf/classes/ClassDetailModal.tsx:91`**  
- Issue: Detail modal renders `{classData.semester}` as a subtitle, but the page always passes `semester: ''` (not stored).
- Impact: The detail view shows an empty/blank semester line for every class.
- Fix: Hide the line when empty, or store + display the real semester.
## Coach Dashboard home
**`src/app/golf/actions/dashboard-data.ts:464-466,690`**  
- Issue: stats.previousAverage` is computed (split-half of normalized scores) and returned, but neither `FairwayCoachDashboard` nor legacy `CoachDashboard` consumes it for a delta/"vs prior" chip.
- Impact: Wasted computation; the "vs last period" comparison the value was built for is never shown.
- Fix: Either render a `delta` chip on the Scoring Avg `MetricCard` using `previousAverage`, or drop the computation.
**`src/components/golf/roster/JoinRequestAlert.tsx:34-43`**  
- Issue: The pending-join-request banner (the only badge-like element on home) is a one-shot `getTeamJoinRequests()` fetch on mount with no polling/realtime subscription and no revalidation hook.
- Impact: A coach who receives a new join request while sitting on the dashboard sees no badge update until a full page reload.
- Fix: Add a periodic refetch or a Supabase realtime subscription on `golf_team_members` pending rows, or revalidate on focus.
## Alerts
**`alerts.ts:643, 633-637`**  
- Issue: acknowledgeAllAlerts` only `revalidatePath('/golf/dashboard')` (not `/alerts`, `/insights`, `/intelligence`); and it sets `acknowledged_at` only (no `status='acknowledged'`), unlike `acknowledgeAlert` (line 309-312). Legacy/orphaned in prod (flag-on path never calls it), so impact is latent.
- Impact: If the flag-off path is ever re-enabled, "acknowledge all" leaves rows `status='active'` and other coach surfaces stale until manual refresh.
- Fix: Mirror the per-item action: also set `status='acknowledged'` and revalidate the same four paths. (Or delete the orphaned legacy actions.)
## CoachHelm Analytics
**`coachhelm-analytics.ts:729-734,974-980,663-668,497-512`**  
- Issue: The raw-table reads (`golf_predictions` in `getCoachHelmOverview` and the `calculate*FromPredictions/Insights` fallbacks, plus `golf_patterns_v2`/`golf_coach_insights` reads) are unpaginated `.in('player_id', playerIds)` queries with no `.range()`. PostgREST caps at 1000 rows. For a normal team in a 30-day window this is well under the cap, but a large/active team (or a wide custom range) could silently truncate, undercounting insights/predictions/patterns.
- Impact: Edge-case undercount of effectiveness metrics for high-volume teams; no user-visible error, just quietly-wrong totals.
- Fix: Paginate via `fetchAllRowsResult` / `.order('id').range()` for these reads, consistent with the project's 1000-row policy.
## Genome + Compare
**`src/components/fairway/pages/dashboard/player-dashboard-parts.tsx:224-275`**  
- Issue: The player dashboard "Your genome" teaser (`GenomeFingerprintTeaser`) plots strokes-gained across 4 scoring zones (`sg_off_tee/approach/around_green/putting`), but is titled "Your genome" and links to `/golf/dashboard/my-game-profile`, which renders the entirely different 8-dimension `golf_player_genome` model.
- Impact: A player clicking "Full profile" sees a different shape/axes than the teaser implied — two different data models share the "genome" name, which can read as inconsistent. Not a correctness bug in either surface alone.
- Fix: Re-label the teaser (e.g. "Strokes-gained shape") or back it with `golf_player_genome` so the teaser and full profile agree.
**`src/app/golf/(dashboard)/dashboard/my-game-profile/page.tsx:121` (legacy fork)`**  
- Issue: loadGenome` returns a row whenever ANY `golf_player_genome` row exists, including `rounds_basis=0`/all-null vector (the orchestrator writes such rows). In the flag-OFF legacy fork, `derivePersona({})` is always truthy (`course_profile='Not enough rounds yet…'`), so `genome && persona` passes and the legacy `GenomeRadar` renders a degenerate all-collapsed polygon instead of the empty state.
- Impact: Flag-OFF only: a brand-new player with a 0-round genome row sees a collapsed/empty radar rather than the "warming up" card. Prod is flag-ON (FairwayMyGameProfile), which handles this correctly via `axes.length>0`, so user impact is limited to the legacy path.
- Fix: In the legacy fork, gate the radar on live-axis count (e.g. `normalizeForRadar` non-null count `>= 3` or `genome.rounds_basis >= 8`) before rendering the radar, mirroring the Fairway fork.
## CoachHelm Hub + Chat
**`src/app/golf/(dashboard)/dashboard/insights/page.tsx:28-44` vs `src/components/fairway/pages/coachhelm/FairwayBrief.tsx:172-175`**  
- Issue: FairwayBrief deep-links to `/golf/dashboard/insights?category=<token>`; the insights page `searchParams` interface declares `categoryChips` but NOT `category`. The value is still consumed at runtime because `FairwayCoachHelmSignals` reads `sp.category` (FairwayCoachHelmSignals.tsx:271-272, filters at 479-480) — so the LIVE (redesign-on) deep-link works. But the typed contract is wrong and the legacy `InsightsPageContent` (flag-off) would silently ignore `?category=`.
- Impact: No live-user impact (both ends are redesign-on). Future maintainer could "clean up" the unread param and break the deep-link.
- Fix: Add `category?: string` to the insights page `searchParams` type to make the contract honest; or unify on `categoryChips`.
## Insights
**`InsightsPageContent.tsx:643-646`**  
- Issue: "Active" StatCard `trend` value is `stats.byPriority.urgent + stats.byPriority.high` rendered with `direction:'up'`. This is a count of urgent+high insights, not a trend/delta, shown as an up-arrow trend chip.
- Impact: Coach may read the green up-arrow as "active insights improving" when it is just a static urgent+high tally. Mildly misleading.
- Fix: Label it explicitly (e.g. a separate "Needs attention" stat) or drop the `direction:'up'` trend semantics.
**`insights.ts:1046,1181,1238,1294`**  
- Issue: generateTeamInsights`, `acknowledgeInsight`, `dismissInsight`, `resolveInsight` only `revalidatePath('/golf/dashboard')`, not `/golf/dashboard/insights`. (Bulk actions in insight-management.ts:294 DO revalidate `/insights`.)
- Impact: The Insights page is a client component that re-fetches via its own handlers, so the UI updates anyway; but a hard nav to `/insights` after a single-row action can show stale server-rendered shell. Inconsistent with the bulk path.
- Fix: Add `revalidatePath('/golf/dashboard/insights')` to the single-row + generate actions for parity.
## Patterns
**`DB grant on `golf_patterns_v2`**  
- Issue: anon` holds GRANT ALL (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) on `golf_patterns_v2` (verified via `role_table_grants`). RLS is enabled and every policy is scoped to `{authenticated}` with no anon policy, so anon access is denied at the row level — this is a latent over-broad grant, not an active leak.
- Impact: No current data exposure; violates least-privilege and the project rule that recreating tables auto-grants anon and must be REVOKEd.
- Fix: REVOKE ALL ON public.golf_patterns_v2 FROM anon;` (keep authenticated + service_role).
## Qualifying predictions
**`src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/error.tsx:20`**  
- Issue: The route error boundary's `homePath` is `/golf/dashboard/coachhelm`, which is the **player-only** CoachHelm dashboard (`dashboard/coachhelm/page.tsx:57-83` renders a "Player Dashboard Only" dead-end card for coaches).
- Impact: If this coach-only page errors, the coach's "go home" button lands them on a player dead-end card, not a useful coach destination.
- Fix: Set `homePath` to `/golf/dashboard/qualifiers` (or `/golf/dashboard`).
## Coaching Intelligence Settings
**`ThresholdSlider` "Bubble Zone" (`page.tsx:322-329`) + `insights.ts:282`**  
- Issue: bubble_zone_range` persists and loads but is never used to compute/trigger bubble alerts.
- Impact: Coach adjusts the bubble threshold; no alert behavior changes.
- Fix: Consume `bubbleZoneRange` in the bubble-player alert logic, or note it as informational.
**`coaching-philosophy.ts` (whole file)`**  
- Issue: A complete, hardened server action `saveCoachingPhilosophy` (auth + ownership + column allowlist + `upsert onConflict` + revalidate) exists but is unused; the page persists via direct client-side `update` in the hook instead. Functionally fine (RLS enforces ownership and the hook revalidates), but it is duplicate dead code that can drift from the live write path.
- Impact: None user-facing; maintenance hazard (two write paths, only one used).
- Fix: Either route the page's saves through the server action or delete it; keep one source of truth.
## Course Library + What’s New
**`src/app/golf/(dashboard)/dashboard/courses/` (has `loading.tsx`, no `error.tsx`)`**  
- Issue: The Courses route has a `loading.tsx` skeleton but no route-level `error.tsx`, unlike `whats-new/` which has one. If a server fetch throws, it bubbles to the nearest ancestor boundary instead of a course-specific error UI.
- Impact: Degraded error UX (generic boundary copy) on the courses route only. Note: the actions themselves return `[]`/`null` on failure so the page rarely throws — low real-world risk.
- Fix: Add `courses/error.tsx` using `RouteErrorBoundary` mirroring `whats-new/error.tsx`.
**`src/app/golf/actions/course-library.ts:220-236` (`getCourseTeeCounts`)`**  
- Issue: Selects `golf_course_tees.course_id` filtered `.in('course_id', courseIds)` for up to 200 courses with no pagination. PostgREST hard-caps responses at 1000 rows. ~5+ tees across 200 courses can exceed 1000 → tee counts silently undercount on the busiest libraries.
- Impact: Course cards show a too-low "N tees" badge once the catalog is large; cosmetic, not data loss. Not a concern at current data volume.
- Fix: Paginate via `fetchAllRowsResult`/`.range()`, or aggregate counts in a DB view/RPC.
**`src/app/golf/actions/whats-new.ts:314`**  
- Issue: pattern_validated` items set `title: row.pattern_type ?? 'Pattern validated'`, surfacing the raw enum/string `pattern_type` (e.g. `tee_strategy`) as the feed title verbatim.
- Impact: Coach sees a machine token instead of a human-readable pattern label in the What's New feed.
- Fix: Map `pattern_type` through a label dictionary (same pattern the patterns UI uses) before display.
## Development Plans (coach)
**`development.ts:301-311 vs DB doc:816`**  
- Issue: progress_notes` is treated as `{ entries: [...] }` (object), but the column default in the DB doc is `'[]'::jsonb` (array). First write to a default-`[]` row will overwrite the array with `{entries:[...]}`; reads (`Array.isArray(existingRaw?.entries)`) tolerate both, so no crash, but the default value shape and the written shape disagree.
- Impact: Cosmetic / latent; no user-visible break today because the writer always normalizes to `{entries:[]}`.
- Fix: Align the column default to `'{"entries":[]}'::jsonb` (or change the code to use a bare array) so default and written shapes match.
**`development.ts:144-145,191-192,232-233`**  
- Issue: All five mutators revalidate `/golf/dashboard/development` + `/golf/dashboard/my-development`, but `createFocusArea`/`updateFocusArea`/`deleteFocusArea` do NOT revalidate `/golf/dashboard/insights` or `/golf/dashboard/analytics/coachhelm`. The client compensates with `router.refresh()`, so the open tab updates; other cached coach tabs (e.g. CoachHelm Analytics outcome counts) may serve stale data until their own revalidate window.
- Impact: Minor staleness across tabs; the active tab is correct via router.refresh().
- Fix: Optionally add the analytics/insights paths to the create/update revalidation set for cross-tab freshness.
## Documents + Travel
**`src/app/golf/(dashboard)/dashboard/travel/travel-client.tsx:407,445`**  
- Issue: Legacy masthead upcoming/past split uses `new Date(i.departure_date) > now`. `new Date("2026-03-15")` parses as UTC midnight → reads as the prior calendar day in US timezones, so a trip departing "today" can be mis-counted as past. The trip cards correctly use `parseDateLocal` (travel-client.tsx:148-158); only the header counts skip it. Fairway branch is correct (FairwayTravel.tsx:256-258 uses local date parts).
- Impact: Header count of upcoming vs completed trips can be off by one near midnight/date boundaries (legacy/flag-off only).
- Fix: Use the existing `parseDateLocal` for the masthead filter too.
## Join team
**`src/app/golf/join/[code]/page.tsx:98 + golf-join-team-client.tsx:158`**  
- Issue: playerYear={player.graduation_year ? String(player.graduation_year) : 'freshman'}` passes a 4-digit grad year (e.g. "2027"), but the client renders it as a class/position label: `{playerYear.replace('_', ' ')}` with `capitalize` and a default of `'freshman'`. There is no class/`year` column on `golf_players` (only `graduation_year`).
- Impact: The "Joining as" card shows a raw graduation year styled like a class label ("2027"), or "Freshman" only when grad year is null — mildly confusing copy, not a functional break.
- Fix: Either label it "Class of {year}" or drop the line; the `.replace('_',' ')` + 'freshman' default is dead/misleading for an integer year.
## Messaging
**`src/hooks/golf/use-golf-messages.ts:103`**  
- Issue: markGolfMessagesAsRead(conversationId)` is fired without `await` or `.catch()`. The action `throws` on DB error (`src/app/actions/messages.ts:334,347`).
- Impact: An unhandled promise rejection on a read-marking failure; no user-facing error, but noisy and could surface as an uncaught rejection in Sentry.
- Fix: void markGolfMessagesAsRead(conversationId).catch(() => {})` or swallow inside the action.
**`src/app/actions/messages.ts:386-446 (sendGolfMessage notifications)`**  
- Issue: Per-send, the notification fan-out does sender lookups + recipient lookup + 3 `Promise.allSettled` loops (email, push, in-app) sized to recipient count. For a large team-chat broadcast this is an O(participants) burst on every message.
- Impact: Negligible for 1:1 / small teams; could be slow for big group chats. Not a correctness bug.
- Fix: Batch/queue notifications (e.g. Inngest) for team-chat conversations.
## My Development (player)
**`page.tsx:108-109`**  
- Issue: The active/completed partition only buckets active
- Impact: in_progress and completed. A focus area with `status='paused'` (a valid status per STATUS_CONFIG, `page.tsx:74`) is in neither bucket and is dropped from the UI entirely.
- Fix: A coach who pauses a player's focus area makes it vanish from the player's My Development list with no indication; the count strip also undercounts vs `(focusAreas
## My Qualifiers (player)
**`src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx:64-76`**  
- Issue: The `golf_rounds` query destructures only `{ data: roundsData }` and **ignores the error**. The canonical action checks `roundsResult.error` and returns failure (`golf.ts:4777-4779`).
- Impact: On a transient rounds-query failure the page silently shows entry-aggregate fallback totals (or zeros) instead of surfacing an error; numbers can look wrong without any signal.
- Fix: Destructure `error`; on error either throw (let `error.tsx` catch) or fall through deliberately with a logged note.
**`src/app/golf/(dashboard)/dashboard/my-qualifiers/my-qualifiers-client.tsx:21-23,107`**  
- Issue: "Complete" badge requires `roundsCompleted >= numRounds`, but for any non-completed qualifier `numRounds = roundsCompleted + 1` (`page.tsx:119-122`), so `N >= N+1` is never true and `canEnterRounds` (`N < N+1`) is always true.
- Impact: A player can never see "Complete" and can always "Enter Round" on a non-`completed` qualifier — the X/N denominator is effectively fictional. (Intended honesty per Fairway notes, but the legacy client still presents a real-looking "X / N" that can't reach N.)
- Fix: Legacy path: drop the fake denominator (mirror Fairway's "thru R1, R2"), or source a real round count. Fairway path already handles this correctly.
**`src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx:131`**  
- Issue: holesPerRound` is hardcoded to `18`. `golf_qualifiers` has no holes-per-round column, so a 9-hole qualifier still shows "18 holes/round" in the legacy client (`my-qualifiers-client.tsx:143`).
- Impact: Misleading holes/round label for non-18-hole qualifiers.
- Fix: Add a column to `golf_qualifiers` (or derive from linked course) instead of a constant; or drop the label until sourced.
## Onboarding
**`player/page.tsx:282-290, 148-149`; `onboarding.ts:40`**  
- Issue: Handicap input placeholder is `+2.4` (a plus/scratch handicap, conventionally negative) and the field accepts `+`, but submission uses `parseFloat(handicap)` → `parseFloat('+2.4') === 2.4`. A plus-handicap is stored as a positive 2.4-index.
- Impact: Elite ("plus") players get the wrong (sign-flipped) handicap stored, materially mis-stating ability. Zod allows down to -10 so negatives are valid storage.
- Fix: Map a leading `+` to a negative value before `parseFloat`, or instruct/parse plus-handicaps explicitly.
**`player/page.tsx:84-110`**  
- Issue: ensurePlayerRecord()` is called for **any** authenticated user who lands on `/golf/player`, including a coach. It creates an empty `golf_players` row (`onboarding_completed:false`) for them.
- Impact: A coach who visits `/golf/player` gets an orphan empty player record; they keep coach precedence so role doesn't flip, but it pollutes data and would show the player wizard to a coach.
- Fix: Guard `ensurePlayerRecord` / the player page against users who already have a coach profile.
## Player CoachHelm
**`FairwayPlayerCoachHelm.tsx:846-852,201-207`**  
- Issue: team_pct` (a 0–100 percentile rank, direction-normalized in the standing RPCs so higher = better) is rendered by `ordinalRank()` as a literal place ("82nd") with the label "team rank" and a "Best on the team" chip at ≥90. A percentile of 82 means "ahead of 82% of the team," not "82nd place."
- Impact: Players may misread the percentile as a roster position. Data is correct; the wording/format overstates it as a place.
- Fix: Label as "team percentile" (e.g. "82nd pct" / "top 18%") instead of an ordinal place, or render the actual rank position if that is the intent.
## Player detail (coach)
**`FingerprintHero.tsx:167-178`**  
- Issue: Legacy "Assign focus area" links to `/golf/dashboard/development?player=${id}`, but the development page + client never read a `player` query param (`development/page.tsx`, `development-client.tsx` — no `searchParams`/`useSearchParams`).
- Impact: Coach lands on the team-wide development page with no player pre-selected — silent no-op of the deep-link intent. Legacy (flag-off) path only; the Fairway prod hero has no such link.
- Fix: Read `?player=` in the development page and pre-select/scroll to that player, or drop the query param from the link.
**`player-fingerprint.ts:885-891` (`toPct`)`**  
- Issue: The fraction-vs-percent heuristic treats any value `<= 1.5` as a 0–1 fraction and multiplies by 100. The canonical calculator writes these as 0–100 (`golf-stats-calculator.ts:715-718`), so a legitimate low percentage (e.g. a 1% sand-save / one-putt rate) would be inflated to 100%.
- Impact: Rare but real 100× mis-scale for genuinely tiny percentages; pills like "Sand saves 100%" could appear for a player who almost never saves.
- Fix: Source the unit from the column contract (cache is 0–100) rather than value-magnitude guessing, or lower the threshold and document which columns are fractional.
## Player Dashboard + Hub
**`src/app/golf/(dashboard)/dashboard/hub/page.tsx:192`**  
- Issue: requires_upload: false` is hardcoded; never read from a real column.
- Impact: The "Upload" badge on a task row (`hub-parts.tsx:446-450`) can never render even for upload tasks.
- Fix: Source `requires_upload` from the task/template (e.g. `task_type`/category) or remove the badge until backed by data.
## My Game Profile + Standing
**`src/app/golf/(dashboard)/dashboard/my-standing/loading.tsx:6-26`**  
- Issue: loading.tsx` is styled in legacy tokens (`surface-stone`, `bg-white/70 backdrop-blur-xl ... shadow-glass`) and is NOT wrapped in the `.fairway-ds` scope. With the redesign flag on, the skeleton does not visually match the Fairway `StandingStrip` cards (`rounded-card border bg-surface shadow-soft`).
- Impact: Brief visual flash / layout mismatch (skeleton looks like the old glass UI, then resolves to the matte Fairway UI). Cosmetic CLS.
- Fix: Add a redesign-aware skeleton (or a `fairwayScope`-wrapped matte skeleton matching StandingStrip dimensions).
**`src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx:118-139`**  
- Issue: The player CoachHelm sub-nav (Overview/Development/Standing) has no entry for My Game Profile (`/golf/dashboard/my-game-profile`), and `FairwayMyGameProfile` is not mounted inside `CoachHelmShell`. The two self-surfaces (genome vs standing) are not cross-linked in the same shell.
- Impact: A player on My Standing has no in-shell path to their genome and vice-versa; discoverability gap. The genome page's only nav-out is "Back to hub".
- Fix: Either add a "Game Profile" tab to `PLAYER_TABS` and mount `FairwayMyGameProfile` in `CoachHelmShell`, or add a cross-link CTA between the two surfaces.
## Qualifiers (coach)
**`src/hooks/golf/use-qualifier-realtime.ts:39,29` + `QualifierLeaderboardRealtime.tsx:29`**  
- Issue: Hook types `num_rounds`/`holes_per_round` as optional cols and reads `qualifier?.num_rounds`, but these columns do NOT exist on `golf_qualifiers` (verified live DB). Always `undefined` → falls back to prop `numRounds=1`.
- Impact: No crash, but multi-round qualifiers can't drive `effectiveNumRounds`; the "num rounds" notion is inert. Legacy `QualifierViewTabs` always treats it as 1 round.
- Fix: Drop the phantom columns from the type, or add a real round-count source (e.g. `maxRoundNumber`) so multi-round leaderboards reflect actual rounds.
**`src/app/golf/(dashboard)/dashboard/qualifiers/[id]/QualifierRoundBreakdown.tsx:39-40` + `[id]/page.tsx:352`**  
- Issue: Legacy (flag-off) coach breakdown renders an all-dash table whenever `sortedBreakdown.length > 0` (true when entries exist but zero rounds posted), instead of an empty state. The Fairway path already fixes this (`FairwayQualifierDetail.tsx:288-298`).
- Impact: Flag-off coaches would see a confusing all-dash 7-row table before any round is posted. Live (redesign-on) path is correct.
- Fix: Gate the legacy breakdown on `maxRoundNumber > 0` (mirror the Fairway `hasAnyCompletedRound` guard) or remove the dead legacy branch.
**`src/app/golf/(dashboard)/dashboard/qualifiers/new/new-qualifier-client.tsx:228-241,258-282`**  
- Issue: Legacy (flag-off) form uses `<Button variant="primary">` for player tiles and Select-All/Clear; the primary variant injects `bg-primary-600 text-white shadow-sm hover:-translate-y-0.5` ahead of the intended cream/conditional classes. twMerge keeps the trailing bg/text but variant hover/shadow/scale still apply.
- Impact: Cosmetic only, flag-off path. Buttons still toggle selection correctly (`onClick` wired). Live Fairway form (`FairwayNewQualifier.tsx`) is clean.
- Fix: Use `variant="ghost"`/plain `<button type="button">` for selectable tiles in the legacy form, or delete the legacy branch.
## Recruiting HQ
**`src/app/golf/actions/recruit-documents.ts:218,279`**  
- Issue: uploadRecruitDocument` / `deleteRecruitDocument` call `revalidatePath('/golf/dashboard/recruiting')`, but the document panel is a client component that re-fetches via `getRecruitDocuments` + local `load()` (FairwayRecruitDocuments.tsx:125,158). The revalidate has no observable effect (the page's recruit list doesn't show doc counts), so it is dead work.
- Impact: None functional — purely a redundant revalidate. Worth noting in case a future "doc count" badge on the card relies on it (it would still be stale until the drawer re-fetches).
- Fix: Harmless; leave it, or drop the revalidate from the two doc-mutation actions. If a per-recruit doc count is ever shown on the card, switch to refetching the recruit list instead.
## Roster
**`src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx:101`**  
- Issue: An authenticated PLAYER who navigates to `/golf/dashboard/roster/[id]` (a teammate detail) is `redirect('/golf/login')`. The login page (`(auth)/login/page.tsx:57-63`) detects the live session and bounces to `/golf/welcome?next=/golf/dashboard`. No loop, but a logged-in player gets a confusing login→welcome→dashboard bounce instead of a clean redirect. The player roster only links teammates via Message, so this is mostly direct-URL reachable.
- Impact: Confusing bounce for a logged-in player hitting a coach-only detail URL; lands on dashboard, not the intended page.
- Fix: if (!coach) redirect('/golf/dashboard')` instead of `/golf/login` (matches `players/[playerId]/page.tsx:123` which already redirects players to `/golf/dashboard`).
**`src/components/fairway/pages/roster/FairwayPlayerCard.tsx:121` vs `FairwayPlayerActionsMenu.tsx:157`**  
- Issue: The same Fairway coach roster card has TWO different "view this player" destinations: the primary "View player" CTA → `/golf/dashboard/roster/${id}` (identity + stats cockpit), while the kebab "View Profile" → `/golf/dashboard/players/${id}` (AI insight: patterns/insights/predictions). Both routes exist and are valid, but they are different pages with no cross-link, so "View player" and "View Profile" silently diverge.
- Impact: Coach may not realize there are two player pages; "View Profile" and "View player" feel like they should be the same.
- Fix: Intentional per design notes, but consider renaming one (e.g. kebab → "AI Insights") or cross-linking the two pages so the divergence is legible.
## Round create/continue/recover
**`src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:106,1779-1820`**  
- Issue: The "Round in Progress / Continue Round / Start Fresh" resume prompt (and the redesign resume gate at 1671-1683) is unreachable — `setShowResumePrompt(true)` is never called.
- Impact: Dead UI branch; the documented resume affordance lives on `/rounds` instead. Server still fetches `existingInProgressRound` (`new/page.tsx:18-41`) only to drive emergency-save status wiring, not the prompt.
- Fix: Either re-enable the prompt (set true when `existingInProgressRound` exists) or delete the dead branches + trim the now-cosmetic server query to reduce confusion.
**`src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx:260-263`**  
- Issue: handleBeforeUnload` always `preventDefault()`s / sets `returnValue`, with no "has unsaved changes" guard (unlike the new-round client at 364-369).
- Impact: Browser shows the "Leave site?" confirmation even immediately on load before any edits. Minor friction; data is safe either way.
- Fix: Gate the beforeunload prompt on actual unsaved progress (mirror `new-round-client.tsx:460-467`).
## Round Review
**`src/components/golf/coachhelm/round-review/StrokesGainedSection.tsx:16`**  
- Issue: StrokesGainedSection` (Broadie off-tee/approach/around-green/putting SG bars) is imported by nothing in the codebase — orphaned component.
- Impact: No user impact (never renders), but the true per-shot SG breakdown the spec/CLAUDE.md imply is never shown to players; only season-level SG (redesign StandingBar) is surfaced.
- Fix: Either wire `StrokesGainedSection` into the review (feeding it real `golf_player_stats_cache` SG components) or delete it to avoid implying SG-per-round is shown.
## Rounds list
**`page.tsx:111-117 vs golf_rounds RLS (migration 20260527000000_prod_public_baseline.sql:19517-19523)`**  
- Issue: Coach query filters by `player_id IN (teamPlayerIds)` but the `golf_rounds` SELECT RLS for a coach is keyed on `team_id IS NOT NULL AND is_golf_team_coach(team_id)`. A round saved with `team_id = NULL` (column is nullable; `getPlayerTeamId` returns null when the player has no **active** membership — golf.ts:523-535) is invisible to the coach even though the app asked for it by player_id.
- Impact: Edge-case data invisibility: rounds a player logged while pending/inactive won't show in the coach library even after the player is activated (the round's team_id stays null). Happy path (active player) is unaffected.
- Fix: Backfill `golf_rounds.team_id` on activation, or add a coach RLS clause that resolves team via `golf_team_members` (as `golf_rounds_update_team` already does), so coach read matches the player_id-based app query.
**`RoundLibraryClient.tsx:225, page.tsx:225`**  
- Issue: **Legacy path only (dormant).** When the redesign flag is OFF, the `LargeTitleHeader` subtitle (`${rounds.length} rounds recorded`) and hero (`stats.totalRounds`) both display the capped count (max 50) with no "most recent 50" qualifier — the Fairway path fixes this (FairwayRoundsLibrary.tsx:275).
- Impact: Misleading total for a coach with >50 rounds, but only when `NEXT_PUBLIC_REDESIGN` is off; prod runs with it on, so this is currently unreachable.
- Fix: If the legacy path is ever re-enabled, mirror the Fairway cap-note; otherwise remove the legacy branch.
## Settings + Notifications
**`src/app/actions/notification-preferences.ts:45`**  
- Issue: updateNotificationPreferences` reads current prefs with `.single()` (read path was deliberately switched to `.maybeSingle()` at `:92` with an orphaned-user comment); the write path was not. Error is unchecked.
- Impact: For an orphaned auth user (no `public.users` row) the read yields null silently and the merge proceeds with only new keys; not a crash but loses the orphan-safety symmetry. Minor.
- Fix: Use `.maybeSingle()` here too for consistency.
**`src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:1163-1176`**  
- Issue: organizations_update_own` RLS checks `golf_coaches.organization_id = organizations.id` for the auth user. A program head editing a toggled ACTIVE team whose org differs from their own `organization_id` would have the org update silently rejected (error thrown → toast) after the team-name update already succeeded.
- Impact: Edge case: partial save (team saved, org rejected) for multi-org program heads.
- Fix: Scope org edit to the active team's org with a clearer error, or gate the org fields when the active team's org ≠ coach's org.
## Stats (personal)
**`src/app/golf/actions/stats-data.ts:1426,1432` + `src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx:2280,2296`**  
- Issue: In `getTrendAnalysis`, `RoundTrendData.score` is normalized to an 18-hole equivalent (`total_score * 18/holes_played`) but `RoundTrendData.toPar` is the **raw** `score_to_par` (not normalized). `RecentRounds` renders the normalized score in the badge and the raw to-par in the chip (and uses raw to-par to pick the badge color). For a 9-hole round the two don't reconcile (e.g. badge "76" next to chip "+2"). Affects BOTH the player view and the coach roster drill-down (shared cockpit body).
- Impact: A 9-hole round in Recent rounds shows an internally inconsistent score/to-par pair; the score-vs-par color cue can be wrong. 18-hole rounds are unaffected.
- Fix: Either normalize `toPar` to 18 holes in the mapper (`toPar: Math.round((r.score_to_par ?? 0) * (18/hp))`) to match `score`, or display the raw score + raw to-par together (as the legacy `stats-client.tsx:1281-1313` does). Keep the badge and chip on the same basis.
## Tasks
**`src/app/golf/actions/tasks.ts:185 (`uncompleteTask`), :239 (`getPlayerTasks`), :331 (`getTaskCompletionStatus`)`**  
- Issue: These golf actions are not imported by any golf/fairway UI (grep confirms zero callers)
- Impact: Dead code; maintenance/confusion risk; suggests an undelivered "undo complete" / "task detail" feature.
- Fix: Remove, or wire `uncompleteTask` into the card so a player can toggle completion back.
## Team Hub + Team Info
**`src/app/golf/(dashboard)/dashboard/team/page.tsx:115-119, 146-159`**  
- Issue: Player team-member lookup and roster query do NOT filter `golf_team_members.status='active'`; the roster query returns every member regardless of status, and the membership lookup uses `.maybeSingle()` with no status filter.
- Impact: team_member_status` enum has `pending/active/inactive/removed`. A non-active teammate would appear in the player roster + roster count with no status indicator (the canonical `roster/page.tsx` shows a `PlayerStatusBadge` + separate active count; this surface does not). Multiple memberships would also throw on `.maybeSingle()`. Currently zero impact: all 44 live members are `active` and removal deletes the row.
- Fix: Add `.eq('status','active')` to both the membership lookup and the roster query (and to the Team Hub teammates query below) for consistency with Team Hub + `completeTask`.
**`src/app/golf/(dashboard)/dashboard/team-hub/page.tsx:100-109`**  
- Issue: Team Hub "Teammates" tab query (`golf_team_members ... .neq('player_id', player.id)`) has no `status='active'` filter, unlike the page's own membership lookup at line 48.
- Impact: Same as above — inactive/removed teammates could surface in the Teammates grid. Zero live impact today (all active).
- Fix: Add `.eq('status','active')`.
## Team Stats
**`page.tsx:288-311`**  
- Issue: Putts/round denominator is `Σ (holes_played ?? 18)` over scored rounds (`totalPlayerHoles`), but the numerator only sums holes where `putts !== null && putts > 0` (`totalPutts`). When a round has fewer putt-recorded holes than `holes_played` (partial entry), the denominator over-counts → understated putts/round.
- Impact: A player who logged scores but skipped putts on some holes of an otherwise-18-hole round shows an artificially low putts/round. Affects only mixed-completeness rounds.
- Fix: Normalize over the count of holes that actually carry a putt value (track `holesWithPutts` like `totalHolesWithScore`), or use `total_putts`/`total_fairways` round-level columns when present.
**`page.tsx:367-374`**  
- Issue: Redesign (LIVE) branch fans out `loadPlayerStandingMap(p.id)` per player; each call issues 2 admin-client queries (`golf_player_standing` select + `loadPlayerCohort` → `golf_team_members`). For a 12-player roster that is ~24 queries per page load. Parallelized via `Promise.all` so latency is bounded, but it is an admin-client per-player fan-out.
- Impact: Extra DB load on every team-stats render; cohort gender is identical for all teammates yet re-fetched N times. Minor at current roster sizes.
- Fix: Batch standing rows in one `golf_player_standing .in('player_id', ids)` query and resolve the team cohort once for the whole roster.

---
# INFO (57)

## Announcements
**`src/app/golf/actions/announcements.ts:260-261; communication.ts:121`**  
- Issue: Coach create/delete/complete call `revalidatePath('/golf/dashboard/announcements')` + `updateTag(DASHBOARD)`; the player acknowledge in communication.ts calls only `revalidatePath` (no `updateTag(DASHBOARD)`). The dashboard notification badge is refreshed client-side via `router.refresh()` + `badges.refetch()` so the count still updates, but the cache-tag invalidation is asymmetric.
- Impact: Negligible — UI is correct via client refresh; only a consistency nit.
- Fix: Add `updateTag(CACHE_TAGS.DASHBOARD)` to `acknowledgeAnnouncement` for parity.
**`(no file) season_active gate`**  
- Issue: No season/offseason gate is applied to the Announcements tab anywhere in src/ (`season_active` exists only on `golf_teams`).
- Impact: Per spec this tab may be intentionally year-round; flagging only because the audit brief listed a season_active gate as a focus item.
- Fix: Confirm with product whether announcements should be season-gated; if yes, gate the create flow + read path on `golf_teams.season_active` like other paused features.
## Auth flows
**`src/app/golf/actions/demo-access.ts:127-139`**  
- Issue: golf_demo_sessions` is now present in `database.ts` (line 6464), but the action still casts through `as unknown as { from: (table: string) => any }` with a stale "isn't in the generated type until migration lands" comment.
- Impact: No runtime impact; loses type-safety on the insert and the comment is now false.
- Fix: Drop the cast and insert with the generated typed client.
**`src/app/golf/(auth)/signup/page.tsx:80-87`**  
- Issue: The access gate validates the code but does NOT confirm the typed code is the team the player intends; any valid team join code (or the global code) unlocks signup, and the typed code is carried to onboarding as `joinCode`. This is by design (documented in access-code.ts) — noted for completeness, not a defect.
- Impact: None — intended behavior.
- Fix: None.
## Calendar & Events
**`golf.ts:3709-3723`**  
- Issue: getEventRSVP` only checks `auth.getUser()` then reads stats for any `eventId`; relies entirely on `golf_event_attendance` RLS to scope rows (no explicit coach-of-this-team check, unlike `markAttendance`/`sendEventReminderToPlayers`).
- Impact: If RLS on `golf_event_attendance` SELECT is correct this is safe; otherwise a coach could read another team's RSVP names. Needs live RLS verification.
- Fix: Add an explicit `authorizeCoachForEvent`-style check for symmetry/defense-in-depth.
**`memory/context/golfhelm-features.md` #4 "Key Files"/"Sub-Features"`**  
- Issue: Listed action files (`event-lifecycle.ts`, `availability-polling.ts`, `availability-locking.ts`, `caldav-sync.ts`) and view components (`MonthView/WeekView/DayView`) do not exist; `golf_event_exclusions` never written.
- Impact: Doc drift; misleads future work.
- Fix: Update the feature doc to the real engine (`PremiumCalendarClient`, `golf.ts`, `recurring-events.ts`, `attendance.ts`) and prune unimplemented sub-features.
## Classes
**`page.tsx:44-72`**  
- Issue: Page has no explicit player role gate; it depends on nav-hiding + `!playerId`/`!teamId` early returns. A coach who navigates to the URL directly sees a non-functional page (no `playerId`). RLS keeps data safe.
- Impact: Cosmetic dead-page for an out-of-nav coach; no data leak (RLS-protected, coach has no `playerId` so no read/write happens).
- Fix: Optional: add an explicit `if (golfUser.role !== 'player')` guard with a redirect/empty state.
**`supabase/migrations/20260527000000_prod_public_baseline.sql:19326-19328`**  
- Issue: golf_player_classes_update_player` has a `USING` clause but no `WITH CHECK`.
- Impact: Not exploitable today — the update path never changes `player_id`, so a player can't reassign a row to another player. Worth a `WITH CHECK` for defense-in-depth.
- Fix: Add a matching `WITH CHECK` to the UPDATE policy.
## Coach Dashboard home
**`supabase/migrations/20260527000000_prod_public_baseline.sql:2372-2425,20300`**  
- Issue: get_coach_today_schedule` is `SECURITY DEFINER` with `GRANT ALL ... TO anon`.
- Impact: Looks like an over-broad anon grant, BUT the function body raises `Forbidden` unless `auth.uid()` matches a coach in the team's org (`:2377-2385`), so an anon caller (`auth.uid()=null`) always fails. Not exploitable as-is.
- Fix: No action required; noted for the SECURITY DEFINER grant-audit backlog. Could `REVOKE ... FROM anon` for defense-in-depth.
## Alerts
**`golfhelm-features.md #13 (lines 591-611)`**  
- Issue: Feature doc describes a `getCoachAlerts()/is_alert`/warning/info/suggestion model that the live code no longer uses (now `getInsightsForCoach` + critical/high/medium/low). The legacy `alerts.ts` readers, bulk actions, and `AlertCard.tsx` are orphaned.
- Impact: Documentation drift; future maintainers may edit the dead path.
- Fix: Update spec #13 to the insight-delivery wiring; remove or clearly deprecate the orphaned alerts.ts readers + `AlertCard`.
## CoachHelm Analytics
**`prediction-performance-writer.ts:112-118`**  
- Issue: The rollup writer fetches ALL `golf_predictions` across every team in the 30-day window with no pagination before bucketing per team. This is the populate side (out of this tab's render path) but at platform scale it will hit the 1000-row cap and produce incomplete rollups that this tab then reads as truth.
- Impact: Future-scale risk: the rollups the cockpit trusts could be computed from a truncated prediction set.
- Fix: Paginate the writer's prediction fetch; same policy. Tracked here because this tab consumes the output.
**`golfhelm-features.md:760`**  
- Issue: Known Gap "golf_insight_effectiveness not actively populated" is now stale — the daily `coachhelm-insight-lifecycle` cron calls `rollupInsightEffectivenessForYesterday` + `rollupPredictionPerformanceRolling30d` (route.ts:47-48). Population still depends on the cron firing in prod (a recurring half-firing-cron gotcha in this repo) and on coaches recording focus-area outcomes for the improvement-rate to be non-zero.
- Impact: Doc drift; the tab can legitimately read empty until outcomes are recorded, which is handled honestly.
- Fix: Update feature-doc #17 to reflect the cron + raw-table fallback and the real remaining dependency (outcome capture).
## Genome + Compare
**`golf_player_genome` (live DB)`**  
- Issue: Defensive verification: RLS confirmed enabled with exactly `genome_player_read` (own) + `genome_coach_read` (coach-of-team), both `authenticated`-scoped; no anon exposure despite the baseline `GRANT ALL … TO anon`.
- Impact: None — positive. The ownership gate is correct at the DB layer (defense-in-depth behind the page redirects).
- Fix: None.
## CoachHelm Hub + Chat
**`src/components/golf/coachhelm/v2/IntelligenceCommandCenter.tsx:1371-1418`**  
- Issue: The demoted "Deep analysis" command center starts empty and requires a manual **Analyze** click (`generateTeamInsight()`) to populate insights/patterns/predictions — no auto-load on expand.
- Impact: Coaches must click Analyze to see deep insights; expected for a heavy job, but a first-time coach may perceive the panel as empty.
- Fix: Optional: trigger Analyze on first expand, or label the empty state "Run analysis to populate".
**`src/lib/coachhelm/v3/chat/agent.ts:1-13,33`**  
- Issue: Header comment + memory note say "6 write tools"; actual is 9 read + **1** write tool (`create_goal_for_player`). Doc drift only — code is correct.
- Impact: None (documentation accuracy).
- Fix: Update the comment/memory to "10 tools, 1 mutating".
## Insights
**`insight-management.ts:704-732`**  
- Issue: getInsightsStats` counts a "Dismissed" bucket, but `applyInsightVisibility` chains `.neq('status','dismissed')` and `.in('lifecycle_state', ['detected','matured','addressed','resolved'])`, so dismissed/archived rows are excluded from the query entirely. `stats.dismissed` is therefore structurally always 0. The page only renders Total/Active/Acknowledged/Resolved cards (not Dismissed), so it is not visible — but the field is misleading for any future consumer.
- Impact: None on this tab (Dismissed card not shown).
- Fix: Either drop the `dismissed` field from `InsightsStats` or compute it from an un-filtered query if a Dismissed count is wanted.
**`memory/context/golfhelm-database.md (golf_coach_insights block)`**  
- Issue: The DB reference doc omits `lifecycle_state`, `category`, `evidence`, `signature`, `engine_version`, `addressed_at`, `archived_at` — all of which exist in `src/lib/types/database.ts` and are load-bearing for this tab.
- Impact: Doc-only; could mislead future query authors into thinking the columns don't exist.
- Fix: Regenerate `golfhelm-database.md` from the live schema.
## Patterns
**`page.tsx:81-82,102`**  
- Issue: The Fairway shell "signals" badge on the patterns route is fed `getAlertCounts(coach.id).critical` (`alerts.ts`), which counts `golf_coach_insights` rows — not patterns. On a patterns-only surface the badge reflects insight alerts, not pattern counts.
- Impact: Minor: the shell badge over/under-states relative to what's on screen.
- Fix: Either pass a pattern-derived count on this route or document that the badge is a global signals count.
**`FairwayCoachHelmSignals.tsx:195-200`**  
- Issue: PATTERN_STATUS_OPTIONS` offers Detected/Confirmed/Addressed/Resolved but no "Dismissed" filter, while `getTeamPatterns` returns dismissed rows (no default lifecycle exclusion). Dismissed patterns are visible but cannot be filtered to.
- Impact: Minor UX gap; not incorrect data.
- Fix: Add a "Dismissed" status option or default-exclude dismissed/resolved from the read.
## Qualifying predictions
**`src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/page.tsx:1-8`**  
- Issue: Tab is titled "Qualifying **predictions**" but contains zero prediction-model output — it is deterministic ranking + coach-pick selection. No `golf_predictions`/engine read on this surface.
- Impact: Naming implies an AI prediction the surface does not provide; sets a false expectation for the auditor and any future doc.
- Fix: Rename the audit unit / surface label to "Qualifying selection workspace," or actually surface a prediction (e.g. projected finish) if that was the intent.
**`memory/context/golfhelm-database.md` (golf_qualifiers / golf_qualifier_entries blocks) + `golfhelm-features.md` #3`**  
- Issue: The DB reference doc's `golf_qualifiers` block is missing the W29 columns (`selection_state`, `selection_slots_total`, `selection_slots_coach_pick`, `target_tournament_id`) and `golf_qualifier_selections` is absent; feature doc #3 documents none of the W29 selection workspace. Columns ARE real in `src/lib/types/database.ts:9129-9259` (the canonical source).
- Impact: Docs are stale vs shipped code; an engineer reading the DB doc would think these columns don't exist. Not a runtime bug.
- Fix: Run `npm run docs:regen` so the AUTOGEN DB blocks pick up the W29 columns/table; add a W29 section to features #3.
## Coaching Intelligence Settings
**`useCoachPhilosophy.ts:200-218`**  
- Issue: Saves are PATCH-style single-column `update`s by row `id`; no destructive delete-then-insert; correct client; debounce timers cleaned up on unmount. Optimistic UI for the team toggle reconciles with the server (revert on failure). No pagination concern (single-row reads).
- Impact: Confirms the persistence path is sound.
- Fix: —
## Course Library + What’s New
**`src/app/golf/actions/course-library.ts:55-58`**  
- Issue: revalidateLibrary()` revalidates `/golf/dashboard/courses` and `/golf/dashboard/rounds`, and the client drawers also call `router.refresh()` (`CourseLibraryClient.tsx:57`) / local `reload()`. Mutations correctly refresh both server cache and the open drawer. No bug — recorded as positive confirmation.
- Impact: n/a
- Fix: n/a
**`src/app/golf/actions/course-library.ts:358-385` (`getTeamSavedCourses`)`**  
- Issue: A player reaching `/golf/dashboard/courses` gets their OWN team's saved library (resolved via `golf_team_members`), and "Save to team" is hidden for players (`CourseDetailDrawer.tsx:185`, `canManageTeam` false). Players CAN still add/edit cloud courses+tees — this is intentional "open contribution" per the action's documented contract and the open RLS. No cross-team leak.
- Impact: n/a — by design.
- Fix: n/a
## Development Plans (coach)
**`page.tsx:228-231`**  
- Issue: Redesign fork issues `loadActiveGoals(pid)` + `loadPlayerStandingMap(pid)` per player in `Promise.all` over `playerIds` (parallel fan-out, 2 queries × roster size). Bounded by roster (~5-15), so acceptable, but it is a per-player fan-out rather than a single batched query.
- Impact: Negligible for normal rosters; would matter only for very large teams.
- Fix: Consider batching goals/standing by `.in('player_id', playerIds)` if roster sizes grow.
## Documents + Travel
**`src/app/golf/actions/player-notifications.ts:197-208`**  
- Issue: Travel badge counts only itineraries with `created_at > last_travel_seen_at`. If a coach EDITS an existing itinerary (changes lodging/time), `updated_at` moves but `created_at` doesn't, so no badge alerts the player to the change. Matches the seen-by-creation design but is a real notification gap.
- Impact: Players aren't notified when trip details change after first view.
- Fix: Optionally count `greatest(created_at, updated_at) > last_travel_seen_at`.
**`CLAUDE.md ("Mapbox … Used for course maps in … Travel itineraries (#10)")`**  
- Issue: No map component exists in any Travel page/component (only decorative `MapPin` icons). The doc claim is stale.
- Impact: Misleading documentation; no user impact.
- Fix: Correct CLAUDE.md, or add a destination/hotel map if intended.
## Join team
**`src/app/golf/actions/teams.ts:203-209`**  
- Issue: Join always inserts `golf_team_members.status = 'active'` (auto-approve). The feature doc's "or golf_team_join_requests if approval required" branch and the `golf_team_members.status = 'pending'` enum path are unimplemented; the in-page "approval" verbiage in the docstrings does not reflect a real gate.
- Impact: No user-facing bug today (auto-join is intended), but a coach-approval mode does not exist despite being referenced.
- Fix: If approval mode is ever desired, branch on a team setting to insert `status: 'pending'` and surface a pending state on the roster.
**`src/app/golf/join/[code]/page.tsx:75-77 + [code]/error.tsx:19`**  
- Issue: UI copy says the code may be "expired" ("This team invitation code is invalid or does not exist." / "The link may have expired."), but `golf_teams.join_code` has no expiry/TTL column — codes are permanent.
- Impact: "Expired" is messaging only; there is no actual expired-code handling to verify.
- Fix: Drop the "expired" wording, or add a real expiry column + check if expiring invites are a requirement.
## Messaging
**`src/components/fairway/pages/messages/MessageThreadPane.tsx:459-463`**  
- Issue: The typing indicator avatar always uses `conversation.other_participant` even in a GROUP conversation, where `other_participant` is undefined — so a group typing indicator shows a generic "User" avatar and cannot name who is typing.
- Impact: Cosmetic in group chats only; typing payload carries only `{userId,isTyping}` so the typer isn't identified.
- Fix: If desired, include the typer's name in the broadcast payload and resolve via `groupParticipants`.
## My Development (player)
**`development.ts:301-311 + golfhelm-database.md (progress_notes default `'[]'::jsonb`)`**  
- Issue: The DB column default for `progress_notes` is an array (`'[]'::jsonb`), but the action reads/writes the object shape `{ entries: [...] }` and `FocusAreaProgressEntry`/`ProgressNotes` assume `{entries}`. On a brand-new row the default `[]` has no `.entries`, so the read-modify-write treats it as empty (handled by the `Array.isArray(existingRaw?.entries)` guard) and overwrites it with an object — no crash, but the column default and the runtime shape disagree.
- Impact: No functional break today (guard tolerates it), but the schema default is misleading and any consumer expecting the array default would misread.
- Fix: Align the column default to `'{"entries":[]}'::jsonb` (or change code to the array shape) so default and runtime shapes match.
## My Qualifiers (player)
**`src/app/golf/actions/golf.ts:4723-4859` vs `page.tsx:32-141`**  
- Issue: getPlayerQualifiers()` is a near-duplicate of the page's inline fetch but has drifted (action honors `num_rounds` if present at `golf.ts:4829`; page does not; action checks rounds error, page does not). The page does not call the action.
- Impact: Maintenance hazard / silent divergence; the feature doc points at the action that isn't actually used by the route.
- Fix: Have `page.tsx` call `getPlayerQualifiers()` (single source of truth) or delete the unused action.
## Onboarding
**`CLAUDE.md:215`, `src/app/golf/README.md:39`**  
- Issue: Docs say player onboarding is "4-step"; the implementation is 3 screens (2 data steps + completion), same shape as coach.
- Impact: Documentation drift; no user impact.
- Fix: Update docs to "3-step" or add the missing step.
## Player CoachHelm
**`player-feedback.ts:220-221`**  
- Issue: rateInsightAsPlayer` revalidates `/coachhelm` + `/my-development` but the client also calls `router.refresh()` after every rate (`FairwayPlayerCoachHelm.tsx:273`), so optimistic feedback reconciles correctly. No action needed — recorded for completeness.
- Impact: None.
- Fix: —
**`PlayerCoachHelmDashboard.tsx` (whole file)`**  
- Issue: The legacy flag-OFF player dashboard is unreachable in prod (`NEXT_PUBLIC_REDESIGN=true`). Its What-If panel has the same broken `improvements` wiring, and its `HeroNarrativeCard` passes the RAW `team_pct` (no 0–1 vs 0–100 normalization, unlike the Fairway path). Only relevant if the flag is ever turned off.
- Impact: None in prod.
- Fix: If the legacy fork is retired, delete it; otherwise port the Fairway `team_pct` normalization + improvements fix.
## Player detail (coach)
**`supabase/migrations/20260527000000_prod_public_baseline.sql:20952`**  
- Issue: verify_coach_owns_player` is `SECURITY DEFINER`, accepts a caller-supplied `p_user_id`, and is `GRANT ALL ... TO anon`. The audited code always passes the authenticated `user.id`, so this path is safe, but the anon grant lets any anon-key holder probe whether an arbitrary `(user_id, player_id)` pair is a coaching relationship — a boolean RLS-bypass oracle.
- Impact: Information-disclosure oracle independent of this tab (pre-existing schema grant; matches the deferred SECURITY DEFINER grant-audit note). No data exfiltration, boolean only.
- Fix: REVOKE EXECUTE ... FROM anon` on `verify_coach_owns_player` (and audit sibling SECURITY DEFINER RPCs).
## Player Dashboard + Hub
**`memory/glossary.md:133`, `memory/context/golfhelm-features.md:813-815,833,838`**  
- Issue: Docs still flag the `golf_task_completions` dual-table Hub bug as an open High gap, but the code reads `golf_task_assignments` (the correct table).
- Impact: Misleading reference doc; future work may "re-fix" a non-bug or distrust the Hub.
- Fix: Update glossary + feature #19 to reflect that the Hub reads `golf_task_assignments` and the dual-table bug is resolved.
**`src/app/golf/actions/tasks.ts:169-170`, `src/app/golf/actions/golf.ts:3158-3160`**  
- Issue: completeTask`/`respondToEvent` revalidate `/tasks` and `/calendar` + `updateTag(DASHBOARD)` but not `/golf/dashboard/hub`.
- Impact: Mitigated: both Hub wrappers call `router.refresh()` after the action, so the Hub does re-sync; no user-visible staleness observed. Noted for completeness.
- Fix: Optional: add `revalidatePath('/golf/dashboard/hub')` for non-client-refresh callers.
**`src/app/golf/(dashboard)/dashboard/page.tsx:92,165`**  
- Issue: A user who is BOTH a coach and a player (same auth user) always gets the coach dashboard; the player branch is unreachable for them.
- Impact: Edge case (dual-role accounts are not a supported product state); not a leak — a coach seeing the coach view is correct. Documented only.
- Fix: No action unless dual-role becomes a product requirement.
## My Game Profile + Standing
**`src/lib/coachhelm/v3/standing/loader.ts:64,93; src/lib/coachhelm/v3/counterfactual/baseline-loader.ts:16; src/lib/coachhelm/v3/counterfactual/player-cohort-loader.ts:8`**  
- Issue: Standing map, scoring baseline, and cohort all read via `createAdminClient()` (service-role, RLS bypassed). Self-scoping is enforced only by the page passing `session.player.id`. There are no route params on either page, so no player can currently coerce another id — but the safety is code-discipline, not RLS.
- Impact: None today (pages only pass self id). Risk surfaces if any future caller passes a non-self id to these loaders.
- Fix: Prefer the RLS-respecting server client for player-self reads (as the genome loader already does), or add an explicit "caller must pass authenticated self id" assertion / keep these admin loaders for cron-only and add a self-client variant for page reads.
**`src/lib/coachhelm/v3/standing/metric-config.ts:55-57`**  
- Issue: approach_proximity_*` carry `unit:'feet'` while `display_label` says "...yd" (e.g. "Approach Proximity 50-125 yd"). This is intentional and correct: the bracket (50-125) is the approach SHOT distance in yards, and the proximity VALUE (rendered via `formatValue ... 'feet'`) is in feet. No feet/yards blending in the math.
- Impact: None — verified not a unit bug. The bracket-yards / value-feet split is consistent across config, scale (`min/max` in feet), and `formatValue`.
- Fix: None. Noted to pre-empt a false "yards mislabeled as feet" flag.
## Qualifiers (coach)
**`memory/context/golfhelm-database.md:1078-1096`**  
- Issue: DB doc for `golf_qualifiers` omits `selection_slots_total`, `selection_slots_coach_pick`, `selection_state`, `target_tournament_id` (all present + NOT NULL w/ defaults on the live table and in generated `database.ts:9190-9234`).
- Impact: Documentation drift only — no runtime impact. Code correctly uses the real columns.
- Fix: Regenerate `golfhelm-database.md` (the columns exist; doc is stale).
## Recruiting HQ
**`src/components/golf/recruiting/RecruitingPageClient.tsx (legacy, flag-off only)`**  
- Issue: Legacy path is fully wired and equivalent; not the live render path (NEXT_PUBLIC_REDESIGN=true). Documented for completeness — both paths import the same actions and the same `RecruitDocuments`, so the HIGH/MEDIUM findings above apply to the legacy path too (legacy RecruitDocuments.tsx:141 same popup issue, same 2 MB cap).
- Impact: None — flag-off only.
- Fix: n/a
## Roster
**`src/components/golf/roster/PendingJoinRequests.tsx:40-49`**  
- Issue: Legacy flag-off path fetches join requests client-side in `useEffect` (`getTeamJoinRequests()`), while the flag-on path passes server-loaded `joinRequests` into `FairwayCoachRoster`. Both correct; just two fetch strategies. No badge/realtime — requests refresh only on mount or `router.refresh()` after accept/reject (acceptable; no realtime spec for this).
- Impact: None — observation.
- Fix: —
## Round create/continue/recover
**`src/app/golf/actions/golf.ts:4351-4357,4615-4617`**  
- Issue: savePartialRound` deliberately omits `revalidatePath`/`updateTag`.
- Impact: Intentional and correct (documented: avoids 15s-autosave router refetch races). The `/rounds` UnfinishedRounds list relies on `submitGolfRoundComprehensive`/`deleteInProgressRound` revalidation + its own fetch instead. Not a bug — noted for completeness.
- Fix: None.
**`src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx:206-224`**  
- Issue: golf_shots`/`golf_holes` for the round are fetched with `.select('*')` and no `.range()`/pagination.
- Impact: NOT a real risk here: a single round is ≤18 holes and the Zod schema caps score ≤20/putts ≤10, bounding shots-per-round well under the 1000-row PostgREST cap. Flagged only to confirm it was checked.
- Fix: None.
## Round Review
**`CLAUDE.md (Product integrations → Mapbox)`**  
- Issue: Doc claims Mapbox is "used for course maps in Round Review (#23)"; the round-review hole visual is SVG (`HoleShotPath`), and `CourseMap` (Mapbox) is unused in this flow.
- Impact: Misleading docs for future maintainers expecting a Mapbox layer here.
- Fix: Update CLAUDE.md / `golfhelm-features.md` #23 to reflect the SVG shot-path visual; Mapbox is used in Travel (#10), not Round Review.
**`round-review-system.ts:1548-1550`**  
- Issue: generateAndStoreRoundReview` is invoked client-side (auto-gen) and its `revalidatePath` calls do not refresh the client `RoundReviewPage` state directly — the page instead sets `storedReview` from the returned object (page:421).
- Impact: None — the page correctly hydrates from the action return value, so revalidate-vs-client-state is a non-issue here; noted for completeness.
- Fix: No action.
## Rounds list
**`page.tsx:180,183 / FairwayRoundsLibrary.tsx:143`**  
- Issue: 9-hole rounds are normalized to 18-hole equivalents for avg/best/sparkline (`total_score * 18/hp`). This is intentional and documented, applied consistently across page + Fairway. No bug — noted so a reader doesn't mistake a doubled 9-hole "best" for an error.
- Impact: None.
- Fix: None.
## Settings + Notifications
**`src/app/actions/notification-preferences.ts:12-24 vs page.tsx:904-914`**  
- Issue: The Zod schema / legacy panel still carry baseball-only keys (`email_pipeline_updates`, `email_profile_views`) that the golf UI never renders.
- Impact: No functional bug; dead keys in a shared cross-sport schema.
- Fix: None required; document as shared-schema artifact.
## Stats (personal)
**`src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx:332-387`**  
- Issue: The cockpit re-fetches on `playerId` change only; unlike the legacy `StatsClient.handleRefresh` there is no in-page Refresh control to re-pull after a just-submitted round, and the page is `force-dynamic` so a soft nav re-runs `loadAll`. Stats are fresh on navigation but stale if the tab stays mounted while a round completes elsewhere.
- Impact: Player who logs a round in another tab won't see updated stats without a navigation/reload. Low real-world impact (stats page is normally entered fresh).
- Fix: Optional: add a manual refresh affordance (as the legacy surface had) or a focus/visibility re-fetch.
**`memory/context/golfhelm-features.md` #2 "Known Gaps" vs `src/app/golf/actions/stats-leak-maps.ts`**  
- Issue: Feature doc lists "Strokes Gained not populated (cache SG columns null)" and "golf_putting_tendencies never written" as open gaps. The active Fairway cockpit does NOT depend on those: SG comes from live shot calc with `sg_scale_for_player`, and leak maps are computed from raw `golf_shots` (the file comment explicitly says the per-bucket cache columns are populated for only 0-1 of 6 demo players, so it never reads the cache). The "Known Gaps" section is stale relative to the shipped redesign.
- Impact: None functionally — actually better than the doc claims. Doc drift only.
- Fix: Update feature doc #2 to reflect that the redesigned Stats surface derives SG + leak maps from raw shots, not the (still-empty) cache columns.
## Tasks
**`src/app/golf/(dashboard)/dashboard/tasks/page.tsx (no in-page gate)`**  
- Issue: Page has no own role gate; relies on layout role routing + in-page `userRole` checks for coach-only UI (create/templates/reminders). Server actions independently re-check role (`createTask`/`deleteTask`/template/reminder actions all verify `golf_coaches`).
- Impact: No exploit: a player who reaches the route sees only the read UI; coach mutations are server-enforced. Acceptable for a shared route, but noted that the gate is defense-in-depth at the action layer, not the page.
- Fix: None required; keep action-level checks.
## Team Hub + Team Info
**`src/app/golf/actions/tasks.ts:169-170`**  
- Issue: completeTask` revalidates `/golf/dashboard/tasks` + `DASHBOARD` tag but not `/golf/dashboard/team-hub` or `/golf/dashboard/team`.
- Impact: No user-visible bug: Team Hub reconciles via its own optimistic update + `router.refresh()` (FairwayTeamHubWrapper:405-407); the Team Info player view has no complete-task control (read-only).
- Fix: Optional: add `revalidatePath('/golf/dashboard/team-hub')` for completeness.
**`golf_teams` policy `golf_teams_select_by_join_code`**  
- Issue: Any authenticated user can `SELECT` any `golf_teams` row where `join_code IS NOT NULL`.
- Impact: Platform-wide pattern enabling the join-by-code flow; not introduced by this tab. Team identity (name/season) is mildly enumerable by code-holders.
- Fix: No action for this tab; note for a platform RLS pass.
## Team Stats
**`stats-intelligence.ts:348-375`**  
- Issue: insightCount` is derived from `getInsightsForPlayer(pid, { limit: 1 }).length`, so it is only ever 0 or 1 — never the true number of a player's insights. The legacy table consumes it only as a present/absent signal (priority dot), and the Fairway tile ignores it, so there is no visible defect today.
- Impact: No user-visible bug now, but the field name is misleading for any future consumer that treats it as a real count.
- Fix: Either fetch a count(*) for `insightCount` or rename it to `hasInsight`/drop it.
**`page.tsx:23`**  
- Issue: This is a read-only page; `export const revalidate = 300` caches the RSC for 5 min while the sibling personal-stats page (`stats/page.tsx:15`) is `force-dynamic`. A coach who just had a round submitted for a player may see up-to-5-min-stale team aggregates. No mutation occurs here, so the "revalidate after mutation" rule does not apply; noting the staleness window only.
- Impact: Brief staleness after new rounds land. Acceptable for an aggregate dashboard.
- Fix: If freshness matters, drop to `force-dynamic` or lower the revalidate window.