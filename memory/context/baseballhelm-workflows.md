# BaseballHelm User Workflows

> Step-by-step journeys (route → action → table → result) for BaseballHelm. Traced from source 2026-06-30.
> POINT-IN-TIME: BaseballHelm is under active rework — trust DB enums/RLS as ground truth; treat route/behavior detail as current-state, not a frozen contract.
> Companion: `memory/context/baseballhelm-features.md`, `memory/context/baseballhelm-database.md`.

---

## Workflow 1 — Coach reviews prospects and moves a player through the recruiting pipeline

**Persona**: college / JUCO / showcase coach (HS + showcase coaches are blocked from recruiting by `assertCoachCanRecruitPlayer` and `requireRecruitingCoachRoute`; `allowedCoachTypes: ['college','juco','showcase']`).

1. **Discover** — `/baseball/dashboard/discover` → `getDiscoverPlayers(filters)` (coach identity/type re-derived server-side) → `SELECT baseball_players WHERE recruiting_activated=true AND player_type != 'college'` (+ JUCO restriction, discoverable-team set, own-roster exclusion).
2. **Add to watchlist** → `addToWatchlist(coachId, playerId)` — **calls `assertCoachCanRecruitPlayer` first** → INSERT `baseball_watchlists {pipeline_stage:'watchlist', priority:0}` + INSERT `baseball_player_engagement_events {engagement_type:'watchlist_add', is_anonymous:false}` + `notifyWatchlistAdd`.
3. **Open pipeline** — `/baseball/dashboard/pipeline` → `useWatchlist()` reads `baseball_watchlists WHERE coach_id = coach.id` (client-side).
4. **Move a player** — two paths: **drag** → client `UPDATE baseball_watchlists SET pipeline_stage` (**no recruitability re-check, RLS only**); **table dropdown** → `updateWatchlistStatus()` (`can_manage_stats` + ownership) → UPDATE + `notifyPipelineStageChange()`.
5. **The 5 valid stages** (`baseball_pipeline_stage`): `watchlist → high_priority → offer_extended → committed`, plus terminal `uninterested`.

**Invariants that must never break**:
- Writes creating a recruiting relationship must pass `assertCoachCanRecruitPlayer` (8 conditions). Today only watchlist **add**/**toggle** enforce it — the **Kanban drag bypasses it** (RLS-only). Don't extend the bypass.
- Only the 5 DB-enum stages are persistable. **⚠️ Known drift**: `src/lib/recruiting/stages.ts` lists 7 (`contacted`, `campus_visit`) — writing either is rejected by the Postgres enum. The enum is the source of truth, not the 7-value UI config.
- No stage-transition enforcement (watchlist→committed allowed); add validation if sequential progression is ever required.
- Coach-type isolation: HS/showcase never recruit; JUCO can't recruit JUCO players; no coach recruits own-roster or non-activated players.

---

## Workflow 2 — Player creates/activates a recruiting profile (opt-in; anonymized vs. identified)

**Persona**: HS / showcase / JUCO player. **College players can never activate.**

1. **Onboarding sets recruiting OFF** — `/baseball/player` writes `baseball_players` with `recruiting_activated:false` for all types.
2. **Player opts in** — `/baseball/dashboard/activate`: college → locked card; already-activated → redirect; else `handleActivate()` → **direct client** `UPDATE baseball_players SET recruiting_activated=true, recruiting_activated_at=now()`. The master gate flips ON.
3. **Interest in a college** — `/baseball/dashboard/colleges` → `addToInterests(orgId)` (org must be college/juco) → dedupe on `(player_id, organization_id)` → INSERT `baseball_recruiting_interests {status:'interested', interest_level:'researching'}`.
4. **Coach views the player** → INSERT `baseball_player_engagement_events {coach_id, engagement_type:'profile_view'|'watchlist_add', is_anonymous:false}`.
5. **Interest feed** — coach `/college-interest` reads engagement events for their roster; **anonymized vs. identified** = `isAnonymous = !event.coach_id`.

**Invariants**:
- Opt-in is mandatory & player-owned; `recruiting_activated` gates every recruiting surface; `EDITABLE_PROFILE_FIELDS` excludes it from generic patches.
- College players never activate (app enforces in 3 places; DB CHECK still missing — canonical-spec P1-1).
- **Anonymized-before / identified-after** is the *intended* model; **in code the flag keys on missing `coach_id`, not activation state, and every writer hardcodes `is_anonymous:false` — the anonymous branch is currently unreachable and `is_anonymous` is a dead column.** Preserve intent; know the mechanism diverges.
- No telemetry on logged-out public-profile views (only authed coaches log events).

---

## Workflow 3 — Coach manages roster / team data

1. **Create program** — `/baseball/coach-onboarding` → `runCompleteCoachOnboardingCore` writes `users` → `organizations` → `baseball_coaches` → `baseball_teams` (with `join_code`) → `baseball_team_coach_staff` (head coach, full caps). (Default group seeding NOT implemented.)
2. **Invite players** — `/baseball/join/[code]` → `processTeamInvitation(code, playerId)`: Zod-validate → IDOR-check caller owns playerId → **atomic RPC `try_redeem_baseball_team_invitation`** → `joinTeam()` → INSERT `baseball_team_members`. JUCO team auto-enables recruiting.
3. **Invite staff** — `inviteStaff(...)` (`can_invite_staff`) → capability bundle → INSERT `baseball_staff_invitations`; accept at `/baseball/staff/join/[code]` → `acceptStaffInvite(token)` → **SECURITY DEFINER RPC `baseball_accept_staff_invite`** writes `baseball_team_coach_staff`.
4. **View roster** — `getRoster(activeTeamId)` (**staff-only**) → `baseball_team_members`⋈`baseball_players` + aggregates; returns `{members, aggregates, rosterError, aggregatesError}` (load-failure ≠ empty).
5. **Manage a player** — `assignPlayerToTeam` (UPSERT on `(team_id,player_id)`, non-destructive) / `removePlayerFromTeam` (scoped single-row DELETE); each appends `baseball_player_timeline_events`.
6. **Manage staff** — `updateStaffCapabilities` (head/primary protected), `removeStaff` (non-destructive `status='removed'`).

**Invariants**:
- Team data isolation: resolve active team server-side; staff-only reads return `authorized:false` + zero rows for non-members. Never trust client-supplied ids.
- Non-destructive membership/staff ops: UPSERT for join, scoped single-row DELETE for removal, `status='removed'` for staff. Never delete-then-reinsert.
- Duplicate detection: idempotent via unique keys `(team_id,player_id)` / `(coach_id,player_id)` / `(player_id,organization_id)`. **No fuzzy/name-based prospect dedup exists** (`import-matching.ts` `detectDuplicate` is CSV-stat-import only). Preserve the exact-key guards.
- Invite atomicity via the reserve/release RPC pair (`try_redeem…` / `release_…`) (#395).
- Staff have no RLS write grant on `baseball_team_coach_staff` pre-acceptance — must go through the SECURITY DEFINER RPC.

---

## Workflow 4 — Coach reviews stats

1. **Stats Lab** — `/baseball/dashboard/stats-center` → `getStatsCenter(teamId)` (**staff-only**): joins `baseball_box_score_*` to `baseball_games.game_type` for official-vs-scrimmage, reconciles vs `baseball_player_season_stats`, flags drift.
2. **Enter a box score** — `/stats/games/[gameId]` → `saveFullBoxScore(...)` → **atomic RPC `save_baseball_full_box_score`** → then `recalculate_baseball_season_stats` per player.
3. **Review** — season view reads `baseball_player_season_stats`; elite charts from `baseball_pitch_events`/`_batted_ball_events`/`_swing_events` with sample-size gating.
4. **Player self-view** — `/my-stats` → `getMyStats/getMyAggregates` (legacy layer-1).

**Invariants**:
- Canonical write path: full box-score saves must be **atomic via `save_baseball_full_box_score`** before season rollups. Never the unwrapped two-call `saveBoxScoreBatting/Pitching` (UI-dead, data-loss risk).
- Three-layer separation: never add a new reader of layer-1 `baseball_player_stats`/`_aggregates` — `stat-layer-contract.test.ts` fails CI on new references outside the allowlist.
- Context never blended: official vs. scrimmage vs. practice vs. sensor never merged without an explicit `game_type` filter.
- Zero-stat honesty: starved metric → `noData:true`/"sample too small"; every rate is `null` on a zero denominator.
- Staff-only: `getStatsCenter` returns `authorized:false` + zero rows for non-staff/cross-team.

---

## Workflow 5 — Onboarding a new coach and a new player

### New coach
1. `/baseball/signup` "Create Program" → `completeBaseballSignup({role:'coach', coachType})` → bare `baseball_coaches` (`onboarding_completed:false`) → `/baseball/coach-onboarding`.
2. Steps: `type` (College/JUCO/High School/Showcase = **program market type only**, not a job title) → `program` → `account` → `plan` → `lifting` → `complete`.
3. `runCompleteCoachOnboardingCore` writes `users`, `organizations` (type=coach_type), `baseball_coaches` (`onboarding_completed:true`), `baseball_teams` (join_code), `baseball_team_coach_staff` (head coach, full caps).
4. Redirect `/baseball/dashboard/command-center`.

### New player
1. `/baseball/signup` "Join Player" → `completeBaseballSignup({role:'player', playerType})` inserts `baseball_players` (`recruiting_activated: playerType !== 'college'` on OAuth path) → `/baseball/player`.
2. Steps: `type` (HS/Showcase/JUCO/College) → `about` → `measurables` (all optional) → `team` (join via `processTeamInvitation`) → `complete`.
3. `handleComplete` = **direct client `UPDATE baseball_players`** (recruiting stays OFF). ⚠️ Old `.update().eq('user_id')` pattern — silently no-ops if no `baseball_players` row exists.
4. Land `/baseball/player/today`.

**Invariants**:
- `coach_type` = market type, not job title. Never conflate with staff role/capabilities (those live on `baseball_team_coach_staff`). A lifting coach is a staff / `helm_lifting_coaches` row, never a new `coach_type`.
- Recruiting default OFF; college players never activatable.
- Program creation is a fixed transaction set (users → organizations → baseball_coaches → baseball_teams → baseball_team_coach_staff); a partial failure must not leave a coach without an org/team (team/staff inserts currently best-effort — known fragility).
- Player row must exist before onboarding update (upsert on `user_id`, not a bare update matching 0 rows).
- Additive DB safety: shared live GolfHelm Supabase — all migrations additive, `baseball_*`/`helm_lifting_*` only, REVOKE anon after new tables.

---

## Cross-cutting notes for maintainers
- Two canonical-spec **P0 bugs already fixed** in-tree (2026-06-30): announcements column mismatch (`content`/`created_by_id`) and dev-plan status filter (`.in(['sent','in_progress'])`). Spec text is stale.
- Coach-notes visibility enum = 6 scopes; `useTeamRouteProtection` (spec P0-7) does not exist.
- Readiness/production status: `docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md` (0 `ready`, 18 `partial`). Business invariants + contract tests: `docs/operations/BASEBALLHELM_BUSINESS_CONTRACT_MATRIX.md`.
