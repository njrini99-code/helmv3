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
| `20260821043500_single_flight_round_submit.sql` | **VERIFIED APPLIED** | Read-only catalog check 2026-08-25: `pg_get_functiondef('public.submit_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)` contains a `lock_not_available` handler — production already carries this migration's single-flight lock behavior. Recorded here only because this file's neighbors below are the opposite finding for the same round-submit surface, and leaving one unstated next to two "not yet applied" entries would look like an oversight, not a check. | 2026-08-25 |
| `20260825200811_helm_flight_recorder.sql` + `20260826010000_helm_debug_retention.sql` | **HOLD — NOT YET APPLIED — R3** | Read-only catalog check 2026-08-25: the `helm_debug` schema is absent from the production catalog — neither file has run. Both are R3 (privileged) per `memory/system/golfhelm-engineering-os.md`: `20260825200811` rewrites two live, business-critical golf RPCs (`public.submit_round_atomic`, `public.save_partial_round_atomic`) in place via a `pg_get_functiondef()`-and-patch DO block, and `20260826010000` is a security-definer function plus grant changes on that schema. Daily reliability may investigate and prepare these but must never apply them — only the owner executes the production apply, and `db-migration-reviewer` review is mandatory first (already performed once on 2026-08-26; findings fixed in both files that session). The retention migration depends on the recorder migration's tables and will error at execution time (not at deploy time) if applied alone, so apply both together, in that order. Before applying `20260825200811`, take a `pg_get_functiondef()` backup of both `submit_round_atomic` and `save_partial_round_atomic` as they stand in production at that moment (the migration's own DO block already refuses to touch a function it does not recognize the shape of, but a human-held backup is the fast rollback path if the post-apply verification below fails) and confirm post-apply that both functions still round-submit successfully end-to-end and that `helm_private.trace_checkpoint` calls now appear in their definitions. Until applied, the flight-recorder wiring in application code (trace start/step/finalize calls into `public.helm_debug_*`) is fail-open: every call site is expected to no-op or swallow the "relation does not exist" failure rather than block the round-submit path it instruments, since the round submit itself must never fail because a diagnostic write failed. | 2026-08-25, updated 2026-08-26 |
| 13 production-only `schema_migrations` versions with no repo file (`20260825233238`, `20260825125512`, `20260825124728`, `20260825121433`, `20260825121310`, `20260825121238`, `20260824023141`, `20260823235118`, `20260823233509`, `20260823233504`, `20260821165627`, `20260821114110`, `20260820172125`) | **VERIFIED APPLIED — RECORDED UNDER DIFFERENT VERSIONS/NAMES** | Read-only ledger + catalog investigation 2026-08-26: every one of the 13 traces to a repo migration file producing the same catalog effect — 12 under the same `name` but a different version-number stamp, one (`restore_atomic_lifecycle_capability_v2`) under a different name with byte-identical logic to `20260825093000_restore_atomic_lifecycle_capability.sql`. None of these 13 is itself a reason a rebuild would diverge from production — the DDL for each is already in the tree (verified by byte-diff or live catalog check per version, see the doc). That is narrower than "a `db reset` reproduces production": it does not, for reasons already recorded three rows above (`HOLD`/`OBSOLETE`/not-yet-applied entries unrelated to these 13). One real discrepancy found along the way: `20260824030000_allow_completed_round_reclassify.sql`'s own header says `STATUS: PREPARED, NOT APPLIED`, but its effect (the `'reclassify'` branch on `guard_golf_round_lifecycle`, plus `public.reclassify_golf_round`) is live in production and has been since 2026-08-24 — the comment is stale, not the schema. Full per-version evidence and owner options (repair-only files vs. `supabase migration repair` vs. accepting the drift) in `docs/operations/2026-08-26-migration-history-drift.md`. | 2026-08-26 |

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
