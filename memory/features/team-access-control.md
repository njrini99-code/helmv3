# Feature: Team Access Control And RLS

## Status

- active

## Current State

Team access control defines who can see and mutate golf data across coaches, players, teams, admins, and shared team surfaces. It is enforced through a combination of Supabase RLS, server action auth checks, role/team membership tables, and route-level logic.

This feature is foundational: most GolfHelm features depend on it, and many review gates are designed to prevent accidental bypasses.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/**`
- `src/app/golf/join/[code]/**`
- `src/app/golf/admin/**`

### Actions And Services

- `src/app/golf/actions/auth.ts`
- `src/app/golf/actions/roster.ts`
- `src/app/golf/actions/teams.ts`
- `src/app/golf/actions/onboarding.ts`
- `src/lib/supabase/**`
- `src/lib/auth/**`

### Database And Tests

- `supabase/migrations/*.sql`
- `supabase/tests/rls/*.sql`
- `src/test/lib/auth/**`
- `src/test/lib/cron/auth.test.ts`

## Core Data

- `users`
- `organizations`
- `memberships`
- `golf_coaches`
- `golf_players`
- `golf_teams`
- `golf_team_members`
- `golf_team_coach_staff`
- RLS policies across every `golf_*` table.

Use `memory/glossary.md` for table lookup and `memory/context/golfhelm-database.md` for exact columns.

## Business Rules

- Every server action must call `supabase.auth.getUser()` before any database access.
- Service-role key usage is allowed only in explicit admin/server-only boundaries.
- Browser code must never import server Supabase helpers or expose service-role credentials.
- Coach access to a team is through `golf_team_coach_staff`.
- Players can read or mutate only their own/team-allowed records, depending on the feature.
- Every new table needs RLS enabled and policies in the same migration.
- Security definer functions must pin `search_path`.
- Bare unprefixed sport tables such as `players`, `coaches`, `teams`, and `rounds` are wrong.

## UI Contract

- Permission-denied states should be explicit and calm, not blank screens.
- Team/admin/account destinations belong in drawer or secondary navigation, not duplicated across bottom nav.
- Mobile changes must follow `AGENTS.md` Standard or Action header patterns.

## Known Risk Areas

- Broad `.from()` queries in server actions before auth checks.
- New migrations creating tables without same-file RLS policies.
- Coach/team joins accidentally using stale `team_id` assumptions.
- Admin or cron code leaking into client bundles.
- RLS tests passing locally while live Supabase migration history drifts.

## Tests To Prefer

- pgTAP RLS tests under `supabase/tests/rls/*.sql`.
- Unit tests for auth helpers and cron auth.
- Review Gate custom rules for server action auth and table naming.
- Supabase local replay and lint for migrations.

## Related Docs

- `AGENTS.md`
- `CLAUDE.md`
- `memory/glossary.md`
- `memory/context/golfhelm-database.md`
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md`
- `docs/v3-rls-template.md`
- `docs/SECURITY_AUDIT.md`
