# HELD DATA PLAN — Qualifier database hardening

```text
Plan ID: HD-qualifier-db-hardening
Status: HELD
Pages: Qualifiers (P009): coach and player list, detail, edit; /my-qualifiers
Feature: qualifiers (memory/features/qualifiers.md)
Migration: supabase/migrations/20260929200000_golf_qualifier_db_hardening.sql
Date: 2026-09-29
```

## Requirement

The Clubhouse security review of Qualifiers found four database gaps that predate Clubhouse. The
owner decided (D-35) that one forward-only migration closes them, written and reviewed but not
applied.

## Current schema

As the migration's header records it, from read-only checks of production on 2026-09-29:

- `golf_qualifier_selections`: players on the team can read it once the squad is confirmed, and
  `authenticated` holds table-level SELECT, so a player's session can select `coach_reasoning`.
- `golf_qualifier_entries`: the coach insert policy checks only that the caller coaches the
  qualifier's team, not that the player is on it; the update policy has no WITH CHECK.
- The remove-with-round trigger runs as the caller (missing rounds its RLS hides) and checks only
  `in_progress`.
- `anon` holds grants on three qualifier tables; `is_team_coach` and `is_team_player` have
  `search_path = public` without `pg_temp`.

## Proposed schema

No new tables or columns. One new function and changed grants, policies and a trigger function.

## Tables / columns

- `golf_qualifier_selections`: table SELECT revoked from `authenticated`; every column but
  `coach_reasoning` granted back.
- New `golf_qualifier_selection_reasons(uuid)`, `SECURITY DEFINER`, coach-gated by `is_team_coach`
  on the qualifier's team, returns the notes.

## Relationships

Unchanged.

## RLS / permissions

- Entries insert and update require an active `golf_team_members` row for that player on the
  qualifier's team; update gains a WITH CHECK.
- The remove-with-round guard becomes `SECURITY DEFINER` with a fixed `search_path` and refuses any
  unfinished round, draft included (same name, message and SQLSTATE 55000).
- `anon` loses its grants on `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`.
- `is_team_coach` and `is_team_player` add `pg_temp` to their `search_path`.

## Indexes

None.

## Backfill

None. Live counts on 2026-09-29: 224 qualifier rounds, none that the new rules would refuse; 6
selection rows, none with reasoning written.

## Compatibility

The app reads the note through `src/lib/golf/qualifier-selection-reasons.ts`: the function first, the
column as a fallback while the function doesn't exist. Apply it only once a deploy carrying that
reader is live. An older build that selects `coach_reasoning` directly (the CoachHelm qualifying
workspace) would lose the note. After apply, run `npm run db:types`; the fallback can then go.

## Privacy / sensitive data

It closes a read path to a coach's private note about a player (minors' data), which the screens hid
but the database allowed.

## Rollback concept

In the migration's `ROLLBACK:` block: grant SELECT back, drop the function, restore the two entry
policies and the trigger function, grant `anon` back, reset the two helpers' `search_path`.

## UI behavior while held

Clubhouse and Fairway both work unchanged: coaches read the note through the fallback, and players
never see it. The edit form's entrant rules are enforced by `setQualifierEntrants`, not yet by the
database.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

The file's first line is `-- STATUS: WRITTEN — HOLD — NOT APPLIED`. pgTAP:
`supabase/tests/rls/golf_qualifier_db_hardening.sql`. `npm run test:rls` has not been run on it yet
(it needs local Supabase in Docker; HANDOFF step 5).

## HELD.md registration

```text
Required: yes
Registered: supabase/migrations/HELD.md, row 20260929200000_golf_qualifier_db_hardening.sql (HOLD), linking this plan
```

## Activation checklist

- [ ] current schema re-read
- [ ] migration reviewed
- [ ] conflicts resolved
- [ ] owner authorization
- [ ] sanctioned apply path
- [ ] DB types regenerated
- [ ] RLS verified
- [ ] page wiring activated
- [ ] held status discharged
