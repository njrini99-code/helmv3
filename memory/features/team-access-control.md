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

- `supabase/migrations/*.sql` — applied history, never hand-edited
- `supabase/schemas/**` — declarative current shape (Database Plan D2); see
  `docs/operations/DECLARATIVE_SCHEMA.md` for the edit → `db diff -f` → PR flow
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
- Completed golf rounds may be changed only by protected submit flows, with a
  separately scoped service-only exception for derived strokes-gained cache
  fields and CoachHelm terminal-processing metadata; no client or coach write
  may alter completed score history.
- Bare unprefixed sport tables such as `players`, `coaches`, `teams`, and `rounds` are wrong.
- Team-chat participant management is a scoped allowance, not general write access.
  `supabase/migrations/20260907160000_golf_team_chat_membership_management.sql`
  (written, NOT yet applied — applying it is the owner's step) lets a conversation's
  creator add and remove OTHER participants, bounded on three axes: the conversation
  must be a team chat with a `team_id`, the added/removed user must be on that team,
  and the actor must still be a participant themselves. Everyone keeps the pre-existing
  right to remove only their own row. The team check runs through the definer helper
  `public.golf_user_on_conversation_team(uuid, uuid)`, which reads `golf_team_members`
  and `golf_team_coach_staff`; it is revoked from `PUBLIC` and `anon` and granted to
  `authenticated` only.
- A departed creator cannot reach the members who stayed. Measured, not assumed:
  Postgres applies SELECT policies to the rows a DELETE reads, and
  `golf_participants_select_v2` has no coach branch, so a non-participant creator sees
  the conversation but zero participant rows. The DELETE policy's own participation
  clause is therefore deliberate redundant defence, not the only thing closing the hole
  — `supabase/tests/rls/golf_group_membership_management.sql` GROUP 4 says so in its own
  header rather than overclaiming.

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

<!-- schema-drift-absent: golf_group_membership_management, golf_user_on_conversation_team -->
<!--
  `golf_user_on_conversation_team` is a real function, created by
  20260907160000 — which is written and NOT applied, so it is correctly absent
  from the production schema snapshot `db:types` generates. Delete this name
  from the declaration above the moment the owner applies the migration and
  re-runs `npm run db:types`; leaving it here would exempt a real object from
  the drift check.
  `golf_group_membership_management` is not a database object at all — it is
  the pgTAP suite's filename (`supabase/tests/rls/golf_group_membership_-
  management.sql`), which happens to start with `golf_`.
-->
