# Repo vs Plan Alignment

## Current repo evidence

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

## Alignment summary

V2 should reuse and refactor existing baseball foundations instead of creating a parallel app.

| Existing repo reality | V2 implication |
|---|---|
| Baseball dashboard routes already exist | Upgrade Command Center and related pages in place. |
| Sidebar already controls baseball nav | Replace nav registry with V2 role-based model. |
| useBaseballAuth already resolves roles | Extend into capability checks instead of creating a separate auth layer. |
| Command Center already reads baseball tables | Expand read models and source-cited AI cards around existing pattern. |
| Player route redirects to team dashboard | Build Player Today as the true player landing page and route players there. |
| Academic UI has missing durable fields | Add narrow academic/class conflict model, not full compliance engine. |
| Recruiting logic still exists | Isolate or archive until Phase 4. |

## Hard instruction

The next agent must run a live repo/schema verification before changing code. The plan is migration-aware, not migration-blind.
