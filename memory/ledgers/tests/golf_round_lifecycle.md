# Golf Round Lifecycle test ledger

## 2026-08-22 — stale delete recovery contract

- SHA: uncommitted; pending review and commit.
- Added `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx`.
- Guarantees: only one local destructive shot mutation can run at a time, and
  Undo reconciles a server-confirmed `shot_not_found` response instead of
  leaving the active round blocked.
