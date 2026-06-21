## Player Dashboard home + Hub [player]

Audited 2026-06-20. Repo root `/Users/ricknini/Downloads/helmv3`. Role context: **player**.

Routes audited:
- `/golf/dashboard` (player branch) — `src/app/golf/(dashboard)/dashboard/page.tsx`
- `/golf/dashboard/hub` — `src/app/golf/(dashboard)/dashboard/hub/page.tsx`

Both routes have a live Fairway redesign fork (`NEXT_PUBLIC_REDESIGN`) and a legacy fork. Per project memory, prod serves the Fairway shell (redesign ON), so the Fairway components are the live path; the legacy components are also traced because they share the same server data payload.

---

### End-to-end wiring (actual)

**Root dashboard (`/golf/dashboard`, player branch)**
1. `page.tsx:80` `getGolfSessionProfile()` → redirect `/golf/login` if no session (`:83`). `coach` branch is evaluated FIRST (`:92`); only if `!coach && player` is the player branch reached (`:165`). No role enforced beyond presence of `player` — see notes.
2. Player team resolved via `golf_team_members` (`:169-175`, `status='active'`, `maybeSingle`).
3. `getCachedPlayerDashboardData(player.id, userId, teamId)` → `getPlayerDashboardData` in `src/app/golf/actions/dashboard-data.ts:711`. This is a `'use server'` action; it calls `supabase.auth.getUser()` and throws if no user (`:726-727`). Note: it does NOT assert `user.id === _userId` (the coach path does at `:245`), but `playerId`/`teamId` are server-derived from the already-authed session, and all reads are filtered by those ids, so there is no cross-user read here.
4. Payload feeds `renderPlayerDashboard` (`:56`) → flag ON: `FairwayPlayerDashboard` (`src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx`); flag OFF: legacy `PlayerDashboard` (`.../dashboard/components/PlayerDashboard.tsx`). Both consume `PlayerDashboardData` + `PlayerDashboardPayload`.
5. Data sources in `getPlayerDashboardData`: `golf_teams`, `golf_rounds` (`.limit(50)` recent-form only), `golf_players.handicap`, `golf_player_stats_cache` (canonical headline KPIs/SG/secondary), `golf_events` (today), `golf_tasks` (`assigned_to`), `golf_announcements`, `golf_event_attendance` (own RSVP). Headline stats correctly sourced from the cache (not the capped 50-round fetch) — good.
6. Quick round entry CTA: `FairwayPlayerDashboard` ViewHeader `primaryAction` = "New round" → `/golf/dashboard/rounds/new` (`:252-256`), repeated as cold-start "Submit your first round" (`:301-304`) and the empty-recent-rounds "Submit a round" (`:505-507`). Route exists. WIRED.
7. Cross-feature links all resolve to existing routes: `/golf/dashboard/my-standing`, `/golf/dashboard/rounds`, `/golf/dashboard/stats`, `/golf/dashboard/my-development`, `/golf/dashboard/my-game-profile`, `/golf/dashboard/hub`, `/golf/dashboard/rounds/[id]/review`, `/golf/dashboard/settings` (verified present).
8. `loading.tsx` + `error.tsx` present for `/golf/dashboard`.

**Player Hub (`/golf/dashboard/hub`)**
1. `hub/page.tsx:40` `getGolfSessionProfile()` → redirect `/golf/login` if none; `:44` if `!player` redirect `/golf/dashboard` (coaches bounced out). Role enforced. Good.
2. Team via `golf_team_members` (`:49-56`); teamless → Fairway `EmptyState` (flag ON, `:62-77`) or legacy "No Team Found" (`:79-86`).
3. Parallel fetch (`:94-125`): `golf_travel_itineraries` (team-scoped, `select('*')`, ordered by departure_date), `golf_task_assignments` (player-scoped — CORRECT, matches `completeTask`'s write target), `get_player_hub_events` RPC (events + own RSVP + going/maybe counts), `getPlayerHubAnnouncements(teamId, player.id)`, `getTopInsightForPlayer(player.id)`.
4. Task detail second query: `golf_tasks` `.in('id', taskIds).eq('team_id', teamId)` (`:174-179`); status derived from the assignment map (completed/overdue/pending) (`:181-196`). `requires_upload` is hardcoded `false` (`:192`) — minor honesty gap (the Upload badge can never show).
5. Render: flag ON → `FairwayPlayerHubWrapper` (`src/components/fairway/pages/hub/FairwayPlayerHub.tsx`) with `teamName` looked up additively (`:224-229`); flag OFF → legacy `PlayerHubWrapper`. Both hold the SAME two optimistic write paths.
6. Mutations: `completeTask` (`src/app/golf/actions/tasks.ts:63`) and `respondToEvent` (`src/app/golf/actions/golf.ts:3067`) — both auth-check first, both correct client, both non-destructive (update/insert assignment; RSVP via `updateRSVP` upsert). Optimistic set + revert-on-failure + `router.refresh()` in both wrappers (`PlayerHubWrapper.tsx:72-111`, `FairwayPlayerHub.tsx:342-393`).
7. Announcements acknowledge owned by `AnnouncementsList` → `acknowledgeAnnouncement` with optimistic set + toast + `badges.refetch()` (`hub-parts.tsx:643-657`) — badge updates wired.
8. `loading.tsx` + `error.tsx` (`RouteErrorBoundary`) present for `/hub`.
9. `get_player_hub_events` is `SECURITY DEFINER` with `GRANT ALL ... TO anon` BUT guards with an `auth.uid()` membership/coach check that `RAISE EXCEPTION 'Forbidden'` (`20260527000000_prod_public_baseline.sql:3186-3210`). Anon has no `auth.uid()` → fails the gate. Not an anon leak.

---

### Expected vs actual (golfhelm-features.md #19 Player Hub)

- Spec "Known Gap" (High): *"Hub page READS from `golf_task_completions`, but `completeTask()` writes to `golf_task_assignments`."* **STALE / already fixed.** The live `hub/page.tsx` reads `golf_task_assignments` (`:104-107`), the same table `completeTask` writes (`tasks.ts:107/124/154`). The glossary (`memory/glossary.md:133`) and feature doc (`golfhelm-features.md:813-815, 833, 838`) still describe the old dual-table bug — documentation divergence, not a code bug.
- Spec sections 1–3 (Travel / Tasks / Events): all present and wired, including inline RSVP (Going / Maybe / Can't go) and going/maybe counts. Matches spec.
- Travel cards expose destination, transport, dates, hotel, packing list, room assignments, uniform — all present in `TripDetailSheet` (`hub-parts.tsx:290-382`). Matches spec.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| HIGH | broken-wiring | `src/app/golf/actions/dashboard-data.ts:774-781` | Root player dashboard derives `actionItems` (tasks) from `golf_tasks.assigned_to = playerId`, but the live task-assignment flow (`CreateTaskModal` → `golf_task_assignments`, `tasks.ts createTask`/`createTaskFromTemplate`) never sets `golf_tasks.assigned_to` (stays NULL). No trigger syncs it. | The player dashboard "Today" card / ActionItemsCard shows zero tasks even when the player has assigned, overdue tasks — they only appear in the Hub. Player misses overdue work on the home screen. | Query tasks via `golf_task_assignments` (join to `golf_tasks`, status from the assignment), exactly as `hub/page.tsx:104-196` does, instead of `golf_tasks.assigned_to`. |
| LOW | placeholder-data | `src/app/golf/(dashboard)/dashboard/hub/page.tsx:192` | `requires_upload: false` is hardcoded; never read from a real column. | The "Upload" badge on a task row (`hub-parts.tsx:446-450`) can never render even for upload tasks. | Source `requires_upload` from the task/template (e.g. `task_type`/category) or remove the badge until backed by data. |
| INFO | spec-divergence | `memory/glossary.md:133`, `memory/context/golfhelm-features.md:813-815,833,838` | Docs still flag the `golf_task_completions` dual-table Hub bug as an open High gap, but the code reads `golf_task_assignments` (the correct table). | Misleading reference doc; future work may "re-fix" a non-bug or distrust the Hub. | Update glossary + feature #19 to reflect that the Hub reads `golf_task_assignments` and the dual-table bug is resolved. |
| INFO | revalidation | `src/app/golf/actions/tasks.ts:169-170`, `src/app/golf/actions/golf.ts:3158-3160` | `completeTask`/`respondToEvent` revalidate `/tasks` and `/calendar` + `updateTag(DASHBOARD)` but not `/golf/dashboard/hub`. | Mitigated: both Hub wrappers call `router.refresh()` after the action, so the Hub does re-sync; no user-visible staleness observed. Noted for completeness. | Optional: add `revalidatePath('/golf/dashboard/hub')` for non-client-refresh callers. |
| INFO | role-gate | `src/app/golf/(dashboard)/dashboard/page.tsx:92,165` | A user who is BOTH a coach and a player (same auth user) always gets the coach dashboard; the player branch is unreachable for them. | Edge case (dual-role accounts are not a supported product state); not a leak — a coach seeing the coach view is correct. Documented only. | No action unless dual-role becomes a product requirement. |

No CRITICAL findings. Auth, role-gating (Hub bounces coaches; dashboard player branch is player-only data), sport-prefixed tables, correct Supabase clients, non-destructive mutations, pagination (small per-team sets; rounds use the cache for headline stats), loading/empty/error states, and quick-round CTA are all correctly wired.
