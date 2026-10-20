# HELD DATA PLAN — Roster availability

```text
Plan ID: HD-roster-availability
Status: HELD
Pages: Roster (P003): the player card and drawer status pill; later Home and Calendar
Feature: roster_team (memory/registry.yml)
Migration: supabase/migrations/20260929120000_golf_team_members_availability.sql
Date: 2026-09-29
```

## Requirement

The Roster design shows each player as Active or Inactive, where "Inactive" means injured or away but
still on the team. The owner decided (Q-1) to add a separate availability field rather than reuse
`status`.

## Current schema

`golf_team_members.status = 'inactive'` already exists and means something else: the member loses RLS
access to team data (`is_team_player`). There is no availability column.

## Proposed schema

Additive and forward-only on `golf_team_members`:

- `availability text not null default 'available'`, checked to `available`, `injured` or `away`
- `availability_note text`, at most 280 characters
- `availability_updated_at timestamptz`, set by the writer

## Tables / columns

`golf_team_members` only, the three columns above.

## Relationships

None new.

## RLS / permissions

No policy change. Writes fall under the existing `golf_team_members` UPDATE policies (coaches on the
team). Availability never changes access; `status` still does.

## Indexes

None.

## Backfill

None. Every existing row reads `available` through the default.

## Compatibility

Additive with a default, so existing reads and writes are unaffected. Nothing in the app reads or
writes the columns yet.

## Privacy / sensitive data

`injured` and a free-text note are health-adjacent data about players, many of them minors. The note
should stay coach-visible only when the writer is built; the current SELECT policies let teammates
read `golf_team_members` rows, so a teammate-facing screen must not show the note. Decide this before
the writer ships.

## Rollback concept

```sql
alter table public.golf_team_members
  drop constraint if exists golf_team_members_availability_note_length,
  drop constraint if exists golf_team_members_availability_check,
  drop column if exists availability_updated_at,
  drop column if exists availability_note,
  drop column if exists availability;
```

## UI behavior while held

The Roster pill shows Active or Inactive from `status` and is read-only (Q-1). There is no way to mark
a player injured or away.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

The file's first line is `-- STATUS: WRITTEN — HOLD — NOT APPLIED`. No pgTAP yet: write one with the
writer (the check constraint, the note length, and that availability never changes `is_team_player`).

## HELD.md registration

```text
Required: yes
Registered: supabase/migrations/HELD.md, row 20260929120000_golf_team_members_availability.sql (HOLD),
added 2026-09-29. The file was committed in 816c8c1a1 without a row or header; both were added later.
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
