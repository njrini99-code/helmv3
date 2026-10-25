# HELD DATA PLAN — Tournaments from the calendar (P006)

```text
Plan ID: HD-tournaments-from-calendar
Status: HELD
Pages: Calendar (P006); Tournaments (P016) reads the rows
Feature: calendar_events
Migration: supabase/migrations/20261025040000_golf_tournament_from_calendar.sql
Date: 2026-10-25
```

P-5, file 1 of 2. SQL preparation status: WRITTEN — HOLD — NOT APPLIED.
The owner applies it,
after 4.33's `20261024100000` (tables) and `20261024100100` (RLS). The build
plan is P-05-tournaments-from-calendar with the 2026-10-25 changelog; the
file's header lists what it adds, the refusal names, the rollback and the
VERIFY lines.

## What it adds

- `golf_tournaments.request_id` (with a partial unique index) so a retried
  save replays instead of making a second tournament, and
  `golf_tournament_rounds.course_label` for a typed course name.
- `public.golf_team_timezone(uuid)`: the team's zone, America/New_York when
  unset or invalid.
- Four SECURITY INVOKER RPCs, EXECUTE revoked from PUBLIC and `anon`:
  `golf_tournament_create_from_calendar` (adopts the edited event as R1 or
  creates every round's `golf_events` row, atomically),
  `golf_tournament_update_round`, `golf_tournament_set_cancelled` and
  `golf_tournament_untrack`.
- `helm_private.guard_tournament_round_event()`: a BEFORE UPDATE trigger on
  `golf_events` that keeps a round's type, team, series, name, place and
  course with Tournaments, and refuses changes to a started or scored round.

## Verification done

Applied with its partner file to a scratch Postgres 16 with stub 4.33 tables
and Supabase roles: every VERIFY line returns one row and 56 behaviour checks
pass. The pgTAP file `supabase/tests/rls/golf_tournament_from_calendar.sql`
was not run (no Docker in the build session).
