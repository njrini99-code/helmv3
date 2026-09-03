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

## 2026-09-02 — reuse-safety gate, qualifier-number reuse, hole_invalid, holes_played, resilient auth, telemetry tiers

- Added `src/app/golf/actions/__tests__/golf-partial-round-reuse-safety.test.ts`
  (A1): no-id branch does NOT merge into a same-course/date round holding a
  scored hole or shots; DOES reuse a genuine empty shell; DOES reuse a scored
  round with explicit `{ allowReuse: true }`; the orphan trim never deletes a
  durable scored hole even when it is absent from the new payload's
  `holeConfigs`.
- Added `src/lib/golf/__tests__/qualifier-round-number.test.ts` and
  `src/app/golf/actions/__tests__/golf-qualifier-round-reuse.test.ts` (A2):
  an in-progress round is returned for reuse instead of a fresh number being
  derived and colliding with it (23505); more than one in-progress round
  refuses rather than guesses; first-unused-configured-number vs
  `max(completed) + 1`; a fully-used cap returns `qualifier_round_limit_reached`
  instead of inserting; a failed active-round read is marked `transient`
  rather than inventing slot 1.
- Extended `src/app/golf/actions/__tests__/golf-salvage-preserves-durable-holes.test.ts`
  (A3): the two `still salvages`/`still reuses and salvages` cases (both
  non-durable) now assert `hole_invalid` with no write at all — including
  under explicit reuse intent — instead of a silent success; added a case
  confirming the ORIGINAL durable-hole `retry` refusal is unchanged even with
  `{ allowReuse: true }`.
- Added `src/app/golf/actions/__tests__/golf-hole-invalid.test.ts` (A3):
  `savePartialRound` returns a structured `hole_invalid` result (hole/field/
  message, "Hole N, shot M" phrasing, yards unit) and writes nothing for a
  brand-new round with no candidate to reuse;
  `submitGolfRoundComprehensive`'s Zod-failure message is humanized with
  `code: 'hole_invalid'` instead of the raw `Invalid round data: holes.N...`
  text.
- Added `src/lib/golf/__tests__/holes-played-assert.test.ts` (A4): passes
  when equal; fails on missing/null/non-finite/mismatched values with a
  message naming both numbers.
- Added `src/app/golf/actions/__tests__/golf-actions-resilient-auth.test.ts`
  (A5): `deleteShot`, `updateShot`, `deleteInProgressRound`,
  `getNextQualifierRoundNumber`, and `getPlayerQualifiers` each proceed on a
  resilient (degraded-but-present) user the raw client would report as
  signed out, and still refuse a genuine sign-out — proven by mocking
  `getUserResilient` separately from the fake client's own `auth.getUser()`.
- Extended `src/lib/admin/__tests__/observe-action-result.test.ts` (A6):
  `shot_not_found` now classifies `warning`/`skipSentry:true` (was `info`);
  the qualifier-already-completed message classifies `warning` and is no
  longer a user-input rejection, while the neighbouring
  already-submitted/still-open messages stay `info`.
- Extended `src/lib/golf/__tests__/round-missing-recovery.test.ts`: two
  pre-existing exact-call-args assertions updated for the action type's new
  3rd (options) parameter; added a case proving `firstCallOptions` reaches
  ONLY the caller's first write, never the round_missing recreate retry.
- Verified from the worktree, each captured to a file, exit code checked:
  `npm run typecheck` (0), `npm run lint` (0), and `npx vitest run` over
  `src/app/golf/actions/__tests__/`, `src/lib/golf/__tests__/`,
  `src/lib/admin/__tests__/observe-action-result.test.ts`,
  `src/lib/auth/__tests__/resilient-get-user.test.ts`,
  `src/lib/offline/__tests__/`, `src/lib/utils/emergency-save.test.ts`,
  `src/app/golf/(dashboard)/dashboard/rounds/`,
  `src/components/fairway/pages/rounds-recover/`, and
  `src/hooks/golf/__tests__/` (142 files, 1300 tests, 0 failures).

## 2026-09-02 (follow-up) — hole_invalid client-surfacing wiring

- Added `new-round-client.hole-invalid.test.ts` and
  `continue-round-client.hole-invalid.test.ts`: each proves the
  `handleSaveForLater` handler in its file branches on
  `result.error === 'hole_invalid'` and surfaces `result.message` BEFORE
  the pre-existing generic fallback throw/toast that would otherwise render
  the bare `'hole_invalid'` key to the player — source-inspection contracts,
  matching the sibling `round-missing`/`recovery` tests for these two files.
- Caught by advisor review of the A1-A6 cluster before it was reported done:
  `savePartialRound`'s new `hole_invalid` result (A3) was not yet
  special-cased at either "Save & Exit" call site, reproducing the exact
  defect class P1 fixed for `round_missing`.
- Verification: both new tests plus the full `rounds/new/` and
  `rounds/continue/` suites (6 files, 27 tests, 0 failures); `npm run
  typecheck` (0); `npm run lint` (0).

## 2026-09-02 (Cluster B) — client-side round tracking, nine items

Every item written failing-first against the pre-fix source (or, for
component tests, a mocked prop forcing the buggy branch), watched fail for
the stated reason, then implemented. Full defect descriptions in
`memory/ledgers/changes/shot_tracking.md`, same date.

- `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx` (B1, +5 net):
  rewrote the pre-existing "removes a server-deleted shot from Edit" test,
  which had pinned the BUGGY behavior (`RECONCILE_MISSING_SHOT` with the
  shot filtered out, edit discarded) — now asserts the edit is applied and
  reaches `onAutoSave`. Added: an RLS-hidden-case variant (same
  `shot_not_found` code path, different real-world cause, deliberately
  indistinguishable — the fix is intentionally code-path-agnostic); B1
  regressions proving Undo/Delete's existing shot_not_found handling was
  already correct (applies the removal, reaches `onAutoSave`); two B3×B1
  guard tests proving a rejected `onAutoSave` (per B3's new
  await-and-rethrow) does not surface as `EDIT_SAVE_ERROR`/`UNDO_FAIL` for
  Edit/Delete/Undo — the mutation and its device snapshot already succeeded.
- `src/hooks/golf/__tests__/use-round-status-sync.test.tsx` (B2, +3): proves
  the poll does NOT adopt a newer server `updated_at` when it proves this
  device is behind (`isStale`), fires `onRoundStale` exactly once per new
  server version, and DOES adopt the value when polling confirms this
  device is already current.
- `continue-round-client.autosave-await.test.ts` (B3, new): source-inspection
  — `handleAutoSave` never fires its primary save with `void`, throws on an
  unrecognized failure, and keeps `persistCompletedHole` on its own already-
  awaited path.
- `continue-round-client.conflict-block.test.ts` (B2/B9, new):
  source-inspection — `onRoundStale` wired into `useRoundStatusSync`;
  `handleRoundSyncConflict` adopts the server `updated_at` ONLY inside the
  `pendingBeaconRef` self-heal window (index-ordering assertions, not a
  bare "string absent" check, since B9 legitimately reintroduces one guarded
  adoption); every write entry point checks `roundConflictBlockedRef`; the
  beacon call marks `pendingBeaconRef.current = true`; `handleBeforeUnload`
  checks the same flag; the blocked banner renders a Reload control.
- `continue-round-client.hole-invalid-checkpoint.test.ts` (B5, new):
  source-inspection — `persistCompletedHole` checks `hole_invalid` BEFORE
  its generic busy/retry fallback and returns `false` without retrying;
  `handleAutoSave` checks it before its generic throw.
- `continue-round-client.round-missing.test.ts` (updated, B3 fallout): two
  P2 tests' markers (`const executeServerSave`, `// Queued from
  handleHoleComplete`) no longer exist after B3 inlined that helper —
  re-pointed at the new marker (`// Server save — AWAITED (B3)`) and the
  now-single queued-follow-up block; assertions unchanged.
- `continue-round-client.hole-invalid.test.ts` (updated, B6 fallout): the
  dedicated `result.error === 'hole_invalid'` branch this test pinned was
  replaced by the shared `describeRoundWriteResult` helper — updated to
  assert the helper call and the absence of any unconditional
  `showToast(result.error...)`.
- `src/lib/golf/__tests__/round-missing-recovery.test.ts` (B6, +6):
  `describeRoundWriteFailure('conflict')` matches the new
  `ROUND_CONFLICT_MESSAGE`; `describeRoundWriteResult` prefers `message` for
  savePartialRound's bare-key shape, uses `error` directly for submit's
  already-a-sentence shape, falls back to `describeRoundWriteFailure` for
  every other key, and never returns empty.
- `src/app/golf/actions/__tests__/golf-save-partial-round.test.ts` (B9, +1
  assertion on an existing test): the no-id reuse success path now returns
  the row's real `updated_at` (was hard-coded `undefined`) — this assertion
  is what caught the `ReferenceError: round is not defined` scope bug in
  the first attempt at this fix, before it shipped.
- `new-round-client.hardening.test.ts` (B2/B4/B5/B6/B7/B9 for New Round,
  new, 12 cases): mirrors the Continue Round wiring-contract tests above for
  every fix mirrored onto New Round, plus B4-specific (recovery dialog in
  the setup/holes step, Discard's key fix, the new visible tracking-step
  error banner) and B7-specific (`maxRoundDate` wired to the date input,
  `validateBeforeStart` rejects a future date) assertions.
- `FairwayHoleConfig.bounds.test.tsx` (B5, new, render test): a seeded
  5000-yard hole blocks Save with an inline "999" message; every-hole-in-
  bounds saves normally.
- `FairwayShotEntry.distance-bound.test.tsx` (B5/B8, new, render tests, 6
  cases): blocks Next Shot for a >1000-yard distance remaining and for a
  0-yard/0-foot (green-proximity) distance, in each case with the specific
  inline message; does not block a within-bounds value.
- `FairwayShotTracking.ready-state-parity.test.ts` (B5/B8, new,
  source-inspection): `isReadyForNextShot` (the PARENT function that
  actually gates the disabled state — `nextShotBlocker` in the child only
  computes a message and short-circuits to `null` whenever `ready` is true)
  mirrors both new bounds; a full render test was judged not worth the
  extensive multi-sub-hook mocking `FairwayShotTracking.tsx` would need,
  given the sibling `FairwayShotEntry` render tests already prove the
  underlying logic correct in isolation.
- `FairwayShotTracking.stale-checkpoint.test.ts` (B8, new,
  source-inspection): `currentHoleIndexRef` exists and is kept live;
  `handleNextShot` compares it against the hole a checkpoint started on
  AFTER the `completeHole` call, guarding both the success and the
  catch-block failure status update.
- `FairwayRecoverRound.raw-key.test.ts` (B6, new, source-inspection): no
  `setError(<var>.error || ...)` fallback pattern remains; both round-write
  failure branches route through `describeRoundWriteResult`.
- `sync-engine-error-surfacing.test.ts` (B6, new): `syncRounds`'s per-item
  failure never contains the internal offline id and never returns the bare
  `'busy'` key verbatim — mocks `../shot-storage` (the v2 path `syncRounds`
  actually uses), distinct from the sibling
  `sync-engine-v1-round-missing.test.ts`'s `../indexed-db` mock (the LEGACY
  v1 path `syncV1Rounds` uses) — conflating the two during authoring
  produced an unhandled-rejection false failure from the constructor's
  fire-and-forget `loadSyncMetadata()` touching real IndexedDB, resolved by
  mocking the correct module instead of installing a fake IndexedDB.
- Verified from the worktree, each captured to a file, exit code checked:
  `npm run typecheck` (0), `npm run lint` (0, one `helm/no-raw-button`
  warning fixed — New Round's new Dismiss control uses `FwButton`, not a
  raw `<button>`), `npm run docs:schema-drift` (0, baseline 35),
  `npm run docs:path-drift` (0, baseline 0), and `npx vitest run` over
  every file listed above plus
  `src/app/golf/(dashboard)/dashboard/rounds/`, `src/app/golf/actions/`,
  `src/components/fairway/pages/rounds-new/`,
  `src/components/fairway/pages/rounds-recover/`,
  `src/components/fairway/pages/rounds-tracking/`, `src/hooks/golf/`,
  `src/lib/golf/`, `src/lib/offline/`, `src/lib/admin/`, `src/lib/auth/`,
  and `src/lib/utils/` (278 files, 3274 tests, 0 failures).

## 2026-09-02 (Cluster C) — discard race, qualifier closed, emergency-save degraded

Each written red first against the pre-fix source; defect descriptions in
`memory/ledgers/changes/shot_tracking.md`, same date.

- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.discard-race.test.ts`
  and `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.discard-race.test.ts`
  (C1, new): the `roundDiscardedRef` guard on every `round_missing` branch of
  both screens.
- `src/lib/golf/__tests__/round-missing-recovery.test.ts` (C3, extended):
  `isQualifierClosedError` cases.
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.qualifier-closed.test.ts`,
  `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.qualifier-closed.test.ts`
  and `src/components/fairway/pages/rounds-recover/FairwayRecoverRound.qualifier-closed.test.ts`
  (C3, new): the qualifier-closed exclusion ahead of `isCompletedRoundError`,
  and the `qualifierClosed` state's wiring on both screens.
- `src/components/fairway/pages/rounds-new/__tests__/FairwayRoundSubmitOverlay.secondary-action.test.tsx`
  (C3, new, render): the `secondaryActionLabel`/`onSecondaryAction` pair.
- `src/lib/utils/emergency-save.test.ts` (C5, extended): the
  `EMERGENCY_SAVE_DEGRADED_EVENT` once-per-session cases.
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.emergency-save-degraded.test.ts`
  and `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.emergency-save-degraded.test.ts`
  (C5, new): both screens subscribe and show the one-time toast.
- `src/lib/utils/emergency-save.test.ts` (C4, NOT shipped): the `(C4)`
  describe block is the red-first spec `7d05175ad` committed ahead of a
  source change that was never written; `describe.skip`ped in the merge
  commit (two cases fail against the current comparison, two pass), to be
  un-skipped by the C4 follow-up.
- Merge reconcile, no new test: `main`'s
  `src/app/golf/actions/__tests__/golf-shot-edit-transient-auth.test.ts` (#1728)
  and this branch's
  `src/app/golf/actions/__tests__/golf-actions-resilient-auth.test.ts` (A5)
  both pass against the reconciled `deleteShot`/`updateShot`.
- Verified for the merge commit, each captured to a file, exit code checked:
  `npm run typecheck` (0), `npm run lint` (0), and `npx vitest run --project
  unit --project unit-dom` over the round, shot, offline, utils and auth
  suites listed in `memory/ledgers/changes/shot_tracking.md`, same date
  (205 files, 2281 passed, 4 skipped — the C4 block — 0 failed).

## 2026-09-02 — Flight Recorder: three reviewer findings on PR #1769

Each written red first against the pre-fix source; defect descriptions in
`memory/ledgers/changes/shot_tracking.md`, same date.

- `src/app/golf/actions/__tests__/golf-round-submit-flight-recorder.test.ts`
  (finding 1, new case): seeds a qualifier round via the existing round's
  persisted `qualifier_id`/`qualifier_round_number` and asserts, from the
  exact ORDER the mocked recorder's methods are invoked (no artificial delay
  needed — the bug was in call order, not timing), that
  `post.qualifier_transition`'s `complete`/`warn` call lands before
  `finalize`, and that exactly one `finalize` call fires, with status
  `'success'` (guards against a double-finalize regression from the
  restructure).
- `src/lib/observability/__tests__/helm-flight-recorder.test.ts`:
  - (finding 2, new case) a `persistStep` dependency that throws
    synchronously (not an async function returning a rejected promise) is
    caught by `failOpen`, reports through `onRecorderFailure` exactly once,
    and never rejects the caller.
  - (finding 1 support, two new cases) `recordRescuedStepOutcome`'s new
    `deferFinalizeOnRescue` option: a rescued outcome records the
    warn/fallback-complete pair without finalizing, and the caller's own
    later `finalize()` call is what actually persists; an unrescued outcome
    still finalizes `'failure'` immediately regardless of the flag.
- `src/app/golf/actions/__tests__/golf-shot-delete-update-flight-recorder.test.ts`
  (finding 3, new case, plus a new `@/lib/supabase/untyped` mock to force a
  `golf_shots` update failure without disturbing the file's other queries):
  asserts `db.shot_mutation`'s `fail()` call now carries the real Supabase
  `errorCode`/`errorSummary` instead of the prior hardcoded string, mirroring
  the assertion already implicit in `deleteShot`'s `db.delete_shot` wiring.
- Verified, each captured to a file, exit code checked: `npm run typecheck`
  (0), `npm run lint` (0), `npm run lint:ratchet` (0, 68 warnings, no
  regressions), `npx vitest run src/lib/observability src/test/golf
  src/app/golf/actions src/test/lib` (252 files, 2212 passed, 3 skipped,
  0 failed), `node scripts/knowledge/document-inventory.mjs --check` (0),
  `npm run docs:path-drift` (0, 1254 references checked, baseline 0). Not
  run: `npm run build` (excluded by this task's own instructions).
