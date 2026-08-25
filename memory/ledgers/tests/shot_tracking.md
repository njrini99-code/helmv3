# Shot Tracking test ledger

## 2026-08-22 — single-flight mutation coverage

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Added regression coverage for Undo/Edit overlap and stale-shot reconciliation.
- Updated `src/lib/admin/__tests__/observe-action-result.test.ts` to guarantee
  that `shot_not_found` remains a handled warning and is not captured by Sentry.

## 2026-08-25 — durable snapshot cross-array contract

- Status: uncommitted local reliability repair; not deployed.
- Added `supabase/tests/rls/golf_atomic_snapshot_integrity.sql` against the
  real authenticated RPC boundary. It catches the regression where a snapshot
  could report success while omitting an unmatched shot group.
