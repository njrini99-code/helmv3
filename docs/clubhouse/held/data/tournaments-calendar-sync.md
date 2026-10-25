# HELD DATA PLAN — Tournament rounds in step with the calendar (P006)

```text
Plan ID: HD-tournaments-calendar-sync
Status: HELD
Pages: Calendar (P006); Tournaments (P016) reads the dates
Feature: calendar_events
Migration: supabase/migrations/20261025040100_golf_tournament_calendar_sync.sql
Date: 2026-10-25
```

P-5, file 2 of 2. SQL preparation status: WRITTEN — HOLD — NOT APPLIED.
The owner applies it
after [tournaments-from-calendar.md](tournaments-from-calendar.md)'s file
(owner call 1 in the P-5 plan; default: apply).

## What it adds

- A deferred constraint trigger on `golf_events` (start, end, all day,
  status): a round's new time is mirrored into
  `golf_tournament_rounds.first_tee_at`, the tournament's dates and its
  `version`, and an out-of-order round is refused (`round_order`).
- Title and field sync triggers: a renamed tournament renames its round
  events; a round's course follows to its event.

## Verification done

As its partner file: applied to the scratch database, VERIFY lines return one
row, behaviour checks pass; pgTAP not run.
