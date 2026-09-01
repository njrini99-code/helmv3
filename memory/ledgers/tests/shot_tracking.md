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

- SHA: `5eececafc` on `main` (cited `31cf3f845` until 2026-09-01; that object is
  only on `codex/*` branches).
- Added regression coverage for Undo/Edit overlap and stale-shot reconciliation.
- Updated `src/lib/admin/__tests__/observe-action-result.test.ts` to guarantee
  that `shot_not_found` remains a handled warning and is not captured by Sentry.

## 2026-08-25 — durable snapshot cross-array contract

- SHA: `b752bfed4` (#1617); live, migration applied in production. (Read
  "uncommitted; not deployed" until 2026-09-01.)
- Added the atomic snapshot integrity suite in `supabase/tests/rls/` against the
  real authenticated RPC boundary. It catches the regression where a snapshot
  could report success while omitting an unmatched shot group.
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

## Entries added 2026-09-01 for tests that had no ledger line

- `src/app/golf/actions/__tests__/golf-round-submit-busy-carveout.test.ts`
  (`e1bde2b01`, #1554): submit's bounded lock wait returns `busy` and the
  wrapper classifies it as expected, not error.
- `src/app/golf/actions/__tests__/golf-round-submit-abort-no-destructive-fallback.test.ts`
  (`9f74ccccb`, `feea49fd2`): an aborted submit never runs a delete-and-reinsert
  fallback; a confirmed committed round is acknowledged after response loss.
- `src/hooks/golf/__tests__/use-round-status-sync.test.tsx` (`3b4204e6a`,
  #1615): transient status-poll failures are retried silently; only a
  sustained outage reports once.
- `src/hooks/golf/__tests__/use-shot-state-machine.test.ts` keyboard cases
  (`ce5914ccc`, #1659): the distance field being typed into is not covered by
  the keyboard.
- `src/app/golf/actions/__tests__/golf-save-partial-round-missing.test.ts`
  (`6cc92de43`, #1705): the RPC's not-found message maps to `round_missing`,
  logged at warning.
- `src/app/golf/actions/__tests__/golf-salvage-preserves-durable-holes.test.ts`
  (`d170cad53`, #1711): a salvaged hole never erases a scored durable hole on
  the RPC path.
- `src/lib/offline/__tests__/sync-engine-decline.test.ts` (`fb425aa2b`, #1704):
  a declined sync run carries `declined` and empty `errors`.

## 2026-09-01 — round_missing recovery, reuse-path salvage guard, shot-action player lookup

- Added `src/lib/golf/__tests__/round-missing-recovery.test.ts`: one write on
  success or any non-`round_missing` failure; exactly one re-issue without an
  id on `round_missing`, with the identical payload and the dead id handed to
  the caller first; a failed re-create is a sentence with `code` preserved;
  no retry without an id; signal keys are described as sentences.
- Extended `src/lib/utils/emergency-save.test.ts`: `migrateEmergencySave`
  re-keys a newer snapshot and drops the dead key, drops only when
  acknowledged, ignores another player's copy;
  `isRecoverableRoundSubmitError('round_missing')` is true.
- Extended `src/app/golf/actions/__tests__/golf-salvage-preserves-durable-holes.test.ts`
  with the no-id REUSE path: refuses with `retry` and leaves `golf_holes`
  byte-for-byte intact when the blanked hole is scored on the reused round;
  still reuses and salvages when nothing is at risk.
- Added `src/app/golf/actions/__tests__/golf-shot-actions-player-lookup.test.ts`:
  `deleteShot` and `updateShot` report a FAILED player read as retryable
  (never `Player profile not found`, never `shot_not_found`) and an empty read
  unchanged.
- Added `src/lib/offline/__tests__/sync-engine-v1-round-missing.test.ts`: the
  v1 drain re-submits once without the dead id and marks the record synced
  under the new one.
- Added `continue-round-client.round-missing.test.ts` and extended
  `new-round-client.recovery.test.ts` and
  `FairwayRecoverRound.recovery.test.ts` (source contracts): shared
  re-create path, mid-hole and queued `round_missing`/`busy` handling,
  snapshot migration, route-race targeting, submit/restore through the helper.
- `src/test/fixtures/fake-supabase.ts` gained `WriteBuilder.not()` so the
  orphan trim on the reuse path runs under the fake.
- Verification: see the PR body for the exact typecheck, lint, vitest, build
  and drift-gate results.
