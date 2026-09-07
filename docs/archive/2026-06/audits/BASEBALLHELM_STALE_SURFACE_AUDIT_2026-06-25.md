# BaseballHelm Stale Surface Audit - 2026-06-25

## Scope

Focused on BaseballHelm stale rendering and `njrini99@gmail.com` account gaps.

## Fixed in this pass

- Completed-account redirects no longer send coaches to `/baseball/coach/{type}` or players to `/baseball/player/{type}`.
- `/baseball/coach/{college,high-school,juco,showcase}` now redirects to `/baseball/dashboard/command-center`.
- `/baseball/player/{college,high-school,juco,showcase}` now redirects to `/baseball/player/today`.
- `/baseball/dashboard/team` now redirects coaches to Command Center and players to Player Today.
- `/baseball/dashboard/team/high-school` now redirects to Command Center.
- Removed orphaned legacy dashboard cluster:
  - `src/hooks/use-baseball-dashboard.ts`
  - `src/lib/queries/baseball-dashboard.ts`
  - `src/app/baseball/(dashboard)/dashboard/team/TeamDashboardClient.tsx`
  - `src/app/baseball/(dashboard)/dashboard/team/JucoTeamDashboard.tsx`
  - `src/app/baseball/(dashboard)/dashboard/team/JucoPlayerDashboard.tsx`
  - `src/app/baseball/actions/player-dashboard.ts`
  - `src/app/baseball/actions/team-dashboard.ts`
- Replaced old dashboard-card type imports with `src/components/baseball/dashboard/dashboard-types.ts`.
- Fixed stale `/dashboard/messages` back link to `/baseball/dashboard/messages`.
- Fixed stale `/dashboard/roster` and `/dashboard/videos` team-card pushes.
- Removed fake/random high-school dev-plan progress by routing progress through `buildDevPlanProgress`.
- Command Center no longer self-loops for non-college coaches.

## Still real account data gaps

Live account/team checked:

- Coach email: `njrini99@gmail.com`
- Team: `Rini University Baseball`
- Team id: `2acc63ce-1c29-5c57-b75b-93427a35720e`

Seeded:

- `baseball_team_members`: 14
- `baseball_games`: 8
- `baseball_events`: 3
- `baseball_practices`: 1
- `baseball_practice_blocks`: 4
- `baseball_practice_attendance`: 14
- `baseball_coach_insights`: 2
- `baseball_player_timeline_events`: 2
- `baseball_lift_assignments`: 28
- `baseball_lift_results`: 14
- `baseball_readiness_checkins`: 14
- `helm_lifting_athletes`: 14
- `helm_lifting_programs`: 1
- `helm_lifting_sessions`: 56
- `helm_lifting_session_exercises`: 98
- `helm_lifting_set_results`: 182
- `helm_lifting_readiness_checkins`: 14

Missing or empty (status as of this audit — 2026-06-25):

- `baseball_strength_groups`: 0
- `baseball_tasks`: 0
- `baseball_conversations`: 0
- `baseball_conversation_participants`: 0
- `baseball_messages`: 0
- `baseball_videos`: 0
- `baseball_import_sources`: 0
- `baseball_import_runs`: 0
- `baseball_stat_uploads`: 0
- `baseball_seasons`: 0
- `baseball_player_stats`: 0
- `baseball_player_aggregates`: 0
- `baseball_developmental_plans`: 0

### Update (#414) — now seeded by `scripts/seed-baseball-surfaces-demo.ts`

Every table listed above (plus `baseball_task_assignments` and
`baseball_strength_group_members`, the join tables for `baseball_tasks` and
`baseball_strength_groups`) is now populated for the demo team by the
Phase-3 dependent seed script. Full per-table contract (row shapes, route
mapping, schema caveats): `docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md`.
Run order: `seed-baseball-demo.ts` (Phase 1) → `seed-baseball-lifting-demo.ts`
(Phase 2) → `seed-baseball-surfaces-demo.ts` (Phase 3). Verify with
`scripts/verify-baseball-demo-coverage.ts`.

This closes the coverage gap for the **demo team** specifically. It does not
seed the live `njrini99@gmail.com` / "Rini University Baseball" account
referenced above — these scripts are scoped exclusively to the Phase-1 demo
org/team/coach/roster ids and never touch any other team.

The following surfaces remain intentionally empty (not a coverage gap — see
the contract doc's "Intentionally-empty surfaces" section for the full
rationale):

- `baseball_recruiting_interests`, `baseball_watchlists` — the demo team is
  a college roster; college players never activate recruiting.
- `baseball_decision_log`, `baseball_meeting_items`, `baseball_signals`,
  `baseball_actions` — Decision Room is a separate workflow, out of scope
  for this pass.
- `baseball_video_events` — the staff-anchored film-tagging queue, distinct
  from the player-uploaded `baseball_videos` library this pass seeds.

## Remaining stale-risk surfaces

These are not fixed here, but are the next likely old-render/stale-product pockets:

- Dashboard leaf routes that are still client-side `useAuth()` + direct Supabase pages rather than server `getActiveBaseballContext()` read-model pages:
  - `/baseball/dashboard/academics`
  - `/baseball/dashboard/announcements`
  - `/baseball/dashboard/camps`
  - `/baseball/dashboard/compare`
  - `/baseball/dashboard/dev-plan`
  - `/baseball/dashboard/dev-plans`
  - `/baseball/dashboard/events`
  - `/baseball/dashboard/profile`
  - `/baseball/dashboard/program`
  - `/baseball/dashboard/roster`
  - `/baseball/dashboard/settings`
  - `/baseball/dashboard/tasks`
  - `/baseball/dashboard/teams`
  - `/baseball/dashboard/travel`
- Command Center still renders `CommandCenterClient` from an older page assembly instead of the newer `getCommandCenter` read model.
- The demo seed script is partial and does not populate messages, videos, tasks, imports, seasons, strength groups, player stats/aggregates, or dev plans.

## Verification

- `npx tsc --noEmit --incremental false`
- `node --test scripts/__tests__/cmd-k-coverage.test.mjs`
- `npx vitest run --project unit src/lib/baseball/__tests__/program-type-nav-variants.test.ts src/lib/baseball/__tests__/dev-plan-progress.test.ts`
- `git diff --check`
