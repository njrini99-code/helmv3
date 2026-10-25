# HELD DATA PLAN — Tournaments row level security (P016, file 2 of 6)

```text
Plan ID: HD-tournaments-rls
Status: HELD
Pages: Tournaments (P016)
Feature: calendar_events
Migration: supabase/migrations/20261024100100_golf_tournaments_rls.sql
Date: 2026-10-25
```

The registry claims one migration per held plan, so the second Tournaments
file has this short plan of its own. Everything about it (the policies, the
risk, the apply order and the rollback) is in the main plan,
[tournaments.md](tournaments.md), section 2, and in the file's header.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

## HELD.md registration

Row `20261024100100_golf_tournaments_rls.sql` (HOLD), linking this plan and
the main one.
