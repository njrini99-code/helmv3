# INC-2026-08-25 — submit/checkpoint fallback could erase recoverable progress

- Feature: `golf_round_lifecycle`, `shot_tracking`
- Status: repairing locally; not deployed
- Risk: R2 — player data durability
- Root-cause class: application fallback bypassed the protected lifecycle RPC

## Symptom

A failed final submit or completed-hole checkpoint could make a player unable
to continue because the fallback deleted durable golf data rather than leaving
it available for retry.

## Root cause

The branch contained a live direct submit fallback that deleted and rebuilt
holes/shots after an atomic RPC error. It also retained two auto-save cleanup
branches that deleted an in-progress parent round when child upserts failed.
Neither app-level write can reproduce the database transaction that protects a
round lifecycle.

## Repair and regression

The protected `submit_round_atomic` RPC is now the only live completion writer.
The server action only reads back an abort-shaped request to detect a completed
commit; all other failures preserve the server submission backup and device
recovery state. Failed checkpoint child writes keep the parent plus every prior
saved hole/shot, so Continue Round remains available for an idempotent retry.

Regression coverage:

- `golf-round-submit-abort-no-destructive-fallback.test.ts`
- `golf-save-partial-round.test.ts`
