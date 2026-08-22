# Shot Tracking test ledger

## 2026-08-22 — durable checkpoint release verification

- SHA: `a68d7c299` (implementation commit; amended after ledger stamping).
- Coverage: targeted round-save, emergency-save, shot-state-machine, and
  rounds-library tests; typecheck, preflight, and production build run for the
  changed start/checkpoint contract.
- Guarantees: a new round has a server parent before tracking begins, a hole
  completion is acknowledged before advancing, and unfinished server rounds
  use Continue Round rather than a routine local-only recovery banner.

## 2026-08-22 — partial-save preservation and device recovery coverage

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Added `src/app/golf/actions/__tests__/golf-save-partial-round.test.ts`
  coverage for failed hole and shot upserts that preserves the existing parent
  round, and `src/lib/utils/emergency-save.test.ts` coverage for freshest-save
  discovery and expired-save handling.
- Guarantees: a failed child write cannot delete a recoverable active round;
  recovery scans cannot skip a valid emergency save after removing an expired
  one.

## 2026-08-22 — single-flight mutation coverage

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Added regression coverage for Undo/Edit overlap and stale-shot reconciliation.
- Updated `src/lib/admin/__tests__/observe-action-result.test.ts` to guarantee
  that `shot_not_found` remains a handled warning and is not captured by Sentry.
