# Repo Verified Execution Map

This addendum was created after inspecting the local `helmv3` repo at `/Users/ricknini/Downloads/helmv3` on 2026-06-23. It should be treated as a practical map for the next build agent, not as a substitute for a fresh repo audit.

## Verified Repo Shape

The repo is not greenfield. It has a mature Next.js/Supabase surface with baseball, golf, CRM, CoachHelm, migrations, RLS tests, and existing dashboard components.

Key baseball surfaces found:

- `src/app/baseball/(dashboard)/layout.tsx`
- `src/app/baseball/actions/*.ts`
- `src/components/baseball/dashboard-shell.tsx`
- `src/components/baseball/command-center/CommandCenterClient.tsx`
- `src/components/baseball/calendar/BaseballCalendarWrapper.tsx`
- `src/components/baseball/roster/*`
- `src/components/baseball/player-profile/*`
- `src/components/baseball/player-stats/*`
- `src/components/baseball/stats/StatsUploadClient.tsx`
- `src/components/baseball/tasks/*`
- `src/components/baseball/travel/*`
- `src/hooks/use-baseball-auth.ts`
- `src/hooks/use-baseball-dashboard.ts`
- `src/lib/queries/baseball-dashboard.ts`
- `src/lib/baseball/csv-utils.ts`
- `src/lib/supabase/middleware.ts`
- `src/components/layout/sidebar.tsx`

## Verified Existing Product Gravity

The app still has meaningful recruiting and watchlist logic:

- `src/stores/auth-store.ts` has `CoachMode = 'recruiting' | 'team'`.
- `src/lib/supabase/middleware.ts` distinguishes recruiting routes and team routes.
- `src/app/baseball/actions/watchlist.ts` exists.
- `src/app/baseball/actions/recruiting-philosophy.ts` exists.
- `src/components/baseball/recruiting-philosophy/*` exists.
- `src/components/baseball/dashboard/*` includes lead/interest/position-need components.

V2 should isolate this logic. Do not rip it out blindly, because middleware and navigation may depend on it. The build agent should archive, gate, or hide recruiting surfaces from the Phase 1 team-ops default experience.

## Verified Reuse Targets

Prefer reuse or refactor over replacement:

| Need | First files to inspect |
|---|---|
| Auth/capabilities | `src/hooks/use-baseball-auth.ts`, `src/lib/auth/session.ts`, `src/lib/supabase/middleware.ts` |
| Navigation | `src/components/layout/sidebar.tsx`, `src/components/baseball/dashboard-shell.tsx` |
| Command Center | `src/components/baseball/command-center/CommandCenterClient.tsx`, `src/lib/queries/baseball-dashboard.ts` |
| Calendar/events | `src/app/baseball/actions/calendar.ts`, `src/components/baseball/calendar/BaseballCalendarWrapper.tsx` |
| Stats import | `src/app/baseball/actions/stats.ts`, `src/components/baseball/stats/StatsUploadClient.tsx`, `src/lib/baseball/csv-utils.ts` |
| Roster/profile | `src/components/baseball/roster/*`, `src/components/baseball/player-profile/*`, `src/app/baseball/actions/teams.ts` |
| Tasks/acks | `src/app/baseball/actions/tasks.ts`, `src/components/baseball/tasks/*`, `src/components/baseball/announcements/*` |
| Travel | `src/app/baseball/actions/travel.ts`, `src/components/baseball/travel/*` |
| Documents | `src/app/baseball/actions/documents.ts`, `src/components/baseball/documents/*` |
| AI/insights | `src/app/baseball/actions/insights.ts`, `src/lib/coachhelm/*`, `src/components/baseball/player-profile/PlayerInsightsPanel.tsx` |

## Verified Database Starting Points

Active migrations include baseball hardening, but most older baseball schema lives in archives:

- `supabase/migrations/20260528000000_baseball_recalc_body_guards.sql`
- `supabase/tests/rls/baseball_recalc_body_guards.sql`
- `supabase/migrations_archive/pre_20260527/032_baseball_advanced.sql`
- `supabase/migrations_archive/pre_20260527/036_rename_baseball_tables.sql`
- `supabase/migrations_archive/pre_20260527/037_baseball_missing_tables.sql`
- `supabase/migrations_archive/pre_20260527/20260208000000_baseball_team_management.sql`
- `supabase/migrations_archive/pre_20260527/20260209000000_baseball_dashboard_wiring_fixes.sql`

The next agent must inspect generated Supabase types before writing migrations. Do not infer the live table set from archive filenames alone.

## Immediate Build Sequence

1. Create a current route/schema/auth audit in the repo, or update this plan with exact findings.
2. Build a `baseballCapabilities` helper around existing role resolution.
3. Replace sidebar baseball route decisions with a V2 navigation registry.
4. Create or upgrade a Player Today route and make player redirects land there.
5. Upgrade Command Center read models before changing the visual UI.
6. Add import audit tables before expanding import UI.
7. Add player timeline events as a generated/read-model layer first, then make it durable if needed.
8. Add practice lite tables and UI only after event/team/player relationships are verified.
9. Add AI source-citation persistence before rendering new AI cards.
10. Seed a demo team only after migrations and role visibility are stable.

## Risks To Call Out To Claude

- Current repo mixes baseball and golf platform concepts.
- Older baseball code is recruiting-first in places.
- Supabase migrations are partly active and partly archived.
- Existing `TODO.md` appears generated and recommends many detail pages that V2 may not want.
- Missing loading/error state counts in the V2 package should be verified live before work starts.
- Golf CoachHelm patterns are useful, but baseball AI should not inherit golf-specific terminology or scoring assumptions.

## Acceptance Gate

The one-shot session is not done until Claude can answer:

- Which current routes remain?
- Which routes were hidden or archived?
- Which tables were extended?
- Which tables were newly created?
- Which RLS policies protect players from staff-only data?
- Which imports are traceable and rollback-capable?
- Which AI outputs have source references?
- Which demo screens show the product story?
- Which tests or browser checks passed?
