# Team Toggle (Men's/Women's) — Complete Build Plan

> **For agentic workers:** consolidated branch `feat/team-toggle-complete` (off `main`), merges #266 (switcher) + #267 (LPGA) + #268 (onboarding). Execute phases in order. No prod merge / no prod migration without explicit user go.

**Goal:** Make the program men's/women's team toggle correct & complete across backend scoping, RLS, onboarding/data-model, and UI — every coach surface re-scopes to the active team; the men's/women's wall is staff-scoped.

**Source audit:** 4-agent audit (task wp4dbnq6m), 2026-06-12. Findings reproduced inline per phase.

## Decisions (from user, 2026-06-12)
- **Team wall = staff-scoped.** A coach sees a team only if staffed on it (`golf_team_coach_staff`). A director-of-golf staffed on BOTH sees both. An assistant staffed on men's-only must NOT see women's. → tighten `golf_players_select` + `golf_rounds_update_team` RLS to staff membership; make `validateCoachTeamAccess` staff-strict.
- **Full consolidated build now** (Phases A–E on one branch).

## Deploy order (interdependence)
#268 data model + backfill must precede the switcher being usable (switcher needs head_coach+is_primary staff rows). #266 women's view shows wrong standards until #267. So: ship as ONE unit.

## Prod migrations required (STAGE for user approval — do NOT apply):
1. `20260610160000_program_onboarding_backfill.sql` (#268)
2. `20260610170000_seed_lpga_standards.sql` (#267, renumbered from 160000 — collision fix DONE)
3. NEW: `UNIQUE(organization_id, gender) WHERE gender IS NOT NULL` partial index on golf_teams
4. NEW: RLS — staff-scope `golf_players_select` + `golf_rounds_update_team`; REVOKE anon EXECUTE on team predicates
5. (gender column `20260607160000` already live on prod)

---

## Phase A — Data model + migrations (foundational; do first)

- [ ] A1: Renumber LPGA seed 160000→170000. **DONE** (commit 0f2ff302).
- [ ] A2: New migration — partial UNIQUE index `golf_teams_org_gender_uidx ON golf_teams(organization_id, gender) WHERE gender IS NOT NULL`. One program = at most one mens + one womens.
- [ ] A3: Fix `is_primary` lock-out. `addSecondTeam` writes `is_primary=false` → head coach fails `is_golf_team_primary_coach(team_id)` for the 2nd team → locked out of staff/CoachHelm-settings mgmt on their own women's team. FIX: introduce `is_golf_team_head_coach(team_id)` (role='head_coach') and use it for the management policies (`golf_team_coach_staff_insert`, `team_chs_settings_write_team`); keep is_primary for default-team selection only. (New migration.)
- [ ] A4: `addSecondTeam` — catch 23505 unique violation instead of read-then-write gender pre-check (race fix); keep app pre-check as UX fast-path; assert `newTeam.organization_id === coach.organization_id` before privileged insert.
- [ ] A5: `createTeam` (legacy path) — add gender param + same org+gender conflict check, OR deprecate it so onboarding+addSecondTeam are the only create routes.
- [ ] A6: `completeCoachOnboarding` — add org+gender conflict validation (not just addSecondTeam).

## Phase B — One resolver everywhere (the big sweep)

Replace every `golf_teams.eq('organization_id', coach.organization_id).single()/.maybeSingle()` and every direct `resolveCoachTeamId` call in **server actions** with `resolveCoachTeamIdWithCookie` (server) — kill every `.single()/.maybeSingle()` on org-team lookups (they THROW on 2-team orgs).

P0 functional breaks (throw/null on 2-team orgs):
- [ ] B1: `stats.ts` (~205,294,348,404) — 4 sites, `.single()` → throws.
- [ ] B2: `recruiting.ts:~118` `resolveCoachAndTeam` — `.maybeSingle()` → null → "No team found".
- [ ] B3: `tasks.ts` (~420,557) — `.single()` → throws.

P1 cookie-blind (wrong-team, no error):
- [ ] B4: `stats-data.ts` (~1667-1686)
- [ ] B5: `stats-intelligence.ts` (165,308)
- [ ] B6: `team-category-insights.ts` (322,650)
- [ ] B7: `intelligence-dashboard.ts` (196-199,239)
- [ ] B8: `coachhelm-data.ts` (758 getTeamSimulation, ~289,929)
- [ ] B9: `travel.ts` (244,361)
- [ ] B10: `documents.ts` verifyTeamAccess (50-56)
- [ ] B11: `communication.ts` (167-185)
- [ ] B12: `alerts.ts` (376)
- [ ] B13: `development.ts` (76-85)
- [ ] B14: `attendance.ts` (org-derived team)
- [ ] B15: `messages.ts` → `src/app/actions/messages.ts` broadcast team resolution
- [ ] B16: `v3/goals.ts` (91-99)
- [ ] B17: `dashboard-data.ts` (225,1020) — ensure cache key includes teamId
- [ ] B18: CI lint guard — forbid new `eq('organization_id', ...)` team lookups in `src/app/golf/actions/**` outside resolve-team-server.ts.

> NOTE: confirm the full list via grep (below) — audit said ~57 files; enumerate ALL, don't trust the sample.

## Phase C — RLS tightening (staff-scoped wall) — NEW migration(s)
- [ ] C1: `validateCoachTeamAccess` — remove org fallback; require explicit golf_team_coach_staff row (keep org fallback ONLY for zero-staff legacy coaches, made dead by #268 backfill). Fix SECURITY contract comment.
- [ ] C2: `golf_players_select` — replace `user_is_coach_of_golf_player` org join with a join through golf_team_coach_staff (staffed-team scope). Program-head on both still sees both.
- [ ] C3: `golf_rounds_update_team` — replace org-scoped USING with `is_golf_team_coach(team_id)`.
- [ ] C4: Clear `golf_active_team` cookie on logout — shared signOut server action; call from FairwayDashboardShell:261, login:73, settings:205, session-activity:90, admin:363.
- [ ] C5: REVOKE EXECUTE ON FUNCTION is_golf_team_coach/is_golf_team_player/is_golf_team_primary_coach/is_golf_team_head_coach/user_is_coach_of_golf_player FROM anon, PUBLIC; grant authenticated + service_role only.

## Phase D — UI / cohort gaps
- [ ] D1: Recruiting HQ — recruiting/page.tsx cookie-aware (remove static revalidate=60 / make dynamic).
- [ ] D2: `rounds/[id]/review/page.tsx` — migrate to resolveCoachTeamIdWithCookie.
- [ ] D3: Messages — add visible team filter/badges (conversations stay user-scoped) so dual-team head coach can tell which team a chat belongs to.
- [ ] D4: `loadPlayerCohort` (player-cohort-loader.ts) — replace `.maybeSingle()` with deterministic select+pick (mirror resolveCoachTeamId).

## Phase E — Tests + guards
- [ ] E1: 2-team program regression matrix — after setActiveTeam(womensId), EACH coach surface returns women's data & `.single()` never throws.
- [ ] E2: Authorization test — coach staffed on team X only, forge cookie to sibling team Y (same org): roster/rounds/events/qualifiers/messages/insights = 0 rows / denied. Cross-org always denied.
- [ ] E3: Role-aware switcher invariant — assistant on >1 team → canSwitch=false; setActiveTeam refuses; assistant can't read other team's roster after RLS tightening.
- [ ] E4: is_primary/head-coach — program head can manage BOTH teams (staff + CoachHelm settings).
- [ ] E5: addSecondTeam concurrent duplicate-gender rejected; join codes route to exact gendered team.
- [ ] E6: women's player gets women's/LPGA anchors end-to-end.
- [ ] E7: grep/lint gate — no coach dashboard route imports org-only resolveCoachTeamId.

## Verification gate (before declaring done)
`npm run typecheck` + `npm run lint` + relevant vitest green. Full `next build` excluded (file-cap fails locally). Visual/iOS QA = human.
