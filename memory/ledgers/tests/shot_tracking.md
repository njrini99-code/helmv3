# Shot Tracking test ledger

## 2026-08-22 — false recovery drawer regression coverage

- SHA: `48b41e1c4d8c86f12f5a2becd11454f5bd3899e2`.
- Added emergency-save regression coverage that proves a matching 18-hole
  server snapshot is not recoverable work, while any different scorecard
  remains available for recovery.
- Verification: targeted emergency-save tests (6), golf schema tests (25),
  TypeScript, and ESLint passed. Full local production build is environment
  blocked after generated-output storage exhausted; the source compilation
  completed before the storage failure. The Vercel production build passed.

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

## 2026-08-22 — failed checkpoint and reopened-hole regression coverage

- SHA: `4276cec7e2556aa4b1dffc92851ba780d2a67b1a`.
- Added `FairwayCompletedHole.checkpoint.test.tsx` for a rejected completion
  checkpoint and retry, plus hook/controller regressions for reopening a
  completed hole after editing or deleting its final hole-out.
- Verification: 68 focused round-recovery, tracking, persistence, mutation,
  and schema tests passed; TypeScript, ESLint, and the local production build
  passed.

## 2026-08-23 — retry lock and recovery journal regressions

- Added coverage that the explicit completed-hole retry uses the controller's
  synchronous in-flight lock, and that owner-scoped recovery snapshots stay
  visible only to their player without deleting another account's cache.
- Added coverage for compatibility recovery of an authorized pre-owner server
  snapshot and for clearing the corresponding legacy IndexedDB record.

## 2026-08-23 — stale Edit Shot reconciliation regression

- Added a focused hook regression proving that a server-confirmed missing shot
  removes only the stale local reference and does not surface an Edit save
  error or recreate the shot.

## 2026-08-23 — legacy sparse-checkpoint regression

- Added action-level coverage that a sparse legacy scorecard array reaches the
  atomic partial-save RPC as an explicit uncompleted-hole slot rather than
  failing validation.
- Verification: focused round persistence/recovery coverage, TypeScript, and
  ESLint pass before release.
