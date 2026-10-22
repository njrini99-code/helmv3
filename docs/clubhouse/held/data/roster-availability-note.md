# HELD DATA PLAN — Roster availability note (coach-only)

```text
Plan ID: HD-roster-availability-note
Status: HELD
Pages: Roster (P003): the Why field under the Availability control (desktop panel and phone profile)
Feature: roster_team (memory/registry.yml)
Migration: supabase/migrations/20261022090000_golf_player_availability_coach_notes.sql
Date: 2026-10-22
```

## Requirement

A coach marking a player injured or away wants to say why ("wrist, back Friday"). The reason is
health-adjacent data about players, many of them minors, so it must be readable by the team's coaches
and nobody else. The word itself (Available, Injured, Away) stays on `golf_team_members` and stays
visible as it is today (see `roster-availability.md`).

## Current schema

`golf_team_members.availability_note` exists (280 characters) but `golf_team_members_select_v5`
lets every active teammate read every column of their team's rows through the API, so a note there
would reach players whatever the screens select. The app never selects or writes it.

## Proposed schema

One new table, additive, no backfill:

- `golf_player_availability_coach_notes (team_id, player_id, note, updated_by, updated_at)`
- primary key `(team_id, player_id)`; `team_id` and `player_id` cascade on delete
- `note` is 1 to 280 characters (check constraint); an empty note deletes the row

## RLS / permissions

Row level security on. Four policies (select, insert, update, delete), all `to authenticated` and
all gated on `is_golf_team_coach(team_id)`. Insert and update also require `updated_by = auth.uid()`,
and insert requires the player to be a member of that team. There is no policy for a player or a
teammate, so they read nothing. `anon` and `PUBLIC` are revoked; `authenticated` holds
select, insert, update, delete (the policies narrow them); `service_role` holds all.

## Indexes

The primary key serves reads by team. `idx_golf_player_availability_coach_notes_player` serves the
player cascade.

## Compatibility and fallback

Nothing existing changes. The app tolerates the table not existing:

- `loadRoster` reads the table beside its other reads. `42P01` / `PGRST205` means "not there yet":
  `availabilityCoachNotes` is false, nothing is logged, and no note field is drawn. Any other error
  is logged and also leaves the field off, so a blank field can never save over a note that could not
  be read.
- `setPlayerAvailabilityCoachNote` answers "Notes are not available yet" for the same codes.
- The table is read untyped (`fromUntyped`) until `npm run db:types` is run after the apply.

So the app may ship before the migration, and the field appears by itself once the table exists.

## Privacy / sensitive data

Coach-only by policy and by test (`supabase/tests/rls/golf_player_availability_coach_notes.sql`).
Players do not see availability or its reason in v1. Marking a player Available leaves any saved
note in place (the field is shown only while they are out); it comes back if they are marked out
again, for the coach to keep or clear.

## Rollback

```sql
drop table if exists public.golf_player_availability_coach_notes;
```

Loses only the notes. The availability words are on `golf_team_members` and are untouched. With the
table gone, the app falls back to the word only.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

The file's first line is `-- STATUS: WRITTEN, HOLD, NOT APPLIED`. pgTAP is written and unrun
(no Docker where it was authored).

## HELD.md registration

```text
Required: yes
Registered: supabase/migrations/HELD.md, row 20261022090000_golf_player_availability_coach_notes.sql (HOLD), 2026-10-22.
```

## Activation checklist

- [ ] current schema re-read
- [ ] migration reviewed
- [ ] `npm run test:rls` green (the pgTAP file above)
- [ ] owner authorization (migration freeze lifted)
- [ ] sanctioned apply path (`npm run db:apply`)
- [ ] DB types regenerated (`npm run db:types`)
- [ ] a coach can save and clear a Why note; a player's session reads nothing
- [ ] held status discharged (HELD.md row, this plan)
