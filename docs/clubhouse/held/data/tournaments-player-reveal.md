# HELD DATA PLAN — Tournaments, the player's lineup reveal (P016)

```text
Plan ID: HD-tournaments-player-reveal
Status: HELD
Pages: Tournaments (P016)
Feature: calendar_events
Migration: supabase/migrations/20261024100300_golf_tournament_player_reveal.sql
Date: 2026-11-07
```

## Requirement

Owner answer A (2026-11-07): after the coach publishes, a player sees the lineup: their own spot and role, and whether
their score counted. 100100 left `golf_tournament_entries`, `golf_tournament_round_lineups` and field scores coach-only
until a reveal rule exists; this is the reveal part of held file 4, and nothing else of it (no receipt, no notification,
no player-notes change).

## Proposed schema

- `public.golf_tournament_my_lineup(p_tournament_id uuid) returns jsonb`: SECURITY DEFINER, STABLE, `search_path = ''`,
  read-only. NULL unless the caller is an active player on the tournament's team and `lineup_published_at` is set and not
  in the future. Otherwise the caller's own `role` and `slot` and, per round, `my_role`, `my_slot` and `players` (player id
  and slot of the round's lineup) only when the caller is in the lineup OF THAT ROUND. The top-level role and slot are the
  published entries and can be stale after a substitution; clients use the per-round `my_role` and `my_slot`. No score,
  note, reasoning or receipt.
- Policy `golf_tournament_round_lineups_select_own` (SELECT, authenticated): a player reads only their own snapshot row,
  once the tournament is published. It lets the applied insert policy `golf_tpr_player_link` (a player linking their own
  round, and scoring hole by hole) see "I am in this round's lineup".

## Tables / columns

None.

## RLS / permissions

EXECUTE revoked from PUBLIC and anon, granted to authenticated only. The policy is OR'ed with the coach and admin rules.
Teammates' scores stay readable only once a round is final (100100, unchanged); whether a score counted is worked out in
the app from those, with the scoring engine.

## SQL preparation status

WRITTEN — HOLD — NOT APPLIED

## Rollback

`drop policy golf_tournament_round_lineups_select_own on golf_tournament_round_lineups; drop function
golf_tournament_my_lineup(uuid);`

## Tests

`supabase/tests/rls/golf_tournament_player_reveal.sql` (14), written, not run here (no Docker): `npm run test:rls`.
Row in `supabase/migrations/HELD.md`.
