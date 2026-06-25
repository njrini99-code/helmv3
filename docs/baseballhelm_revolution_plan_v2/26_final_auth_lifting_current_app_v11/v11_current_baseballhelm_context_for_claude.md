# V11 Current BaseballHelm Context For Claude

Claude must build inside the existing `Downloads/helmv3` app. Do not treat the zip as a greenfield product plan.

Current local app:

```text
/Users/ricknini/Downloads/helmv3
```

Current plan package:

```text
/Users/ricknini/Downloads/baseballhelm_revolution_plan_v2_ultracode_ready/docs/baseballhelm_revolution_plan_v2
```

## What The Current Baseball App Already Has

The current app already contains many BaseballHelm surfaces. Claude should improve and extend these instead of recreating them.

### Auth Routes

```text
src/app/baseball/(auth)/login/page.tsx
src/app/baseball/(auth)/signup/page.tsx
src/app/baseball/(auth)/forgot-password/page.tsx
src/app/baseball/(auth)/reset-password/page.tsx
src/app/baseball/(auth)/complete-signup/page.tsx
src/app/baseball/(auth)/complete-signup/CompleteSignupClient.tsx
```

### Onboarding Routes

```text
src/app/baseball/(onboarding)/coach-onboarding/page.tsx
src/app/baseball/(onboarding)/coach/page.tsx
src/app/baseball/(onboarding)/player/page.tsx
```

### Role-Specific Dashboard Routes

```text
src/app/baseball/(coach-dashboard)/coach/college/page.tsx
src/app/baseball/(coach-dashboard)/coach/high-school/page.tsx
src/app/baseball/(coach-dashboard)/coach/juco/page.tsx
src/app/baseball/(coach-dashboard)/coach/showcase/page.tsx
src/app/baseball/(player-dashboard)/player/college/page.tsx
src/app/baseball/(player-dashboard)/player/high-school/page.tsx
src/app/baseball/(player-dashboard)/player/juco/page.tsx
src/app/baseball/(player-dashboard)/player/showcase/page.tsx
```

### Main Dashboard Routes

```text
src/app/baseball/(dashboard)/dashboard/page.tsx
src/app/baseball/(dashboard)/dashboard/command-center/page.tsx
src/app/baseball/(dashboard)/dashboard/team/page.tsx
src/app/baseball/(dashboard)/dashboard/teams/page.tsx
src/app/baseball/(dashboard)/dashboard/roster/page.tsx
src/app/baseball/(dashboard)/dashboard/profile/page.tsx
src/app/baseball/(dashboard)/dashboard/settings/page.tsx
src/app/baseball/(dashboard)/dashboard/stats/page.tsx
src/app/baseball/(dashboard)/dashboard/my-stats/page.tsx
src/app/baseball/(dashboard)/dashboard/calendar/page.tsx
src/app/baseball/(dashboard)/dashboard/events/page.tsx
src/app/baseball/(dashboard)/dashboard/announcements/page.tsx
src/app/baseball/(dashboard)/dashboard/tasks/page.tsx
src/app/baseball/(dashboard)/dashboard/documents/page.tsx
src/app/baseball/(dashboard)/dashboard/travel/page.tsx
src/app/baseball/(dashboard)/dashboard/academics/page.tsx
src/app/baseball/(dashboard)/dashboard/videos/page.tsx
src/app/baseball/(dashboard)/dashboard/watchlist/page.tsx
src/app/baseball/(dashboard)/dashboard/analytics/page.tsx
src/app/baseball/(dashboard)/dashboard/program/page.tsx
src/app/baseball/(dashboard)/dashboard/dev-plans/page.tsx
src/app/baseball/(dashboard)/dashboard/compare/page.tsx
```

### Team Join Route

```text
src/app/baseball/join/[code]/page.tsx
src/app/baseball/join/[code]/join-team-client.tsx
```

This route currently supports logged-out redirect, invitation lookup, direct `join_code` lookup, already-member state, invalid invite, inactive/expired invite, and join confirmation.

### Baseball Actions

```text
src/app/baseball/actions/academics.ts
src/app/baseball/actions/announcements.ts
src/app/baseball/actions/auth.ts
src/app/baseball/actions/calendar.ts
src/app/baseball/actions/dev-plans.ts
src/app/baseball/actions/discover.ts
src/app/baseball/actions/documents.ts
src/app/baseball/actions/games.ts
src/app/baseball/actions/insights.ts
src/app/baseball/actions/interests.ts
src/app/baseball/actions/lineups.ts
src/app/baseball/actions/messages.ts
src/app/baseball/actions/onboarding.ts
src/app/baseball/actions/philosophy.ts
src/app/baseball/actions/player-dashboard.ts
src/app/baseball/actions/player-peek.ts
src/app/baseball/actions/recruiting-philosophy.ts
src/app/baseball/actions/stats.ts
src/app/baseball/actions/tasks.ts
src/app/baseball/actions/team-dashboard.ts
src/app/baseball/actions/teams.ts
src/app/baseball/actions/travel.ts
src/app/baseball/actions/watchlist.ts
```

### Baseball Components

Important component folders:

```text
src/components/baseball/announcements
src/components/baseball/box-score
src/components/baseball/calendar
src/components/baseball/command-center
src/components/baseball/dashboard
src/components/baseball/dev-plans
src/components/baseball/documents
src/components/baseball/games
src/components/baseball/peek-panel
src/components/baseball/player-profile
src/components/baseball/player-stats
src/components/baseball/position-planner
src/components/baseball/profile
src/components/baseball/program
src/components/baseball/recruiting-philosophy
src/components/baseball/roster
src/components/baseball/season-stats
src/components/baseball/settings
src/components/baseball/showcase
src/components/baseball/stats
src/components/baseball/tasks
src/components/baseball/team
src/components/baseball/travel
```

There is no mature `src/components/baseball/performance` or `src/components/baseball/lifting` yet. That is the main new module.

## Current Shell And App Feel

Current Baseball dashboard shell:

```text
src/components/baseball/dashboard-shell.tsx
```

It already includes:

- `Sidebar`
- `CommandPalette`
- `MobileBottomNav`
- Sidebar collapse spacing.
- Mobile sidebar overlay.
- Focus trap.
- Escape key close.
- Body scroll lock.
- Skip-to-main-content link.
- Safe mobile bottom padding.
- Coach mobile nav: Home, Roster, Messages, More.
- Player mobile nav: Home, Profile, Messages, More.

Do not replace the shell. Extend the navigation, page layout, and role awareness.

Current auth visual language:

- `bg-auth-baseball`.
- Warm/cream surface tokens.
- White/glass cards.
- Primary green/red token usage depending on current theme.
- Rounded panels.
- Lucide/custom icon system through `@/components/icons`.

Premium improvement direction:

- Keep the existing app recognizable.
- Make BaseballHelm feel more like an elite team ops dashboard and less like a recruiting app.
- Use dense, readable tables for operations.
- Use premium stat visuals and source drawers where data matters.
- Avoid generic hero sections inside app pages.
- Avoid purely decorative graphics in utility screens.
- Make role badges, active team, active season, and data source status visible.

## Existing Auth And Access Details

Current auth action:

```text
src/app/baseball/actions/auth.ts
```

Already provides:

- `loginAction`
- `signupAction`
- `requestPasswordResetAction`
- Rate limiting through `checkRateLimit`.
- Account lockout through `checkAccountLockout`.
- Password validation through `validatePassword`.
- Login redirects by resolved role and onboarding status.

Current auth hook:

```text
src/hooks/use-baseball-auth.ts
```

Already provides:

- Role required guard.
- Fast-path local state check.
- Background `supabase.auth.getUser()` verification.
- Fetches `users.role`, `baseball_coaches`, and `baseball_players`.
- Sends incomplete coaches to `/baseball/coach-onboarding`.
- Sends incomplete players to `/baseball/player`.
- Sends missing role to `/baseball/complete-signup`.

Important issue:

The auth store currently persists only `coachMode`, not the full user/coach/player profiles. This means the fast-path comment and actual persisted state may not fully match. Claude should inspect current Zustand persist behavior before relying on it for no-flash auth. A robust active-team context should be server-validated.

## Current Team Join Details

Current team actions:

```text
src/app/baseball/actions/teams.ts
```

Important functions:

- `validatePlayerCanJoinTeam(playerId, teamId)`
- `joinTeam(playerId, teamId)`
- `processTeamInvitation(inviteCode, playerId)`
- `generateTeamInviteCode(teamId)`
- `regenerateTeamInviteCode(teamId)`

Already implemented:

- High school and showcase players can have one HS team and one showcase team.
- JUCO players can have one JUCO team.
- College players can have one college team.
- `joinTeam` verifies authenticated user owns the player profile.
- Invalid IDOR attempts are logged.
- JUCO team join can auto-enable recruiting unless profile visibility is private.
- Team invite code can come from `baseball_team_invitations` or direct `baseball_teams.join_code`.

Final-touch requirements:

- Add staff invite flow in parallel to player team join.
- Preserve invite return paths through login and signup.
- Add pending approval mode if program settings require coach approval.
- Add role/capability context after invite acceptance.
- Make join UX show player identity, current memberships, and why the join is allowed or blocked.

## Current Database Reality

Archived migrations show the current Baseball data model evolved from generic table names to `baseball_*` table names. Claude must inspect current generated DB types before final code.

Current core identity model came from:

```text
supabase/migrations_archive/pre_20260527/001_extensions_and_enums.sql
supabase/migrations_archive/pre_20260527/004_coaches.sql
supabase/migrations_archive/pre_20260527/005_players.sql
supabase/migrations_archive/pre_20260527/006_teams.sql
supabase/migrations_archive/pre_20260527/036_rename_baseball_tables.sql
supabase/migrations_archive/pre_20260527/037_baseball_missing_tables.sql
supabase/migrations_archive/pre_20260527/20260125000000_fix_baseball_rls_comprehensive.sql
supabase/migrations_archive/pre_20260527/20260208000000_baseball_team_management.sql
supabase/migrations_archive/pre_20260527/20260217000000_fix_baseball_teams_schema.sql
supabase/migrations_archive/pre_20260527/20260222200000_baseball_box_score_system.sql
```

Important current baseball tables or table families:

```text
baseball_coaches
baseball_players
baseball_teams
baseball_team_members
baseball_team_coach_staff
baseball_team_invitations
baseball_team_lineups
baseball_lineup_positions
baseball_player_stats
baseball_stat_uploads
baseball_player_aggregates
baseball_coach_insights
baseball_coach_philosophy
baseball_coach_recruiting_philosophy
baseball_player_percentiles
baseball_documents
baseball_document_versions
baseball_announcements
baseball_announcement_recipients
baseball_announcement_acknowledgements
baseball_tasks
baseball_task_assignments
baseball_task_templates
baseball_events
baseball_event_attendance
baseball_travel_itineraries
baseball_travel_expenses
baseball_player_classes
baseball_academic_eligibility
baseball_box_scores and related box-score tables if present in generated types
```

Core enums:

```text
coach_type: college, high_school, juco, showcase
player_type: high_school, showcase, juco, college
team_type: expected to mirror program types
```

Important warning:

Current `coach_type` means program market type, not staff job role. Do not cram `strength_coach` into `coach_type` unless a migration intentionally changes the enum and all dependent UI. Use staff role/capabilities on team staff membership instead.

## Current Gaps

### Missing Or Thin

- No premium lifting/performance route.
- No mature strength coach dashboard.
- No strength groups.
- No lift program builder.
- No exercise library.
- No player lift execution UI.
- No readiness/soreness/bodyweight subsystem.
- No staff invite flow for assistant coaches or lifting coaches.
- No robust capability matrix UI.
- No active team/role context switcher for multi-team staff.
- No performance-to-baseball transfer analysis.

### Existing But Needs Upgrade

- Auth pages: good security, needs premium role/invite UX.
- Complete signup: good start, needs invite-aware paths and staff roles.
- Player join: good base, needs premium state handling and approval mode.
- Dashboard shell: good base, needs Performance navigation and role/context awareness.
- Team actions: good player membership logic, needs staff invite actions.
- Stats upload: useful base, needs source parsing and advanced vendor mapping from V9/V10.
- Command Center: useful base, needs V10 premium signals/source drawers.

## Build Order For Claude

Claude should implement in this order:

1. Read V11, V10, V9.
2. Inspect generated database types in `src/lib/types/database`.
3. Inspect existing Supabase client patterns in `src/lib/supabase`.
4. Inspect current auth, onboarding, team actions, and dashboard shell.
5. Add migrations for staff capabilities and performance tables.
6. Regenerate types.
7. Add server actions.
8. Add route skeletons with role guards.
9. Add reusable performance components.
10. Add player lift surfaces.
11. Add staff settings/invites.
12. Add tests for auth/permissions/actions.
13. Run lint/typecheck/tests.

Do not start with a giant frontend shell before the schema is clear. The product depends on role-scoped data.

## Suggested New Files

Actions:

```text
src/app/baseball/actions/staff.ts
src/app/baseball/actions/performance.ts
src/app/baseball/actions/lifting.ts
src/app/baseball/actions/readiness.ts
```

Routes:

```text
src/app/baseball/staff/join/[code]/page.tsx
src/app/baseball/staff/join/[code]/staff-join-client.tsx
src/app/baseball/(dashboard)/dashboard/performance/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/groups/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/programs/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/programs/[programId]/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/live/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/players/[playerId]/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/readiness/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/exercises/page.tsx
src/app/baseball/(dashboard)/dashboard/performance/settings/page.tsx
src/app/baseball/(dashboard)/dashboard/lift/page.tsx
src/app/baseball/(dashboard)/dashboard/lift/[sessionId]/page.tsx
src/app/baseball/(dashboard)/dashboard/readiness/page.tsx
```

Components:

```text
src/components/baseball/performance/PerformanceCommandCenter.tsx
src/components/baseball/performance/TodayWeightRoomBoard.tsx
src/components/baseball/performance/ReadinessQueue.tsx
src/components/baseball/performance/StrengthGroupBuilder.tsx
src/components/baseball/performance/LiftProgramBuilder.tsx
src/components/baseball/performance/ExerciseLibrary.tsx
src/components/baseball/performance/LiveWeightRoom.tsx
src/components/baseball/performance/PlayerPerformanceProfile.tsx
src/components/baseball/performance/PerformanceSignalCard.tsx
src/components/baseball/performance/charts/LoadTrendChart.tsx
src/components/baseball/performance/charts/ReadinessTrendChart.tsx
src/components/baseball/performance/charts/SorenessHeatmap.tsx
src/components/baseball/performance/charts/ComplianceBulletGrid.tsx
src/components/baseball/performance/player/PlayerLiftTodayCard.tsx
src/components/baseball/performance/player/PlayerLiftSession.tsx
src/components/baseball/performance/player/ReadinessCheckIn.tsx
src/components/baseball/performance/player/SorenessMapInput.tsx
src/components/baseball/performance/player/BodyweightEntry.tsx
```

Validation:

```text
src/lib/validation/performance-schemas.ts
src/lib/baseball/performance/permissions.ts
src/lib/baseball/performance/readiness.ts
src/lib/baseball/performance/load-prescription.ts
src/lib/baseball/performance/group-rules.ts
src/lib/baseball/performance/transfer-analysis.ts
```

Tests:

```text
src/test/baseball/auth/staff-invite.test.ts
src/test/baseball/auth/team-context.test.ts
src/test/baseball/performance/permissions.test.ts
src/test/baseball/performance/group-rules.test.ts
src/test/baseball/performance/lift-assignment.test.ts
src/test/baseball/performance/player-lift-session.test.tsx
```

## Current UI Patterns To Reuse

Reuse:

- `BaseballDashboardShell` for dashboard layout.
- `Sidebar` and `MobileBottomNav` patterns.
- `CommandPalette` for quick navigation and future "jump to player/lift" commands.
- `PeekPanel` for player quick view.
- `StatsUploadClient` import mapping patterns.
- `PositionPlanner` and `LineupBuilder` drag/drop interaction patterns where appropriate.
- Golf/Fairway CoachHelm patterns for source drawers, insight cards, read models, and chart fallbacks.

Do not reuse:

- Generic recruiting-only copy for performance pages.
- Marketing-style hero sections.
- Player recruiting profile components as lifting dashboard components.
- Player join confetti in staff or lifting workflows.

## Schema Implementation Notes

Before writing migrations:

- Confirm current table names in generated `Database` type.
- Confirm whether `baseball_team_coach_staff` has `role` and `is_primary`.
- Confirm whether `baseball_teams` has `join_code`.
- Confirm whether `baseball_coaches` uses `title` or `coach_title` in generated types.
- Confirm whether `baseball_events` supports event type. If not, add/extend safely.

Migration principles:

- Use `baseball_*` table names.
- Enable RLS on every new table.
- Add indexes on `team_id`, `player_id`, `coach_id`, `scheduled_date`, `status`.
- Keep source and audit fields.
- Do not store authorization in JSON only. JSON capabilities can exist, but common capabilities should have indexed columns or helper functions.
- Avoid views that bypass RLS. If using views, use `security_invoker = true` where supported.
- Do not expose service role to client.

## Permission Implementation Notes

Every server action should:

1. Get current user with Supabase server client.
2. Resolve coach/player profile.
3. Resolve active team context.
4. Check membership.
5. Check capability.
6. Validate input with schemas.
7. Write row with team/player/coach IDs.
8. Revalidate affected paths.
9. Return safe errors.

No performance server action should accept `coachId` or `playerId` from client and trust it without ownership/capability checks.

## Current App Optimization For Claude

Claude should maximize efficiency by treating the existing app as modules:

- Auth and join: extend existing actions and routes.
- Staff roles: add new routes/actions, then wire into settings.
- Performance: add new module folder and route group.
- Player lift: add lightweight player route and Player Today integration.
- CoachHelm: connect performance signals after data model exists.
- Current shell: extend nav, do not rebuild shell.

Best sequence:

1. Migration.
2. Types.
3. Permission helpers.
4. Server actions.
5. Route guards.
6. Simple UI.
7. Premium polish.
8. Tests.

Avoid:

- One huge component.
- Client-only permission checks.
- Duplicate user/profile tables.
- New global state before active context is defined.
- Chart visuals before data and fallback tables exist.

## Current Baseball Look And Feel To Carry Forward

The app currently looks like a warm, modern dashboard with:

- Cream/warm backgrounds.
- Rounded panels.
- Primary action color.
- Custom icon set.
- App shell/sidebar.
- Mobile bottom nav.
- Glass-like auth cards.
- Animated join success.

The upgraded product should look more professional:

- Sharper data hierarchy.
- More table density.
- Better status systems.
- More role badges.
- Better source/citation drawers.
- More premium empty states.
- Less generic copy.
- Better mobile Player Today execution.

## Final Handoff Rule

If Claude must choose between building a beautiful isolated prototype and building a slightly less fancy version integrated with current auth, team membership, Supabase tables, and Baseball shell, choose integration first. Then polish.

The product wins when every module knows the same player, same team, same staff roles, same calendar, same stats, same performance state, and same source-of-truth rules.
