# Golf Round Lifecycle test ledger

## 2026-08-22 — stale delete recovery contract

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Added `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx`.
- Guarantees: only one local destructive shot mutation can run at a time, and
  Undo reconciles a server-confirmed `shot_not_found` response instead of
  leaving the active round blocked.
