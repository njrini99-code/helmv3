# BaseballHelm Feature Registry

> Route/feature inventory + data flows for the BaseballHelm product (college/JUCO/HS/showcase baseball recruiting + team/player ops + Helm Lifting Lab).
> Traced from source on branch mirroring origin/main, 2026-06-30. Cross-checked against `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`, `docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md`, and `docs/operations/BASEBALL_STATS_SOURCE_OF_TRUTH.md`.
> POINT-IN-TIME: BaseballHelm is under active rework — trust DB enums/RLS as ground truth; treat route/behavior detail as current-state, not a frozen contract.
> Companion: `memory/context/baseballhelm-workflows.md` (step-by-step journeys), `memory/context/baseballhelm-database.md` (schema). Table names: `memory/glossary.md`.

## Status legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Route renders + wired to a real read model/action with test coverage |
| ⚠️ | Renders + wired to real data, but has an open correctness/security/coverage gap (see `BASEBALLHELM_FEATURE_READINESS_MATRIX.md`) |
| 🅟 | "route-only" — action layer exists, no feature-specific test |
| ❌ | Scaffold/redirect stub only |

Per the readiness matrix (2026-07-15 sync): **14 of 22 features `ready`; 7 `partial`, 0 route-only, 1 hidden, 0 needs-decision.** The 2026-06-30 numbers this line used to cite are stale — see `docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md` for the current, file-cited per-row grade. Treat everything as production-capable; most of it is now also production-blessed by that matrix's own bar.

---

## Architecture

- **Framework**: Next.js 16 App Router, TypeScript strict. Shared Supabase project with **live GolfHelm production** — every baseball change is additive; tables are `baseball_*` / `helm_lifting_*` prefixed (never touch `golf_*`).
- **Auth/session**: `getSessionProfile()` (`src/lib/auth/session.ts`) server-side; `useBaseballAuth()` (`src/hooks/use-baseball-auth.ts`) client-side (Zustand persisted-profile fast path — readiness-matrix issue #416).
- **Active team context**: `getActiveBaseballContext()` (`src/lib/baseball/active-context.ts`) resolves `{activeRole, activeTeamId, activePlayerId, activeCoachId, ...}` from a server-validated cookie; `src/lib/baseball/resolve-team.ts` handles multi-team orgs (never `.single()` on multi-row; honors `baseball_teams.default_team_id` → active-member-count → `created_at`).
- **Server action wrapper**: `withBaseballAction(fn, { featureArea, requiredCapability?, requiredPlayerAccess? })` (`src/lib/baseball/with-baseball-action.ts`) — the canonical guard: resolves user → coach/player profile → active team → membership → capability before running. Not every action uses it yet (legacy split).
- **Navigation**: grouped "hubs" (`src/app/baseball/(dashboard)/_components/hub-definitions.ts`) + `src/lib/baseball/nav-registry.ts` / `nav-manifest.ts` / `nav-context.ts`. Coach hubs: Team, Stats, Development, Management, Recruiting (archived-hidden by default), Academics (JUCO-only). Player hubs: Stats, Development, Team.
- **Three shell layouts** (drift, P1 cleanup): `(dashboard)/layout.tsx` (both roles, team-presence UX guard only), `(coach-dashboard)/coach/layout.tsx`, `(player-dashboard)/player/layout.tsx`.

---

## Route Inventory

Route groups in parens are stripped from URLs. "Access" = who the route is intended for. Server page guards live in `src/lib/baseball/server-route-guards.ts` (`requireBaseballCoachRoute`, `requireRecruitingCoachRoute` = college/juco/showcase coach + recruiting program types, `requireShowcaseOrgRoute`, `requireAcademicsCoachRoute` = juco-only, `requireBaseballPlayerRoute`). The `(dashboard)/layout.tsx` guard is a UX team-presence check, **not** an access boundary — real protection is server-side per page via `withBaseballAction` + capability + RLS.

### Auth
| Route | Purpose | Access | Key file(s) |
|-------|---------|--------|-------------|
| `/baseball` | Landing; redirects auth'd coach→command-center, player→today, else→login | public | `src/app/baseball/page.tsx` |
| `/baseball/login` | Login, role-aware redirect | public | `(auth)/login/page.tsx` |
| `/baseball/signup` | Signup with role cards (create program / join staff / join player) | public | `(auth)/signup/page.tsx` |
| `/baseball/complete-signup` | Invite-context/OAuth profile completion | authed (no profile) | `(auth)/complete-signup/CompleteSignupClient.tsx` |
| `/baseball/forgot-password` `/baseball/reset-password` | Password recovery (does not reveal if email exists) | public | `(auth)/forgot-password`, `/reset-password` |
| `/baseball/demo` | Demo login gate (signs visitor into one shared demo coach — issue #392) | public | `(auth)/demo/page.tsx`, `actions/demo-access.ts` |

### Onboarding
| Route | Purpose | Access | Key file(s) |
|-------|---------|--------|-------------|
| `/baseball/coach-onboarding` | Real coach program-creation wizard (type→program→account→plan→lifting→complete) | authed coach | `(onboarding)/coach-onboarding/page.tsx` |
| `/baseball/coach` | Legacy stub → redirects to `/baseball/coach-onboarding` | coach | `(onboarding)/coach/page.tsx` |
| `/baseball/player` | Player onboarding wizard (type→about→measurables→team→complete) | authed player | `(onboarding)/player/page.tsx` |

### Coach dashboard (coach/staff)
| Route | Purpose | Access | Key file(s) |
|-------|---------|--------|-------------|
| `/baseball/dashboard` | Server role dispatcher (coach→command-center, player→today) | shared | `(dashboard)/dashboard/page.tsx` |
| `/baseball/dashboard/command-center` | Coach 20-sec cockpit: risk feed, roster pulse, today's events, daily contracts | coach/staff | `command-center/page.tsx`; `read-models/command-center.ts` |
| `/baseball/dashboard/signals` | CoachHelm signal inbox (feed/compact/grouped/board) | coach/staff | `actions/signals.ts`, `operational-signals.ts` |
| `/baseball/dashboard/roster` | Team roster (staff-only read model) | coach/staff | `roster/page.tsx`; `read-models/roster.ts`; `actions/roster.ts` |
| `/baseball/dashboard/players/[id]` | Coach's primary player profile (legacy-layer reads) | coach/staff | `players/[id]/page.tsx` |
| `/baseball/dashboard/players/[id]/profile` | Second/lighter profile card view (season-stats only) — **duplicate-surface drift** | coach/staff | `players/[id]/profile/page.tsx` |
| `/baseball/dashboard/players/[id]/stats` | Player season stats + game logs (canonical box-score layer) | coach/staff | `players/[id]/stats/page.tsx`; `actions/games.ts` |
| `/baseball/dashboard/players/[id]/passport` | Coach view of player recruiting/dev passport | coach/staff | `players/[id]/passport/page.tsx`; `read-models/player-passport.ts` |
| `/baseball/dashboard/players/[id]/scout-packet` (+`/preview`) | Manage/preview scout-packet share links | staff `can_export_reports`\|head | `players/[id]/scout-packet/page.tsx`; `actions/scout-packet.ts` |
| `/baseball/dashboard/stats` | Redirect → `/stats-center` | shared | `stats/page.tsx` |
| `/baseball/dashboard/stats-center` | 11-view Stats Lab (staff-only) | coach/staff | `read-models/stats-center.ts` |
| `/baseball/dashboard/stats/games` (+`/[gameId]`, `/games/new`, `/season`, `/upload`) | Game logs, box-score entry, season, legacy CSV upload | coach/staff | `actions/games.ts`, `stats.ts` |
| `/baseball/dashboard/import` | 11-step import dossier (source trust) | staff `can_manage_imports` | `actions/imports.ts`, `stat-event-imports.ts` |
| `/baseball/dashboard/videos` (+`/[id]`, `/[id]/edit`) | Video evidence library | coach/staff | `actions/videos.ts`, `video-classes.ts` |
| `/baseball/dashboard/performance` (+`/builder`,`/groups`,`/live`,`/programs`,`/programs/[id]`,`/players/[id]`) | Helm Lifting Lab entry (strength coach) | staff `can_manage_lifting`/`can_view_readiness` | `actions/lifting-v11.ts`, `lift-builder.ts`; `read-models/performance-command.ts` |
| `/baseball/dashboard/practice` (+`/practice-effectiveness`) | Practice planner + scrimmage; effectiveness review | coach/staff `can_manage_practice` | `actions/practice.ts`, `practice-effectiveness.ts` |
| `/baseball/dashboard/decision-room` | Staff Decision Room (signal→agenda→decision ledger) — tables `baseball_meeting_items`/`baseball_decision_log` confirmed **applied to prod** (2026-07-09); the "unapplied migration" tag is stale, remaining gap is stale type-cast comments + missing read-model test coverage | coach/staff | `actions/decision-room.ts`; `read-models/decision-room/*` |
| `/baseball/dashboard/postgame` | Postgame action review (9 evidence areas, not narrative) | coach/staff | `actions/postgame.ts`; `read-models/postgame.ts` |
| `/baseball/dashboard/analytics` | Reports / transfer-to-baseball / export | coach/staff | `analytics/AnalyticsClient.tsx` |
| `/baseball/dashboard/dev-plans` (+`/[id]`) | Coach dev-plan list/detail | coach/staff | `actions/dev-plans.ts` |
| `/baseball/dashboard/calendar` | Team calendar/events | shared | `actions/calendar.ts`; `calendar/BaseballCalendarWrapper.tsx` |
| `/baseball/dashboard/events` | Events management (bypasses server actions — P1-9) | coach/staff | `events/EventsClient.tsx` |
| `/baseball/dashboard/announcements` | Announcements | shared | `actions/announcements.ts` |
| `/baseball/dashboard/tasks` | Tasks | shared | `actions/tasks.ts` |
| `/baseball/dashboard/documents` | Document library — #393 (public URLs + caller-supplied scope) is closed and verified: every write is capability-gated (`requireBaseballCapability(teamId, 'can_manage_documents')`, resolved from the existing row not caller input) and URLs are `createSignedUrl` (1hr TTL), not public; now has 24 direct capability/signed-URL regression assertions (`documents-write-capability.test.ts`) | shared | `actions/documents.ts` |
| `/baseball/dashboard/travel` | Travel itineraries + expenses | coach/staff | `actions/travel.ts` |
| `/baseball/dashboard/academics` | Academic eligibility (JUCO hub) | coach/staff (JUCO) | `actions/academics.ts`; `AcademicsClient.tsx` |
| `/baseball/dashboard/camps` (+`/[id]`) | Camps + registrations | coach/staff | `actions/camps.ts` |
| `/baseball/dashboard/program` `/organization` `/teams` | Program/org/team management | coach/staff | `actions/teams.ts`, `program-settings.ts` |
| `/baseball/dashboard/settings/**` (philosophy, privacy, recruiting-preferences, imports, staff, roles, season, program, integrations, …) | Settings OS | coach/staff (subpage-gated) | `settings/**`; `actions/program-settings.ts`, `staff.ts`, `roles-permissions.ts` |
| `/baseball/dashboard/settings/notifications` | **hidden**: `permanentRedirect` → `/settings/program#notifications` | — | `settings/notifications/page.tsx` |

### Recruiting (coach — college/JUCO/showcase only; `requireRecruitingCoachRoute`)
| Route | Purpose | Access | Key file(s) |
|-------|---------|--------|-------------|
| `/baseball/dashboard/pipeline` | 5-stage recruiting Kanban (drag between stages) — stage vocabulary now matches the DB enum; the old "renders 7 columns, DB enum has 5" claim is stale (`stages.ts` dropped `contacted`/`campus_visit`; board renders 4 active-stage columns + `uninterested` handled separately) | recruiting coach | `pipeline/PipelineClient.tsx`; `hooks/use-watchlist.ts`; `actions/watchlist.ts` |
| `/baseball/dashboard/discover` | Prospect search/filter | recruiting coach | `discover/DiscoverClient.tsx`; `actions/discover.ts` |
| `/baseball/dashboard/watchlist` | Watchlist table (add/remove/notes/priority/stage) | recruiting coach | `watchlist/WatchlistPageClient.tsx` → `WatchlistClient.tsx`; `actions/watchlist.ts` |
| `/baseball/dashboard/compare` (+`/comparisons`) | Compare ≤4 players; saved comparisons | recruiting coach | `compare/CompareClient.tsx`, `compare/actions.ts` |
| `/baseball/dashboard/college-interest` | Coach view of who viewed/interested in their roster players (engagement telemetry) — coach-scoped; imports player gate hook by drift | coach/staff | `college-interest/CollegeInterestClient.tsx` |
| `/baseball/dashboard/colleges` | (player) browse colleges + toggle interest | player | `colleges/page.tsx`; `hooks/use-colleges.ts`; `actions/interests.ts` |
| `/baseball/dashboard/scout-packets` | Scout packet roster/link management | staff `can_export_reports` | `actions/scout-packet.ts` |
| `/baseball/dashboard/journey` | Player recruiting journey | player | `journey/page.tsx` → `hooks/use-journey.ts` (source table now verified: `baseball_players`/`baseball_recruiting_interests`/`baseball_player_engagement_events`, all real; reads are direct-client, not a server action — a Journey-vs-Pipeline vocabulary unification memo is open pending owner sign-off, see `docs/audits/BASEBALLHELM_PRODUCTION_VERDICT.md`) |
| `/baseball/dashboard/activate` | Player recruiting opt-in (blocks college players) | player (non-college) | `activate/page.tsx` |

### Player dashboard (mobile-first)
| Route | Purpose | Access | Key file(s) |
|-------|---------|--------|-------------|
| `/baseball/player/today` | Player "Today" home (events, tasks, lift, readiness, coach notes, passport) | player | `player/today/page.tsx`; `read-models/player-today.ts` |
| `/baseball/player/passport` | Player's own passport (visibility-controlled) | player (self) | `player/passport/page.tsx` |
| `/baseball/player/timeline` | Player's own timeline (self-only, viewer-filtered) | player (self) | `player/timeline/page.tsx`; `read-models/timeline.ts` |
| `/baseball/player/practice` | Player practice view | player | `player/practice/page.tsx` |
| `/baseball/dashboard/my-stats` | Player's own stats (legacy layer) | player | `my-stats/MyStatsClient.tsx`; `actions/stats.ts` |
| `/baseball/dashboard/dev-plan` (singular) | Player view of active dev plan | player | `dev-plan/page.tsx`; `actions/dev-plans.ts` |
| `/baseball/dashboard/lift` (+`/[sessionId]`) | Player lift execution (self) | player | `actions/player-today-lift.ts`; `read-models/player-lift.ts` |
| `/baseball/dashboard/readiness` | Player readiness/soreness check-in (self) | player | `actions/lifting.ts` (`submitReadinessCheckin`) |
| `/baseball/player/{college,high-school,juco,showcase}` | Legacy stubs → redirect `/baseball/player/today` | player | `player/*/page.tsx` |
| `/baseball/coach/{college,high-school,juco,showcase}` | Legacy stubs → redirect `/baseball/dashboard/command-center` | coach | `coach/*/page.tsx` |

### Public / staff / admin / API
| Route | Purpose | Access | Key file(s) |
|-------|---------|--------|-------------|
| `/baseball/player/[id]` | Public player profile (auth-checks + gates via `resolvePublicProfileAccess`) | public/gated | `(public)/player/[id]/page.tsx`; `lib/baseball/public-profile-access.ts` |
| `/baseball/packet/[token]` (+`/csv`) | Public scout packet by share token | public (token) | `(public)/packet/[token]/page.tsx`, `/csv/route.ts` (⚠️ #396 CSV returns 200 for invalid tokens) |
| `/baseball/program/[id]` `/team/[id]` | Public program/team pages | public | `(public)/program/[id]`, `team/[id]` |
| `/baseball/join/[code]` | Player team join via invite | authed player | `join/[code]/page.tsx`; `actions/teams.ts` |
| `/baseball/staff/join/[code]` | Staff invite acceptance | authed coach | `staff/join/[code]/page.tsx`; `actions/staff.ts` |
| `/baseball/admin/demo-sessions` | Demo session admin | admin | `admin/demo-sessions/page.tsx` |
| `/api/baseball/staff/context` | Staff active-context API | authed | `src/app/api/baseball/staff/context/route.ts` |

---

## Feature List (key data flows)

### 1. Recruiting Pipeline ⚠️
- Entry `/baseball/dashboard/pipeline` → `PipelineClient.tsx` (gated `requireRecruitingCoachRoute`).
- Data: client hook `useWatchlist()` reads `baseball_watchlists` **directly from the browser** (`.eq('coach_id', coach.id)`).
- **Two write paths for `pipeline_stage`** (drift): (a) Kanban drag → client-side `UPDATE baseball_watchlists SET pipeline_stage` (**bypasses `assertCoachCanRecruitPlayer`, RLS-only**); (b) table dropdown → `updateWatchlistStatus()` (capability-gated, ownership-verified, fires `notifyPipelineStageChange()`).
- **Stage vocabulary — FIXED**: live DB enum `baseball_pipeline_stage` = 5 (`watchlist, high_priority, offer_extended, committed, uninterested`), and `src/lib/recruiting/stages.ts` now declares exactly those 5 (the invalid `contacted`/`campus_visit` entries were removed). Label sources were also collapsed tonight (2026-07-15, PR #821): `getPipelineStageLabel()` (`src/lib/utils.ts`) and `WatchlistSchemas.updateStatus`'s zod enum both now derive from `PIPELINE_STAGES` instead of separately hand-copied maps — a real drift was found and fixed (`watchlist` was labeled "Prospects" in one copy and "Watchlist" in another; "Watchlist" won). One known duplicate remains: `src/components/ui/status-dot.tsx`'s `PipelineStatusDot` still carries a 5th, un-migrated copy of the label map (frozen file, likely-dead component, flagged for follow-up — not fixed by this pass). `getNextStage()` still has zero callers.

### 2. Prospect Search / Discover ⚠️
- `getDiscoverPlayers/Teams/…` (`actions/discover.ts`); `coachId`/`coachType` from client are **ignored** (re-derived server-side). Filters: state, gradYear, position, velo/exit ranges, hasVideo, search, teamType, page. Does **not** call `assertCoachCanRecruitPlayer` — re-implements the rules inline. **`profile_visibility` P0 is FIXED**: `getDiscoverPlayers`/`getStateCounts` now exclude `profile_visibility='private'` players at 4 call sites (search the file for the `P0 PRIVACY` comment tag), regression-tested by `discover-privacy.test.ts`. As of tonight (2026-07-15, PR #819) every export in this file also runs through `withBaseballAction` (previously only the guard-free `withAdminObserved`).

### 3. Watchlist / Compare ⚠️
- `actions/watchlist.ts` (`withBaseballAction` `can_manage_stats`): `addToWatchlist` (**calls `assertCoachCanRecruitPlayer`**, INSERT `baseball_watchlists {pipeline_stage:'watchlist',priority:0}` + engagement event + email), `removeFromWatchlist`, `updateWatchlistStatus/Priority`, `addWatchlistNote`, `toggleWatchlistPlayer`, `checkWatchlistStatus`. Compare fetches client-side (max 4); persistence → `baseball_player_comparisons`.

### 4. Player recruiting opt-in / College Interest ⚠️
- Activate (`/activate`): blocks `player_type==='college'`; `handleActivate()` = **direct client** `UPDATE baseball_players SET recruiting_activated=true`. This boolean is the master gate consumed by `recruitability.ts`, `discover.ts`, `public-profile-access.ts`.
- College browse (player): `actions/interests.ts` → `baseball_recruiting_interests`.
- College Interest (coach): reads `baseball_player_engagement_events` for own roster. **Anonymized vs identified** computed by `isAnonymous = !event.coach_id`; every app writer hardcodes `is_anonymous:false` with a `coach_id`, so the anonymous branch is currently unreachable — `is_anonymous` is effectively a dead column (contradicts the CLAUDE.md "anonymous before activation" model, which keys on activation state, not missing coach_id).

### 5. Player Peek / Scout Packets / Public Profile ⚠️
- Player Peek (`getPlayerPeekData`): INSERTs `profile_view` engagement event; **needs-decision #5**: no team/recruiting-relationship assertion — any authed coach can peek any player by id.
- Scout Packets (`actions/scout-packet.ts`, `can_export_reports`): `mintScoutPacketLink` (gated on passport `visibility_state` + program flags), `revokeScoutPacketLink` (non-destructive), `resolveScoutPacketByToken` (**unauthenticated**, admin client, explicit fail states). CSV has an injection guard but #396 (200 on invalid token).
- Public profile: `resolvePublicProfileAccess` reasons `self|staff|public|not_found|recruiting_off|college_player|profile_private|program_disabled|coaches_only` (+ a program-level `public_profiles_enabled` gate absent from `recruitability.ts`).

### 6. Roster / Team Management ✅/⚠️
- `getRoster(activeTeamId)` (**staff-only**) reads `baseball_team_members`⋈`baseball_players` + `baseball_player_aggregates`. `actions/roster.ts` (`can_manage_roster`): `assignPlayerToTeam` (UPSERT on `(team_id,player_id)`, non-destructive + timeline event), `removePlayerFromTeam` (scoped single-row DELETE). Teams/staff: `processTeamInvitation` (atomic RPC `try_redeem_baseball_team_invitation`), `inviteStaff`/`acceptStaffInvite` (SECURITY DEFINER RPC `baseball_accept_staff_invite`), `removeStaff` (non-destructive `status='removed'`; head coach protected).

### 7. Player Profile ⚠️
- Coach primary reads `baseball_players`, `baseball_player_stats` (legacy), `baseball_player_aggregates` (legacy), `baseball_coach_insights`, `baseball_videos` + 4 read-models. Coach notes (`actions/coach-notes.ts`): `createCoachNote({scope})`, soft-delete, deterministic `summarizeCoachNotes`. **Visibility enum = 6 scopes** (`BaseballNoteScope`: `staff_public|coach_group|strength|academic|player_visible|hidden_from_player`) — the canonical-spec "staff/performance_staff/head_coach_only" is stale.

### 8. Stats / Performance (three-layer model) ⚠️
Authoritative: `docs/operations/BASEBALL_STATS_SOURCE_OF_TRUTH.md` + `stat-layer-manifest.ts` + `__tests__/stat-layer-contract.test.ts`.
- **Layer 1 (legacy, DEPRECATED, grandfathered reads only)**: `baseball_player_stats`, `baseball_player_aggregates`.
- **Layer 2 (CANONICAL)**: `baseball_games`, `baseball_box_score_batting/_pitching` → RPC `recalculate_baseball_season_stats` → `baseball_player_season_stats`. **Writer risk**: `saveBoxScoreBatting/Pitching` do unwrapped DELETE-then-INSERT (data-loss on partial failure) but are **UI-dead**; live path is `saveFullBoxScore` → atomic RPC `save_baseball_full_box_score`.
- **Layer 3 (CANONICAL, elite)**: `baseball_pitch_events`, `baseball_batted_ball_events`, `baseball_swing_events` (+ `baseball_stat_sources`); ~22 v10 chart families with sample-size honesty.

### 9. Performance / Helm Lifting Lab ⚠️
- Staff-gated `can_manage_lifting`/`can_view_readiness`; players self-only. `lifting-v11.ts` (30 exports: groups/programs/publish/session lifecycle), `lift-builder.ts` (stage-and-swap). Model migrated legacy `baseball_lift_*` → unified `helm_lifting_*` ("W2 REWIRE"); baseball reads via adapter. `baseball_lift_*` kept read-only legacy (dual-schema — see database G1).

### 10. CoachHelm AI / Signals ⚠️
- Engine `src/lib/coachhelm/baseball/`; harness `engine-run.ts` (`runBaseballEngineCore` — master AI switch OFF short-circuits before any DB read). Promotion: only `medium/high/urgent` promote to a `baseball_signals` triage row; `low` never. `sample_n < 6` → `disposition:'sample_too_small'`. Tables: `baseball_coach_insights`, `baseball_signals`, `baseball_actions`, `baseball_ai_audit`. **Decision Room** writes `baseball_meeting_items`/`baseball_decision_log` — both tables exist (migrations `20260624000230`/`20260624000310`) and are **confirmed applied to prod** (2026-07-09, via `list_migrations`); the `LooseClient` cast + code comments claiming "unapplied migration" are now stale and need a `db:types` regen cleanup, but the tables and their staff-only RLS are real and live.

### 11–18 (concise)
- **Messaging** ✅ — `actions/messages.ts` is a 7-line shim → shared `src/app/actions/messages.ts` (`sport` param dispatches tables `baseball_conversations`/`_messages`/`_notifications`).
- **Calendar/Events** ⚠️ — `createBaseballEvent` → INSERT `baseball_events` (+ conditional `baseball_event_attendance`, + conditional `baseball_games`); Events page bypasses server actions (P1-9). The player calendar team-resolution bug (#368) and un-normalized mutation guards (#369) are both **closed and verified** (2026-07-09) — stale reference removed.
- **Announcements** ✅ — uses `content` + `created_by_id` (the canonical-spec P0-3 "golf column" bug is FIXED). Tables `baseball_announcements`/`_recipients`/`_acknowledgements`.
- **Tasks/Travel/Academics/Documents** — `baseball_tasks`+`_task_assignments`; `baseball_travel_itineraries`/`_expenses`; `baseball_player_classes`/`_academic_eligibility`; `baseball_documents`/`_document_versions` (⚠️#393).
- **Dev Plans** ✅ — player `getActiveDevPlan` uses `.in('status',['sent','in_progress'])` (canonical-spec P0-4 "`.eq('status','active')`" bug is FIXED). Table `baseball_developmental_plans`.
- **Onboarding** ⚠️ — coach `runCompleteCoachOnboardingCore` writes users→organizations→baseball_coaches→baseball_teams→baseball_team_coach_staff; **default player/lifting group seeding NOT implemented**. Player `handleComplete` = direct client `.update('baseball_players')` (not the hardened upsert) — silently no-ops if no row exists.
- **Command Center / Player Today** ⚠️ — `getCommandCenter` (staff-only) riskFeed/rosterPulse/todayEvents; `getPlayerToday` assignments/readiness/tasks/notes with honest empty states.

---

## Access-Control Gates

Core gate: **`assertCoachCanRecruitPlayer(supabase, coachId, coachType, playerId)`** (`src/lib/baseball/recruitability.ts`). Reasons: `player_not_found | recruiting_off | college_player | coach_type_mismatch | on_own_roster | not_on_discoverable_team | profile_private`. Allowed only if ALL: coachType not HS/showcase; player exists; `player_type != 'college'`; `recruiting_activated === true`; JUCO-coach not recruiting a JUCO player; `profile_visibility != 'private'`; player not on the coach's own roster; player on a discoverable team (org type ∈ {high_school, showcase, juco}).

**Three parallel implementations** of "can this coach see/act on this player": `recruitability.ts` (write-time), `discover.ts` inline (query-time — no longer omits `profile_visibility`; the P0 gap is fixed, see Feature 2 above), `public-profile-access.ts` (adds `public_profiles_enabled`). Still three separate implementations to keep in sync — real drift risk remains even though the worst instance of it is fixed.

**Player-record access**: `player-record-access.ts` / `player-access-policy.ts`; `updateMyPlayerProfile` writes only against server-resolved `ctx.activePlayerId` (client-supplied id ignored); `EDITABLE_PROFILE_FIELDS` whitelist drops `team_id`/`recruiting_activated`/`id`. Read models enforce viewer role as defense-in-depth on top of RLS.

**Capabilities**: `capabilities.ts` + `capability-groups.ts` — `baseball_team_coach_staff` boolean matrix (`can_manage_lifting`, `can_view_readiness`, `can_manage_practice`, `can_manage_stats`, `can_manage_imports`, `can_view_private_notes`, `can_view_academics`, `can_manage_roster`, `can_invite_staff`, `can_export_reports`, `can_message_players`, `can_manage_settings`). Staff active-status + `scope_player_ids` isolation findings (#405/#406) are both **closed and fixed at the RLS layer** (`is_baseball_team_staff()`/`can_view_baseball_player()` both hardened, applied to prod); #406's own acceptance-criteria pgTAP isolation test landed 2026-07-15 (`supabase/tests/rls/baseball_scope_player_ids_isolation.sql`).

**Spec drift to know**: `useTeamRouteProtection` (named in the canonical spec P0-7) does NOT exist — only `usePlayerRecruitingGate` does.
