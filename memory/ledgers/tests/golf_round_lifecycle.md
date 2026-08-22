# Golf Round Lifecycle test ledger

## 2026-08-22 — server checkpoint verification

- SHA: pending commit on `codex/shot-tracking-durable-save`.
- Coverage: targeted partial-save and round-tracking regressions, typecheck,
  preflight, and production build for the start and completed-hole checkpoint
  contract.
- Guarantees: a committed in-progress parent survives until explicit discard or
  completion, and a player cannot advance past a completed hole before the
  server has acknowledged its persisted data.

## 2026-08-22 — child-write round preservation contract

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Added action-level regressions for failed hole and shot persistence against
  an existing recoverable round, plus emergency-save discovery coverage.
- Guarantees: child-write errors do not erase an in-progress parent; the next
  retry or device recovery retains the prior durable state.

## 2026-08-22 — stale delete recovery contract

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Added `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx`.
- Guarantees: only one local destructive shot mutation can run at a time, and
  Undo reconciles a server-confirmed `shot_not_found` response instead of
  leaving the active round blocked.
