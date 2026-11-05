# HELD DATA PLAN — Tournaments desk update under the round guard (P016)

```text
Plan ID: HD-tournaments-round-write
Status: RELEASED
Pages: Tournaments (P016)
Feature: calendar_events
Migration: supabase/migrations/20261027100000_golf_tournament_update_round_write.sql
Date: 2026-10-27
```

A forward fix for a live bug, from the PR 2374 review (fix list 2026-10-27,
item 1). The three files it builds on (20261024100200, 20261025040000 and
20261025040100) are applied in production, so it replaces two function bodies
and edits none of them.

## The bug

4.33's `golf_tournament_update` (100200) writes a round event's `title` and
`course_id` at trigger depth 1 without `helm.tournament_write = 'rounds'`.
P-5's round guard (040000, `helm_private.guard_tournament_round_event`)
refuses exactly that write with `round_fields_locked`. 040100's sync triggers
have already renamed the round events to "Name · R1", so the desk's own
"Name · Round 1" always differs: every desk rename and every round course
change fails and rolls back.

## What it changes

- `golf_tournament_update` sets `helm.tournament_write = 'rounds'` for its
  round loop, the mark 040000's create from the calendar already sets, and
  clears it after. Round titles are written as `name || ' · R' || n`, the
  040100 form.
- `golf_tournament_create` writes new round titles in the same form.
- A round event's `end_time` now moves with its `start_time` and keeps the
  event's own length. A round made from the calendar as all-day stores
  end = start at T00:00Z, so moving only the start to noon broke
  `golf_events_end_after_start`: every desk save that sent a rounds list for a
  tournament made from the calendar failed. 100200 has the same bug; this
  file's pgTAP case found it.
- No table, policy, grant or data change. `CREATE OR REPLACE` keeps both
  functions' grants and comments.

## Existing titles

Production holds 20 round events titled "Name · Round n" (read-only check,
2026-10-27). This file does not rewrite them. The next desk save that sends a
rounds list moves a tournament's titles to "Name · Rn", quietly, under the
mark. A calendar rename moves them through 040100's sync. A one-off backfill
is the owner's call.

## Verification

`supabase/tests/rls/golf_tournament_update_round_write.sql` (16 cases): a
rename and a round course change pass, titles agree with 040100, the mark is
cleared when the call returns, a direct title edit is still refused, a desk
save over an old "Name · Round 1" title passes and rewrites it with no change
mark (this case fails without the mark), and a tournament made from the
calendar takes a rename and a course change in one save.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

## HELD.md registration

Row `20261027100000_golf_tournament_update_round_write.sql` (**HOLD**),
linking this plan.
