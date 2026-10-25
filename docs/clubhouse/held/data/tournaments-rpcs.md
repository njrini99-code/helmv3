# HELD DATA PLAN — Tournaments RPCs and the lineup guard (P016, file 3 of 6)

```text
Plan ID: HD-tournaments-rpcs
Status: HELD
Pages: Tournaments (P016)
Feature: calendar_events
Migration: supabase/migrations/20261024100200_golf_tournaments_rpcs.sql
Date: 2026-10-25
```

The registry claims one migration per held plan, so the third Tournaments
file has this short plan of its own. The main plan,
[tournaments.md](tournaments.md), section 3, is the specification; the file's
header lists what it adds, the refusal codes, the rollback and the VERIFY
lines.

## What it adds

- Ten SECURITY INVOKER RPCs with `search_path = ''`: create, update
  (compare-and-set on `version`, P0001 `stale`), delete (refuses
  `rounds_linked` unless told to unlink), set entries, lock, substitute, set
  round status (the allowed transitions; a reopen writes a result mark),
  mark (official, reopened), publish, and the read-only link candidates.
  EXECUTE is revoked from PUBLIC and `anon`, then granted to `authenticated`
  and `service_role`.
- `helm_private.guard_tournament_lineup()` on entries and round lineups:
  after lock, P0001 `locked` unless the transaction set
  `helm.tournament_write = 'substitute'` (only the substitute RPC does).

## Defaults taken where the plan is silent

- The substitute bypass is the GUC alone, with no `current_user` check (the
  RPC is SECURITY INVOKER, so it runs as `authenticated`). A PostgREST caller
  cannot set a GUC, and the 100100 policies still admit only a coach.
- Leaving `upcoming` locks the lineup (takes the snapshot) when the coach has
  not, so a player's link policy always has a snapshot to read.
- Publish sets `lineup_published_at` only; `reveal_at` comes with 100300.
- The guard lets a row through when its tournament is gone, so a tournament
  or team delete cascades past a locked lineup.

## Verification

Run on a scratch Postgres 16 with stub live tables (2026-10-25): files 1 to 3
apply in order; `supabase/tests/rls/golf_tournaments_rpcs.sql` passes 16 of
16 under a pgTAP shim; a smoke run (create, shrink rounds, entries, publish,
auto-lock, final, official, reopen, link candidates) commits, and a team
delete with a locked tournament cascades cleanly. Not yet run through
`npm run test:rls` (needs Docker).

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

## HELD.md registration

Row `20261024100200_golf_tournaments_rpcs.sql` (HOLD), linking this plan.
