# Deliberately unapplied migrations

A migration file that exists here but has no row in the ledger looks identical
whether it was **held on purpose** or **forgotten**. This file is the difference.

## Why this exists

The 2026-08-19 reconciliation resolved 32 unaccounted migration files. Two of
them are unapplied *by decision* — and that was knowable only because two people
said so in conversation. Nothing in the repository or the database recorded it.
Had those conversations not happened, both would have looked exactly like the
other thirty.

**A missing record of a deliberate non-application is indistinguishable from an
oversight.** Every future audit re-opens the same question and reaches the same
dead end, because there is nowhere the answer could have been written down.

There is now. If you decide not to apply a migration, add a row. One line.

This is not a substitute for `public.audit_log` (which exists, has the right
schema, and has never been written to) — that covers privileged *runtime*
actions. This covers a decision that leaves no runtime trace at all.

## The register

| migration | status | why | decided |
|---|---|---|---|
| `20260708141000_gate_secdef_ownership_and_redemption.sql` | **HOLD** | Draft. Gates SECURITY DEFINER ownership + redemption; not finished and not reviewed. Applying an unfinished privilege change is worse than the drift it addresses. | pre-2026-08-19, recorded 2026-08-19 |
| `20260715141727_baseball_legacy_stats_backfill.sql` | **HOLD** | Legacy stats backfill. Data migration over baseball history, explicitly held across multiple sessions. Baseball is seed data nobody uses, so there is no cost to leaving it and a real cost to a bad backfill. | pre-2026-08-19, recorded 2026-08-19 |
| `20260528011000_harden_coach_insights_update_grants.sql` | **OBSOLETE** | Do **not** apply, and do **not** stamp. See below. | 2026-08-19 |

## Why `20260528011000` is obsolete rather than pending

It revokes `UPDATE (status, dismissed, resolved_at, metadata, lifecycle_state)`
on `golf_coach_insights` from `authenticated`, intending to leave players able
to write only `acknowledged_at` and `dismissed_at`.

`dismissInsight` — a live coach action at
`src/app/golf/actions/intelligence-dashboard.ts:548`, running under the
**user-scoped** client — writes `dismissed`, `status` and `lifecycle_state`.
Applying this revoke fails that statement with `42501`.

That is not hypothetical. The `DS-1` comment immediately above that call records
the same failure already happening once, for `updated_at`: *"the `authenticated`
role has no UPDATE privilege on that column … so including it made Postgres
reject the whole statement with 42501 before RLS was even evaluated —
dismissInsight always failed."*

**Stamping it would be worse than leaving it.** A ledger row asserts the revoke
happened. It did not, and no future audit would look again.

The intent is still right — a player should not be able to write `status`,
`lifecycle_state` or `metadata`. The mechanism cannot express it: coaches and
players share the `authenticated` role, and a column grant cannot tell them
apart. The fix is a design change (route player-side mutation through a
`SECURITY DEFINER` RPC, then revoke direct UPDATE), not a reconciliation step.

Measured 2026-08-19: `golf_coach_insights` has RLS enabled with 6 policies, all
targeting `authenticated` and **none** targeting `anon` — so the migration's
`REVOKE ... FROM anon` half addresses grants that no policy makes reachable.
That half is defence in depth, not an exposure.

## Adding a row

Anything here must say what would go wrong if it were applied, not merely that
it is held. "Held" without a reason decays into the same unknown this file
exists to prevent.
