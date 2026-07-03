## Team Hub (player) + Team Info [both]

Audited: 2026-06-20
Routes:
- `/golf/dashboard/team-hub` (player-only consolidation surface, redesign-gated)
- `/golf/dashboard/team` (Team Info — coach settings + player read-only view; #24 in feature doc)

---

### End-to-end wiring (actual)

#### Route A — `/golf/dashboard/team-hub` (player)
`src/app/golf/(dashboard)/dashboard/team-hub/page.tsx`

1. **Flag gate** (line 30): `if (!isRedesignEnabled()) redirect('/golf/dashboard/hub')`. With the redesign flag off the route does not exist as a destination (the rail entry is hidden) and a direct hit bounces to the player Hub.
2. **Auth** (line 35-36): `getGolfSessionProfile()`; `if (!session) redirect('/golf/login')`.
3. **Role gate** (line 38-39): `const { player } = session; if (!player) redirect('/golf/dashboard')`. A coach (no player profile) is redirected to the main dashboard — correct, no role leak.
4. **Team resolution** (line 44-49): `golf_team_members` where `player_id = player.id AND status = 'active'` → `.maybeSingle()`. No team → honest `EmptyState` with "Enter team code" → `/golf/dashboard/settings` (line 53-69).
5. **Parallel data fetch** (line 76-110):
   - `golf_travel_itineraries` by `team_id` (read-only, jsonb→string reshaping verbatim from the Hub).
   - `golf_task_assignments` (typed-via-cast) for the player → then a second query to `golf_tasks` (`.in(taskIds).eq('team_id', teamId)`) to hydrate titles/due dates and compute completed/overdue/pending (line 170-194).
   - `getPlayerHubAnnouncements(teamId, player.id)` → RPC `get_player_hub_announcements` (auth-checked action, returns [] on error).
   - `golf_player_classes` by `player_id` (read-only display).
   - `golf_teams.name` by id.
   - Teammates: `golf_team_members` join `golf_players` (+ `users.last_seen`), `.neq('player_id', player.id)`.
6. **Render** (line 237-250): `<FairwayTeamHubWrapper>` (the optimistic-write client boundary) → `<FairwayTeamHub>` (5 sub-tabs: Tasks / Announcements / Travel / Class schedule / Teammates).

Components:
- `src/components/fairway/pages/team-hub/FairwayTeamHub.tsx` — presentation. Tabs deep-link via `?tab=` with `history.replaceState` (no server round-trip). Tasks reuse `TaskRow`; the ONLY write is `completeTask` owned by the wrapper. Announcements via self-contained `AnnouncementsList` (owns its own acknowledge + badge refetch). Travel read-only (`TripRow`/`TripDetailSheet`). Classes read-only (`ClassScheduleReadonly`, edits route to `/golf/dashboard/classes`). Teammates via `FairwayPlayerRoster` (read-only, own empty state).
- Optimistic write: `FairwayTeamHubWrapper.handleCompleteTask` (line 383-410) — optimistic setState → `completeTask(taskId)` → revert on failure → `router.refresh()` in a transition. Non-destructive.
- `completeTask` (`src/app/golf/actions/tasks.ts:63`) — auth-checks, resolves player, verifies task, then UPDATE-or-INSERT into `golf_task_assignments` (never delete-then-insert). For the insert path it verifies an `active` membership on `task.team_id`. Revalidates `/golf/dashboard/tasks` + `updateTag(DASHBOARD)`.

#### Route B — `/golf/dashboard/team` (Team Info, both roles)
`src/app/golf/(dashboard)/dashboard/team/page.tsx`

1. **Auth** (line 36-37): `getGolfSessionProfile()` → redirect to `/golf/login` if none.
2. **Coach fork** (line 45-110): if `coach`, build `coachData`. Team resolution is deterministic via `resolveCoachTeamIdWithCookie(supabase, org_id, coach.id)` (honors the active-team cookie for program heads), then loads the chosen team by id. Renders `<FairwayTeam role="coach">` (redesign) → `FairwayTeamSettings`, else legacy `TeamSettingsClient`.
3. **Player fork** (line 112-217): resolves team via `golf_team_members` `.maybeSingle()`; loads `golf_teams`; loads team coach via `golf_coaches.eq(organization_id).maybeSingle()`; roster via `golf_team_members.player_id → golf_players`; latest-5 `golf_announcements` (`body`→`content` map); player tasks via `golf_task_assignments → golf_tasks`. Renders `<FairwayTeam role="player">` → `FairwayTeamInfo` (read-only), else legacy `TeamInfoPlayer`.

Coach mutations (`src/app/golf/actions/teams.ts`): `createTeam`, `updateTeam`, `regenerateJoinCode`, `addSecondTeam` — all `'use server'`, all call `supabase.auth.getUser()` first, all verify the coach owns the team (`getCoachTeamId === teamId`), all `revalidatePath('/golf/dashboard/team')` (+ dashboard/roster). No delete-then-insert in the edit paths (the only deletes are rollback-on-failure cleanups of a just-created team). RLS on `golf_teams` confirmed: `golf_teams_update_coach` UPDATE policy (`is_golf_team_coach(id)`) exists, so edits persist; SELECT gated to team coach/player + a join-code lookup policy.

---

### Expected (feature doc #24) vs actual

| Feature-doc expectation | Actual | Verdict |
|---|---|---|
| Coach view: edit name/season/join code | `FairwayTeamSettings` does all three + add-second-team + copy/regenerate invite | ✅ exceeds spec |
| Player view: coach name+avatar | `FairwayTeamInfo` "Head coach" section | ⚠️ broken for multi-coach orgs (see F-1) |
| Player view: full roster cards | first-5 roster + "View full roster" link | ✅ |
| Player view: latest 5 announcements | latest-3 shown ("View all" → announcements) | ✅ (doc says "latest 5", code shows 3; cosmetic) |
| Player view: pending tasks checklist | first-3 pending tasks + count, "View all" → tasks | ✅ |
| Tables: golf_teams, golf_coaches, golf_team_members, golf_players, golf_announcements, golf_tasks, golf_task_assignments | all present + correct sport prefixes | ✅ |

Team Hub itself is NOT documented as a feature (it is a redesign-only consolidation introduced after the doc); it correctly reuses the Hub's exact queries/write boundary.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | wrong-data | `src/app/golf/(dashboard)/dashboard/team/page.tsx:137-143` | Player "Head coach" resolved with `golf_coaches.eq('organization_id', team.organization_id).maybeSingle()`. `.maybeSingle()` returns `{data:null, error}` when the org has >1 coach; the page destructures only `data` so the error is swallowed and `teamCoach` becomes `null`. | LIVE: 2 orgs have multiple coaches (Demo University Golf = 2 coaches/7 active players incl. the demo account; the Lynchburg org = 3 coaches). Every player on a multi-coach team sees "No coach assigned yet" even though coaches exist. Affects both legacy `TeamInfoPlayer` and redesign `FairwayTeamInfo` (shared `coach` prop). | Resolve the head coach via `golf_team_coach_staff` filtered by `team_id` (prefer `is_primary=true`/`role='head_coach'`) and order+`.limit(1)` instead of an org-wide `.maybeSingle()`. |
| LOW | wrong-data | `src/app/golf/(dashboard)/dashboard/team/page.tsx:115-119, 146-159` | Player team-member lookup and roster query do NOT filter `golf_team_members.status='active'`; the roster query returns every member regardless of status, and the membership lookup uses `.maybeSingle()` with no status filter. | `team_member_status` enum has `pending/active/inactive/removed`. A non-active teammate would appear in the player roster + roster count with no status indicator (the canonical `roster/page.tsx` shows a `PlayerStatusBadge` + separate active count; this surface does not). Multiple memberships would also throw on `.maybeSingle()`. Currently zero impact: all 44 live members are `active` and removal deletes the row. | Add `.eq('status','active')` to both the membership lookup and the roster query (and to the Team Hub teammates query below) for consistency with Team Hub + `completeTask`. |
| LOW | wrong-data | `src/app/golf/(dashboard)/dashboard/team-hub/page.tsx:100-109` | Team Hub "Teammates" tab query (`golf_team_members ... .neq('player_id', player.id)`) has no `status='active'` filter, unlike the page's own membership lookup at line 48. | Same as above — inactive/removed teammates could surface in the Teammates grid. Zero live impact today (all active). | Add `.eq('status','active')`. |
| INFO | revalidation | `src/app/golf/actions/tasks.ts:169-170` | `completeTask` revalidates `/golf/dashboard/tasks` + `DASHBOARD` tag but not `/golf/dashboard/team-hub` or `/golf/dashboard/team`. | No user-visible bug: Team Hub reconciles via its own optimistic update + `router.refresh()` (FairwayTeamHubWrapper:405-407); the Team Info player view has no complete-task control (read-only). | Optional: add `revalidatePath('/golf/dashboard/team-hub')` for completeness. |
| INFO | rls | `golf_teams` policy `golf_teams_select_by_join_code` | Any authenticated user can `SELECT` any `golf_teams` row where `join_code IS NOT NULL`. | Platform-wide pattern enabling the join-by-code flow; not introduced by this tab. Team identity (name/season) is mildly enumerable by code-holders. | No action for this tab; note for a platform RLS pass. |

---

### Verified-correct (no finding)

- **Role-gating**: team-hub redirects coaches (`!player → /golf/dashboard`) and is shown only in the player nav branch (`FairwayDashboardShell.tsx:155`, after the coach branch returns at line 132; legacy `GolfSidebar.tsx:99` player-redesign array). team/page forks coach vs player correctly.
- **Auth**: both pages call `getGolfSessionProfile()` and redirect unauthenticated; every server action in `teams.ts` + `tasks.ts` + `player-notifications.ts` calls `supabase.auth.getUser()` before any read/write of private data.
- **Mutations**: `createTeam`/`updateTeam`/`regenerateJoinCode`/`addSecondTeam`/`completeTask` all revalidate and are non-destructive (no delete-then-insert in any save path; the only `.delete()` calls are rollbacks of a just-created team on a failed staff insert). Correct server client used throughout.
- **RLS**: `golf_teams` UPDATE policy `golf_teams_update_coach` present → coach team edits persist (this resolves the older "no UPDATE policy" concern for teams).
- **Interactive controls**: copy invite link, regenerate code, save changes, create team, add-second-team gender toggle, complete-task, tab switching, deep links, "View all/Manage" CTAs all wired to real handlers/routes (`/golf/dashboard/announcements`, `/tasks`, `/roster`, `/classes`, `/golf/join/[code]`).
- **States**: `team-hub/loading.tsx` (Fairway shape-matched skeleton) + `team/loading.tsx` (GenericPageSkeleton); honest empty states on every section; `team/error.tsx` + group-level `(dashboard)/error.tsx` + `(dashboard)/dashboard/error.tsx` provide error boundaries (team-hub relies on these).
- **Data honesty**: displayed values trace to real query rows; em-dash/EmptyState fallbacks, no hardcoded/mock data. `gender`/`season_active` columns the actions write exist in the live DB (the db doc is stale, not a bug).
- **Units/math**: handicap chip (`scratchOrBetter = handicap <= 0`), class time/day formatting via `schedule-parser` utils — correct. No feet/yards or SG logic on this tab.
- **Pagination**: roster/teammates/tasks/announcements are all small sets (44 members live); no realistic PostgREST 1000-row truncation risk.
