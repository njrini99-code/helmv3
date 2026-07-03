# Current Code Conflicts

## Critical findings

- Current repo is not greenfield. It already has meaningful baseball routes and shells.
- Route inventory reports 68 pages, 29 layouts, 3 API routes, 33 loading states, 26 error boundaries, 7 route groups, 8 orphaned pages, 35 missing loading states, and 42 missing error boundaries.
- Baseball navigation exists in src/components/layout/sidebar.tsx with coach/player role logic and archived recruiting branches.
- useBaseballAuth resolves role/onboarding from users, baseball_coaches, and baseball_players.
- Command Center already queries baseball_teams, baseball_team_members, baseball_player_aggregates, baseball_coach_insights, and baseball_events.
- Player college route redirects players toward /baseball/dashboard/team, showing the product already treats team mode as the practical player home.
- Existing route surface includes team, roster, stats, calendar, messages, travel, dev-plan, academics, tasks, documents, and command-center areas.
- Current database/types include a mixed baseball/golf Supabase surface; V2 must avoid a parallel clean-room schema.
- Academic page appears to default certain academic fields because credits/standing/eligibility are not yet durable in schema.
- Older baseball-dashboard queries still carry recruiting/watchlist logic; V2 must isolate or remove archived recruiting gravity.

## V2 recommendation

- Verify live `src/app/baseball` routes before adding routes.
- Verify live Supabase generated types before migrations.
- Keep the `baseball_*` naming family where practical.
- Replace/reduce nav rather than adding more top-level tabs.
- Reuse current dashboard shell and role-aware auth patterns unless they are broken.
- Add missing loading/error/empty states for touched routes.
- Separate archived recruiting logic from the team-operations product.

## Build-agent acceptance criteria

- Every touched route has owner role expectations.
- Every new table is linked to a feature, import, AI reader, and report.
- Every private field has an RLS rule and UI visibility rule.
- No duplicate clean-room schema is introduced without a documented reason.
