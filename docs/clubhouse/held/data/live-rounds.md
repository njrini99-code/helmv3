# HELD DATA PLAN — Live rounds

```text
Plan ID: HD-live-rounds
Status: HELD
Pages: Live rounds (P016): Home's Live now card, the live view, the player's sheet; Player Home's own card; Round setup, the in-round sheet and Settings (sharing)
Feature: golf_round_lifecycle, team_operations (memory/registry.yml)
Migration: supabase/migrations/20261025050000_golf_round_live.sql
Date: 2026-10-25
```

## Requirement

A coach should see who is out on the course and how they are scoring, without
asking. Practice rounds stay private to
the player until they share them (OQ-72); qualifier and tournament rounds are
always shown to coaches. The save path is
not touched: `save_partial_round_atomic` deletes and re-inserts every
`golf_holes` row on each autosave, so the live
state has to be rebuilt at commit.

## Current schema

`golf_rounds` (status, round_type, current_hole as a hole number, draft_data
with the hole plan) and `golf_holes`
(score per hole). `recompute_golf_round_totals` updates `golf_rounds` about 37
times per autosave, so no trigger on
`golf_rounds` alone can say "a hole was scored". `golf_rounds_select` already
lets coaches and active teammates read
every team round; OQ-72 can only be enforced on P-6's own surfaces. No live
table, no sharing preference.

## Proposed schema

- `golf_round_live`: one row per in-progress team round (and for hours after it
  ends). Plan and scores as `holes`
  jsonb (at most 18 entries), `thru`, `to_par`, `strokes`, `current_hole` (a
hole number, 1 to 18), phase, share, times.
- `golf_round_live_prefs`: a player's practice default (`practice_share`) and
  the one-round setup choice
  (`next_share`, `next_share_at`).
- `helm_private.golf_round_live_refresh`, `_touch`, `_emit`, `_type`, `_floor`,
  `golf_live_broadcast` (a no-op until
  the push migration), `golf_team_today`, and the trigger functions.
- Deferred constraint triggers on `golf_holes` (insert, delete, update of score
  or par) and `golf_rounds` (insert of an
  in-progress team round; update of the live-relevant columns), and a BEFORE
DELETE trigger that sends `gone`.
- `golf_round_live_set_share(round, share, remember)`,
  `golf_round_live_set_next_share(share, remember)` and
  `golf_live_viewer_on_course(team)`.

## Tables / columns

New: `golf_round_live`, `golf_round_live_prefs`, the sequence
`golf_round_live_seq`. Nothing existing changes.

## Relationships

`golf_round_live.round_id` to `golf_rounds` (cascade), `team_id` to
`golf_teams`, `player_id` to `golf_players`;
`golf_round_live_prefs.player_id` to `golf_players`.

## RLS / permissions

The player reads their own row. Team coaches read a row that is shared (coaches
or team) and not test data. Active
teammates read a practice row shared with the team, and only while they are not
on the course themselves (four hours:
a privacy gate). Nobody writes the tables directly; the refresh runs as the
owner from triggers, and sharing goes
through the two functions. Prefs: own row only. Anon has nothing.

## Indexes

`(team_id, round_date desc)`, `(player_id)`, `(qualifier_id)` where set,
`(course_id, round_date)` where set.

## Backfill

A quiet refresh (rows, no broadcast) of today's and yesterday's in-progress team
rounds, by each team's own calendar.

## Compatibility

The app reads the v0 poll (`golf_rounds` with `golf_holes`) for qualifier and
tournament rounds until this is applied,
detecting the table by `42P01` or `PGRST205`; the sharing controls are not drawn
then. Order does not matter for the
app. A tournament round that a tournament already tracks gets no row (open call
b, version 2).

## Privacy / sensitive data

No location is read or stored. A practice round reaches coaches or teammates
only when the player chose it. A refresh
error never fails a save: it is caught and logged as a WARNING.

## Rollback concept

In the file header: drop the four triggers, the functions, the tables and the
sequence.

## UI behavior while held

Coaches see qualifier and tournament lanes every 20 seconds from the v0 poll. No
practice lanes, no sharing field, no
share row in the Exit sheet, no Settings group. The player's own card works (it
reads the player's own rounds).

## SQL preparation status

WRITTEN — HOLD — NOT APPLIED. Exercised on a scratch Postgres 16 with a stub
schema and a pgTAP stand-in (54 checks
pass); every `-- VERIFY:` line fails without the migration and passes with it.
`supabase/tests/rls/golf_round_live.sql`
has not been run against a Supabase stack: run `npm run test:rls` first. squawk
and `supabase db diff` were not run.

## HELD.md registration

Row `20261025050000_golf_round_live.sql`, **HOLD**. The sweep
(`20261025050200_golf_round_live_sweep.sql`, pg_cron, first
line `-- DECLARATIVE: exempt`) is a separate row and is not named by a plan,
because its first line is the declarative
exemption and not the hold header.

## Activation checklist

- [ ] Review the SQL (db-migration-reviewer).
- [ ] `npm run test:rls` (golf_round_live.sql), and `supabase db diff` for the
  schema mirror.
- [ ] Apply outside a qualifier day (the triggers wait for in-flight saves;
  lock_timeout 3s).
- [ ] `npm run db:apply --
  supabase/migrations/20261025050000_golf_round_live.sql` (owner), then `npm run
  db:types`.
- [ ] Watch for `golf_round_live refresh` WARNINGs in the Postgres logs for a
  day.
