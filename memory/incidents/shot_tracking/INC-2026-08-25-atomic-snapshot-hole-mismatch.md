# INC-2026-08-25 — atomic snapshot shot-group mismatch

- Feature: `shot_tracking`
- Also affects: `golf_round_lifecycle`
- Status: released — production health verification passed; recurrence observation pending. Repair `b752bfed4` (#1617) is live and migration `20260825152726_guard_round_snapshot_shot_group_integrity.sql` is APPLIED in production (verified 2026-09-01 via the Supabase connector's `list_migrations`). (Read "repairing locally; not deployed" until 2026-09-01.)
- Risk: R3 — protected database lifecycle / migration
- First reproduced: 2026-08-25

## Symptom

A full round payload can include a shot group for a hole that is absent from
the payload's hole list. Both atomic round RPCs previously reported success
while omitting that shot group. On submit, the incomplete graph could be marked
completed.

## Earliest incorrect state

After deleting the existing durable round graph, each RPC looked up the newly
inserted hole for a shot group. A missing lookup used `CONTINUE`, which turned
the integrity failure into an acknowledged partial write.

## Repair

Validate the shot-group/hole relationship before any replacement operation;
return a safe failure that preserves the existing graph. Keep a transaction
aborting fallback for any unexpected unmatched lookup after that preflight.

## Regression evidence

The atomic snapshot integrity suite in `supabase/tests/rls/` runs both RPCs as an
authenticated player and verifies that partial save and submit preserve the
prior hole/shot graph, with submit remaining `in_progress`.
