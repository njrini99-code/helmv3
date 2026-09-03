# Shot Tracking change ledger

## 2026-08-22 — distinguish a real fallback from a confirmed snapshot

- SHA: `48b41e1c4d8c86f12f5a2becd11454f5bd3899e2`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-confirmed-snapshot-recovery-prompt.md`.
- Change: acknowledged local backups are cleared race-safely, database shot
  IDs are excluded from snapshot equivalence, and a full checkpointed
  scorecard no longer writes a page-hide backup before final submission.
- Why: a timestamp-only recovery decision treated a safe duplicate as unsaved
  work and intercepted the completion flow.

## 2026-08-22 — make round start and hole completion durable checkpoints

- SHA: `a68d7c299` (implementation commit; amended after ledger stamping).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: tracking begins only after an in-progress server row is created;
  completed holes await a successful server checkpoint before advancing; the
  device-only recovery banner is no longer a normal rounds-library surface.
- Why: every started round must be resumable through Continue Round, and every
  completed hole must have a database-backed score and shot history.

## 2026-08-22 — preserve rounds after partial-save child failures

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: `savePartialRound` no longer deletes an `in_progress` parent when a
  hole or shot upsert fails. The player recovery surfaces the freshest valid
  emergency save, including a snapshot keyed by a now-unavailable server ID.
- Why: a transient child-write failure could turn an otherwise recoverable
  active round into a missing round after a user returned from sign-in.

## 2026-08-22 — serialize local shot mutations

- SHA: `5eececafc930c1d10718371bd2954c9ec32e758c` on `main` (the
  `31cf3f845` this entry cited until 2026-09-01 exists only on `codex/*`
  branches; `main` carries the same repair as `5eececafc`). Follow-up
  `aea2b5ed5` (#1605) extended the contract to `updateShot`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-delete-shot-stale-id.md`.
- Change: Undo, Edit Shot save, and Edit Shot delete now share one in-flight
  mutation guard. A server-confirmed absent shot reconciles the stale local
  entry without replaying a destructive request.
- Why: active golfers could be blocked by a stale ID after a concurrent or
  completed delete, and downstream edit writes could outlive the visible edit.

## 2026-08-25 — reject mismatched durable snapshots

- SHA: `b752bfed4` (#1617) carries migration
  `20260825152726_guard_round_snapshot_shot_group_integrity.sql`; live, and the
  migration is APPLIED in production (verified 2026-09-01 via the Supabase
  connector's `list_migrations`). This entry read "uncommitted; not deployed"
  until 2026-09-01.
- Change: the database rejects a save or submit payload whose shot groups do
  not correspond to its hole snapshot before it can replace persisted shots.
- Why: a stale or malformed client payload must leave the last confirmed shot
  graph available through Continue Round rather than silently dropping data.

## 2026-08-25 — rollback-proof shot workflow recorder

- SHA: `641adf741` (#1618); live. Six trace stages that could never be
  recorded were completed at construction in `dc3b2fec2` (#1712). This entry
  read "uncommitted; not deployed" until 2026-09-01.
- Change: autosave and submit now create a fail-open correlation trace, record
  expected server/database/verification/background steps, and link relevant
  Bridge/Sentry errors to that trace ID. The active atomic RPCs emit structured
  `HELM_TRACE` Postgres logs, which survive a rollback and can be ingested into
  the private Trace Explorer store by `npm run trace:db` during local debugging.
- Why: a failed or partial shot checkpoint must identify the last durable
  operation and clearly show verification/background nodes that did not run.
## 2026-08-22 — retry failed hole checkpoints without contradictory snapshots

- SHA: `4276cec7e2556aa4b1dffc92851ba780d2a67b1a`.
- Change: a completed-hole checkpoint now holds the golfer on the affected
  hole until the server acknowledges it and exposes one focused retry control
  if that acknowledgement fails. The tracking controllers synchronously keep
  their completed-hole and in-progress-shot references mutually exclusive.
  Editing or deleting a final hole-out clears that hole's completed scorecard
  slot before its remaining shots can be autosaved.
- Why: a rejected checkpoint could otherwise leave the interface looking
  complete while deferred autosave retained both old completed data and a new
  in-progress version of the same hole.

## 2026-08-23 — serialize recovery cleanup and checkpoint retries

- SHA: `8d3b2596e` + `49bb447fb` (PR #1604); live. This entry read "pending
  commit; not deployed" until 2026-09-01.
- Change: device backups are player-scoped, acknowledgement cleanup cannot
  overtake a later snapshot, and the explicit completed-hole retry shares the
  same synchronous in-flight guard as normal shot submission.
- Why: rapid repeat taps could enqueue duplicate checkpoints, and an old
  asynchronous cache delete could otherwise remove a later recoverable shot.

## 2026-08-23 — reconcile a stale Edit Shot reference safely

- SHA: `aea2b5ed5` (#1605); live. This entry read "pending commit" until
  2026-09-01.
- Change: `updateShot` now returns the same stable `shot_not_found` code as
  `deleteShot` when the row has already been removed. Edit Shot closes its
  stale editor, removes only that local row, and recomputes the affected
  hole's state from the remaining server-backed history.
- Why: an Undo, second tab, or disconnected response could leave a browser
  editing a no-longer-existent shot. Treating that condition as an ordinary
  save failure falsely told golfers their action was broken and invited unsafe
  retries.

## 2026-08-23 — harden legacy checkpoint transport and background re-saves

- SHA: `94c8f6319`; live. This entry read "pending commit" until 2026-09-01.
- Incident: `Client error: Completed hole checkpoint failed`, including the
  18:19 EDT occurrence from a cached iPhone bundle.
- Change: `savePartialRound` materializes every sparse client hole slot as
  `null` before validation. New Round and Continue Round no longer turn a
  transient background re-save of an already-completed hole into a second
  player-facing error; the direct hole-out checkpoint still blocks advance and
  keeps its focused retry affordance.
- Why: a deployed browser shell can retain an older payload shape, and its
  overlapping periodic save could emit a false checkpoint incident despite a
  later successful durable write.

## 2026-08-23 — reconcile committed terminal submissions after response loss

- SHA: `feea49fd2`; live.
- Change: a timeout or transport abort from `submit_round_atomic` now performs
  an authenticated read of that exact player round. A confirmed completed row
  is acknowledged as success; an unconfirmed result leaves all server and
  browser recovery copies untouched for retry.
- Why: an HTTP response can be lost after Postgres has committed its atomic
  scorecard transaction. Treating that as a simple failure falsely asks the
  player to submit again and produces an avoidable production error.

## 2026-08-26 — status-bar collision fix inherited from round chrome

- What/Why: shot-entry surfaces render under `FairwayScorecardHeader`, which
  now carries the iOS status-bar inset (see the round-lifecycle ledger entry of
  this date). No shot state machine, save path, or haptic logic changed.

## 2026-08-26 (morning addendum) — inherited dark-chrome refinements

- What/Why: shot-entry surfaces use the shared `Segmented`/splash chrome
  refined this morning (see the round-lifecycle ledger entry of this date).
  No shot-tracking logic changed.

## 2026-08-26 — edit-shot modal footer honours the home indicator

- SHA: `15df63726` (#1625). (This entry cited `f4216fef8` until 2026-09-01; that
  object is on no branch — the change reached `main` inside #1625.)
- Change: FairwayEditShotModal's hand-rolled sticky footer now carries the
  env(safe-area-inset-bottom) padding formula ModalShell.Footer uses.
- Why: contentInset:'never' in the iOS shell means web code owns the
  home-indicator inset; a tall shot form runs the panel to its max-height
  cap where plain py-4 left Cancel/Save riding the indicator.

## Entries added 2026-09-01 from `git show --stat` (all live on `main`)

- `e196ef6a8` 2026-08-20 (#1517): single-flight the auto-save per round —
  `save_partial_round_atomic` takes `FOR UPDATE NOWAIT` and returns `busy`;
  both round screens treat it as a silent skip.
- `e1bde2b01` 2026-08-21 (#1554): submit fails fast and clean under save
  contention — `submit_round_atomic` waits a bounded 3s then returns `busy`;
  the wrapper classifies the message as expected.
- `c45d48660` 2026-08-23: a payload mismatch must never cost the player their
  shot — `savePartialRound` blanks an unparseable hole and salvages the rest.
- `9e7edc901` 2026-08-23: unmask the auto-save validation error so the log
  names the failing field, not "holes.16 — Invalid input".
- `9f74ccccb` 2026-08-23: remove the live destructive submit fallback; the
  preserved-error path replaces it.
- `92de87184` 2026-08-25: preserve qualifier round progression through
  partial save.
- `c652a9e35` 2026-08-25 (#1614): harden round lifecycle reliability —
  lifecycle contract migrations, protected atomic submit, roster active-round
  guard.
- `3b4204e6a` 2026-08-26 (#1615): harden round reliability telemetry —
  round-status polling failures retried silently, expected soft failures
  classified.
- `ce5914ccc` 2026-08-31 (#1659): stop the keyboard covering the distance
  field being typed into (shot state machine + CapacitorProvider).
- `1952ab1c3` 2026-08-31 (#1703): players re-type their own live round from
  the screen they are on; submit uses the persisted identity.
- `6cc92de43` 2026-09-01 (#1705): a round that no longer exists broke
  auto-save, submit and conflict checks — `round_missing` key added; New Round
  and the Continue checkpoint re-create.
- `d170cad53` 2026-09-01 (#1711): salvaging an unparseable hole could delete a
  hole already saved — salvage guard on the RPC path.
- `dc3b2fec2` 2026-09-01 (#1712): the six trace stages that could never be
  recorded.
- `fb425aa2b` 2026-09-01 (#1704): mid-round sync toast — `SyncResult.declined`
  so a declined run is not rendered as a failure (production is at this SHA).

## 2026-09-01 — round_missing recovery on submit and auto-save; salvage guard on the reuse path

- SHA: this PR (`agent/fix-shot-tracking`); not deployed at the time of writing.
- Change: `writeRoundRecreatingIfMissing` (`src/lib/golf/round-missing-recovery.ts`)
  is the one re-create decision. New Round submit, Continue Round submit, the
  recovery screen (partial restore and terminal re-submit), New Round's
  snapshot restore, and the v1 sync drain all go through it: a `round_missing`
  answer re-issues the same full snapshot once without an id, and a failed
  re-create is shown as a sentence, never the key. Continue Round's mid-hole
  auto-save and its queued follow-up now re-create on `round_missing` and skip
  `busy` silently, through the same `recreateMissingRound` path the
  checkpoint uses; saves that race the route change target the re-created row
  (`recreatedRoundIdRef`). `migrateEmergencySave` moves the device snapshot off
  the dead id in every re-create branch on both screens.
  `isRecoverableRoundSubmitError('round_missing')` is true. The salvage guard
  is hoisted (`salvageWouldEraseDurableHole`) and applied on the no-id REUSE
  path after the reused id resolves and before the hole upsert. `deleteShot`
  and `updateShot` bind the player-lookup error and return a retryable
  sentence instead of "Player profile not found".
- Why: measured on HEAD `6a7577c71` (production `fb425aa2b`): a submit
  `round_missing` rendered the literal key in the overlay with nothing
  re-submitting; the recover flow retried the dead id; the reuse path could
  null a durable scored hole through the upsert; a transient player read was
  reported as a missing profile mid-round.

## 2026-09-02 — reuse-safety gate, qualifier-number 23505 loop, hole_invalid, holes_played assertion, resilient auth, telemetry tiers

- SHA: this PR (`agent/fix-shot-tracking`), on top of `536f99d39`; not
  deployed at the time of writing.
- Change (A1, data loss): `savePartialRound`'s no-id branch no longer reuses a
  course/date/qualifier-matched `in_progress` round unconditionally.
  `isEmptyShellRound` gates reuse to an empty shell (no scored hole, no
  `golf_shots` row) unless the caller passes a new explicit option,
  `{ allowReuse: true }` — set only by New Round's recovered-snapshot restore
  (`handleRestoreRecovery`) and FairwayRecoverRound's partial restore, never
  by `persistRoundStart`, and never forwarded into the `round_missing`
  recreate retry inside `writeRoundRecreatingIfMissing` (new
  `RoundWriteHooks.firstCallOptions`, forwarded to the caller's first write
  only). When reuse does happen, the durable-hole guard
  (`salvageWouldEraseDurableHole` renamed `holesAtRiskOfErasure`, now
  parameterized on a caller-supplied hole-number list) checks every
  null-score hole in the reuse-path payload, not only salvaged ones; the
  orphan-hole trim gained `.is('score', null)` so it can never delete a
  scored hole regardless of whether the payload named it.
- Change (A2, stuck qualifier round): `savePartialRound`'s qualifier
  round-number derivation and `getNextQualifierRoundNumber` now share one
  implementation, `resolveQualifierRoundNumber`
  (`src/lib/golf/qualifier-round-number.ts`), which checks the player's
  in-progress round on that qualifier FIRST and returns it for reuse instead
  of deriving a number to insert with — closing a 23505 loop against the
  unique index on `golf_rounds` over `(qualifier_id, player_id,
  qualifier_round_number)` (migration `20260823000000`, not scoped to
  `status='in_progress'`) that repeated on every retry. The no-id branch's
  course/date-match query is also matched against the RESOLVED number, not
  the raw incoming one, which was null whenever the client relies on
  server-side derivation.
- Change (A3, silent hole loss): a salvaged hole with no durable row on the
  target round no longer succeeds silently. New
  `checkNonDurableSalvageBeforeWrite` runs before any write (the parent round
  row included) and returns `{ error: 'hole_invalid', code: 'hole_invalid',
  hole, field, message }`, built by new `humanizeHoleFieldIssue`/
  `describeHoleInvalidDetail`. A salvaged hole that IS durable is unchanged —
  `holesAtRiskOfErasure` still refuses with `retry`.
  `submitGolfRoundComprehensive`'s own Zod-failure message uses the same
  humanizer instead of the raw `Invalid round data: holes.N.shots.0...` text,
  and carries `code: 'hole_invalid'` when the failing field is inside a hole.
- Change (A4, defense in depth): new `assertHolesPlayedMatchesPayload`
  (`src/lib/golf/holes-played-assert.ts`) checks `roundData.holes_played`
  against `holesPayload.length` before either `submit_round_atomic` call,
  since the RPC's own check
  (`COALESCE((p_round_data->>'holes_played')::INT, v_supplied_holes)`)
  accepts any count when the field is omitted.
- Change (A5, GoTrue resilience): `deleteShot`, `updateShot`,
  `deleteInProgressRound`, `getNextQualifierRoundNumber`, and
  `getPlayerQualifiers` now call `getUserResilient`
  (`src/lib/auth/resilient-get-user.ts`) instead of raw
  `supabase.auth.getUser()`, matching the transient-vs-real distinction
  `savePartialRound`/`submitGolfRoundComprehensive` already had for
  auto-save.
- Change (A6, telemetry): `src/lib/admin/observe-action-result.ts` — the
  `shot_not_found` code moved out of `ROUTINE_RECONCILIATION_CODES` (was
  `info`, now falls through to `EXPECTED_SOFT_FAILURE_CODES` at `warning`);
  the "This qualifier has already been completed" message moved from
  `USER_INPUT_REJECTION_PATTERNS` (`info`) to `EXPECTED_SOFT_FAILURE_PATTERNS`
  (`warning`). The neighbouring qualifier-lifecycle messages
  (still-open-with-a-cap, already-submitted) are untouched.
- Why: A1 — two legitimate in-progress rounds can share course + date (a
  replayed round, or a practice round with no qualifier context), and
  reusing one unconditionally let a fresh round's mostly-null holes silently
  overwrite the OTHER round's scored holes. A2 — a lost roundId on a
  server-derived qualifier round looped on 23505 with no in-app way out
  (mirrors the 33-hour-stuck incident the numberless-round guard was built
  for). A3 — a hole salvaged silently with nothing durable behind it meant
  the server never received it while the UI showed it complete, surfacing
  later as raw Zod text at submit. A4/A5/A6 close smaller gaps the same
  review pass found: a defense-in-depth check with no live failure mode
  today, five reads that could bounce a validly signed-in player mid-round,
  and two telemetry outcomes mis-tiered as nothing-failed 'info' when they
  represent loss or a stuck player.

## 2026-09-02 (follow-up) — hole_invalid reached two clients as a bare key

- Change: `handleSaveForLater` in both `new-round-client.tsx` and
  `continue-round-client.tsx` now branches on `result.error === 'hole_invalid'`
  and surfaces `result.message` — the human sentence `savePartialRound`
  already builds — instead of falling through to the generic fallback that
  throws/toasts `result.error` (the bare key `'hole_invalid'`) verbatim.
  `new-round-client.tsx`'s throw reaches `FairwaySaveRoundModal`
  (`src/components/fairway/pages/rounds-new/FairwaySaveRoundModal.tsx`),
  which renders `err.message` directly in the exit-round sheet;
  `continue-round-client.tsx`'s toast rendered `result.error` the same way.
- Why: `hole_invalid` is a new result shape this same review pass introduced
  (A3, above); it was not yet special-cased at either "Save & Exit" call site
  the way `conflict`/`round_missing`/the completed-round codes already are,
  reproducing the exact defect class 536f99d39/6a7577c71's P1 fixed for
  `round_missing` rendering as the literal string "round_missing". Caught by
  advisor review before this cluster was reported done, not by a user report.
  The other `savePartialRound` call sites in both files
  (`persistRoundStart`, `persistCompletedHole`, the per-shot autosave, the
  queued follow-up save) were checked and are NOT affected: they either
  cannot reach `hole_invalid` by construction (`persistRoundStart` always
  sends `holes: []`) or already show a fixed generic sentence / a
  diagnostic string with a prefix rather than the bare `result.error`
  verbatim.
- Tests:
  `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.hole-invalid.test.ts`,
  `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.hole-invalid.test.ts`
  — source-inspection wiring contracts, matching the sibling
  `recovery`/`round-missing` tests for these two files.
- Verified: `npm run typecheck` (0), `npm run lint` (0), and
  `npx vitest run` over both `rounds/new/` and `rounds/continue/` test
  directories (6 files, 27 tests, 0 failures).

## 2026-09-02 (Cluster B) — client-side round tracking: nine defects on Continue and New Round

- SHA: this cluster's commit on `agent/fix-shot-tracking` (see `git log` —
  not self-referenceable at write time).
- Prior work on this branch: `536f99d39`, `08b6bbf50`, `a89e24704`
  (Cluster A, server-side round-write safety this cluster builds on).
- Change (B1, critical, data loss): shot ids rotate on every full-snapshot
  save (both round-write RPCs DELETE-then-INSERT a hole's shots per call),
  so `updateShot`/`deleteShot` routinely hit a stale id and get
  `shot_not_found` — indistinguishable from an RLS-hidden row or a genuine
  delete elsewhere. `use-edit-shot-modal.ts`'s `handleSaveEditedShot` used
  to treat this as proof of deletion on EDIT: it dispatched
  `RECONCILE_MISSING_SHOT`, filtering the shot (and the attempted edit) out
  of local history with no server write at all — the next autosave then
  persisted the shortened history, silently erasing the shot server-side.
  Fixed: on `shot_not_found`, the edit is applied to local history exactly
  as if the point update had succeeded (cascade distance updates to
  downstream shots tolerate their own `shot_not_found` the same way), and
  the corrected history reaches the server through the existing `onAutoSave`
  full-snapshot call — the same mechanism New Round already relies on, since
  its shots never carry a server id. Undo and Delete-from-Editor needed no
  code change (their existing fallthrough already applies the deletion and
  autosaves); `RECONCILE_MISSING_SHOT` is now unreachable and was removed
  (action type and reducer case both deleted from
  `use-shot-state-machine.ts`) rather than left as an invitation to wire it
  back up as "the fix."
- Change (B2, high, data loss) + B9 (folded in, same root cause): both round
  screens' `handleRoundSyncConflict`, and the shared
  `use-round-status-sync.ts` poll, used to silently adopt the server's
  `updated_at` into the optimistic-lock ref whenever they learned it —
  including when that value proved the server had moved past this device's
  own checkpoint. Since both round-write RPCs are full-snapshot REPLACE
  keyed on that ref, the next save from the resynced (but still-stale)
  device passed the lock and overwrote another device's newer holes/shots
  with no warning. Fixed: the poll no longer updates the ref when it proves
  staleness — it only invokes a new `onRoundStale` callback (previously
  unwired in both screens); `handleRoundSyncConflict` now engages a
  write-block (`roundConflictBlockedRef`, checked by every write entry
  point: autosave, hole checkpoint, save-and-exit, submit) instead of
  adopting the value. The blocked-state error banner (New Round gained one,
  see B4) shows a Reload control, and `handleBeforeUnload` skips its
  unsaved-changes prompt while blocked. B9: a background beacon save
  (`sendBeacon`/keepalive fetch, no readable response) would otherwise trip
  this same block on a SINGLE device on every phone lock — `pendingBeaconRef`
  marks that window, and exactly one apparent conflict inside it self-heals
  (adopts the value, or re-checks once) instead of blocking.
  `savePartialRound`'s no-id create/reuse success path (`golf.ts`) also
  hard-coded `updatedAt: undefined` despite both its queries already
  `.select()`ing the full row — widening this same window for a round's
  very first save; fixed via an outer-scoped `roundUpdatedAtForResponse`
  (the `round` variable itself is scoped to the no-id branch's own block and
  does not survive to the shared return path — an earlier attempt that
  returned `round?.updated_at` directly threw
  `ReferenceError: round is not defined` for every brand-new round, caught
  by this fix's own TDD test before it shipped).
- Change (B3, high): Continue Round's `handleAutoSave` fired its primary
  server save as `void executeServerSave(...)` — the promise
  `handleAutoSave` returned resolved before the network round-trip started,
  so `useShotStateMachine`'s retry/circuit-breaker (which only engages on a
  REJECTED promise) never saw a failure; the chip showed "Saved" regardless.
  Fixed by inlining and awaiting the save, rethrowing an unrecognized
  failure. Hole checkpoints (`persistCompletedHole`) were already awaited
  and are untouched — kept on their own bounded retry path deliberately.
- Change (B4, high): New Round's recovery dialog rendered only inside the
  tracking-step JSX (reachable only after `persistRoundStart` has already
  created a server round), so a recovery snapshot found on mount could never
  be offered on the setup screen. Hoisted the dialog and its handlers above
  the setup/holes early return; rendered in both branches from one
  `recoveryDialog` value. `handleDiscardRecovery` cleared a hard-coded
  `_new_<playerId>` key instead of the snapshot's own `roundId` (which can
  be a real server id once a round has survived past its first auto-save),
  leaving the real snapshot behind to resurface later — fixed to clear
  `newRoundRecoveryData?.roundId ?? null`. New Round's tracking step gained
  a visible, dismissible `role="alert"` error banner (Continue Round already
  had one) — every `setError` during tracking had no surface at all outside
  an active submit attempt, since `SubmitOverlay`'s own `error` prop only
  renders while `step === 'submitting'`.
- Change (B5, high): client-side bounds now match (or, where the server has
  none, impose) the server's Zod limits. `distanceToHoleBefore` (the "distance
  remaining"/"leave distance"/"proximity" a player enters on one shot,
  becoming the NEXT shot's before-distance) is capped at 1000 yards in both
  `FairwayShotEntry`'s `nextShotBlocker` (the message) and
  `FairwayShotTracking`'s `isReadyForNextShot` (the actual disabled state —
  the two must mirror VERBATIM, since the blocker short-circuits to `null`
  whenever `ready` is true). `FairwayHoleConfig`'s hole-yardage editor
  gained a 999-yard ceiling (the server schema has none at all) and its
  disconnected `min="50" max="700"` HTML attributes now agree with the JS
  validation. Every write entry point (`persistCompletedHole`,
  `handleAutoSave` in both screens) now branches on `hole_invalid`
  explicitly: it surfaces the specific sentence via new
  `describeRoundWriteResult` (round-missing-recovery.ts) and never retries
  or marks the hole checkpointed — before this fix `persistCompletedHole`
  fell to its generic "keep this screen open and try again" fallback
  (actively misleading, since retrying an invalid payload can never
  succeed) and `handleAutoSave` would have thrown into the circuit breaker.
- Change (B6): new `describeRoundWriteResult` (round-missing-recovery.ts)
  is the one helper for every round-write call site — handles both
  `savePartialRound`'s bare-key-plus-`message` shape and
  `submitGolfRoundComprehensive`'s already-a-sentence shape for
  `hole_invalid`. New `ROUND_CONFLICT_MESSAGE` is the single source both
  `describeRoundWriteFailure('conflict')` and the B2 write-blocking UI draw
  from. Migrated onto it: `persistRoundStart` (New Round — `busy`/`retry`
  could reach it verbatim), `handleSaveForLater` (Continue Round),
  `FairwayRecoverRound.tsx`'s two restore branches (a first-call
  `busy`/`retry`/`conflict`/`hole_invalid` passed through
  `writeRoundRecreatingIfMissing` with the bare key intact, since that
  helper only humanizes a FAILED re-create), and
  `src/lib/offline/sync-engine.ts`'s four per-item round-sync error pushes
  (which also used to concatenate the internal offline id into the
  player-facing string — `` `Round ${offlineId}: ${result.error}` `` —
  reaching `OfflineIndicator` verbatim via `offline-sync-store.ts`'s
  `syncError`).
- Change (B8, low): `FairwayShotEntry`/`FairwayShotTracking` now reject a
  resolved distance of 0 (a valid, finite, non-negative number that passed
  every prior check) with "Select Hole if you holed out, or enter the
  actual distance remaining" — before this fix, `handleNextShot` discovered
  the same 0 value on its own and bailed with no player-facing feedback at
  all (a dead tap on an apparently-enabled button). Separately, a new
  `currentHoleIndexRef` lets `handleNextShot`/`handleRetryHoleCheckpoint`
  compare the LIVE current hole against the hole a completed-hole checkpoint
  started on: the hole-nav pills allow navigating away while a checkpoint is
  still in flight, and its stale resolution (success or failure) used to
  overwrite `holeCheckpointStatus` unconditionally — painting a false
  "retry?" banner on a hole that never attempted a save.
- Not addressed (explicitly scoped out, not silently skipped): B7's
  correction path for a round already created with a future date BEFORE
  this fix shipped. The prevention half shipped (date input capped at
  today; `validateBeforeStart` rejects a future date before
  `persistRoundStart` runs) — building a date-correction UI for an
  already-stuck legacy round was judged a separate, narrower feature not
  worth the added surface/risk under this cluster's scope; tracked as an
  open gap in `memory/features/golf-round-lifecycle.md`, not declared solved.
- Why: B1/B2 are both silent-data-loss classes on the same full-snapshot-
  REPLACE architecture Cluster A hardened server-side — this cluster closes
  the client-side halves (stale shot ids, stale optimistic-lock tokens) the
  server-side fixes could not reach. B3/B4/B5/B8 are all "the player sees
  nothing, or the wrong thing, when a save fails" defects on the SAME two
  screens Cluster A also touched. B6 consolidates five independent copies
  of "turn a signal key into a sentence" into one helper so the next screen
  doesn't need a sixth.
- Tests: see `memory/ledgers/tests/shot_tracking.md`, same date.
- Verified from the worktree, each captured to a file, exit code checked:
  `npm run typecheck` (0), `npm run lint` (0),
  `npm run docs:schema-drift` (0, 35 vs baseline 35, no new drift),
  `npm run docs:path-drift` (0, 0 vs baseline 0), and `npx vitest run` over
  every touched/added test file plus
  `src/app/golf/(dashboard)/dashboard/rounds/`, `src/app/golf/actions/`,
  `src/components/fairway/pages/rounds-new/`,
  `src/components/fairway/pages/rounds-recover/`,
  `src/components/fairway/pages/rounds-tracking/`, `src/hooks/golf/`,
  `src/lib/golf/`, `src/lib/offline/`, `src/lib/admin/`, `src/lib/auth/`,
  and `src/lib/utils/` (278 files, 3274 tests, 0 failures).
  `npm run build` deliberately not run (worktree has no `.env.local`; CI
  builds).

## 2026-09-02 (Cluster C) — discard-race zombie rounds, qualifier-closed submit loop, silent backup failure

- SHA: `7d05175ad` on `agent/fix-shot-tracking`. That code commit carried no
  doc updates (flagged in its own message); these entries were added in the
  merge commit that brought `main` (through #1737) into the branch.
- Change (C1, medium-high, zombie rounds): tapping Discard fires
  `deleteInProgressRound` while a checkpoint or auto-save for the SAME round
  id can still be in flight; when the delete landed first, that save's
  `round_missing` answer hit a branch that dropped the id and re-created the
  round. Both round screens now hold a `roundDiscardedRef`, set synchronously
  in `handleDeleteRound` BEFORE the delete call (cleared if the delete fails),
  and every `round_missing` branch that would drop the id or re-create checks
  it first — New Round's `persistCompletedHole` loop, `handleAutoSave`
  primary and queued follow-up, `handleSaveForLater`; Continue Round's shared
  `recreateMissingRound` and `handleSaveForLater`.
- Change (C3, medium, submit loop): `submit_round_atomic` refuses a submit
  into a qualifier the coach has closed with a sentence that also contains
  "already been completed" — about the QUALIFIER — and both round screens'
  `isCompletedRoundError` matched it as a bare substring, so
  `redirectToCompletedRound()` sent a still-`in_progress` round to its detail
  page, which redirected straight back to Continue Round, on every retry.
  New `isQualifierClosedError` (`src/lib/golf/round-missing-recovery.ts`) is
  excluded first in both screens and in `FairwayRecoverRound`; a matching
  submit result sets `qualifierClosed`, which shows a terminal message, hides
  "Retry submit" (B5 precedent), and offers "Save as practice round" through
  the existing `updateRoundType` path (`reclassify_golf_round` already
  accepts an `in_progress` round) via a new
  `secondaryActionLabel`/`onSecondaryAction` pair on
  `FairwayRoundSubmitOverlay` — rendered only when both are passed, so no
  existing caller changes.
- Change (C5, low, silent backup failure): `emergencySave` returned `false`
  when localStorage was full or unavailable even after compacting old saves,
  and no call site in either round screen read that boolean. It now
  dispatches `EMERGENCY_SAVE_DEGRADED_EVENT` (`src/lib/utils/emergency-save.ts`)
  at most once per browser session; both round screens listen and show one
  warning toast. The IndexedDB mirror (`queueRecoverySnapshot`) already ran
  unconditionally and is unchanged — this covers only the missing notice.
- Merge reconcile (same commit as these entries): `main`'s #1728 gave
  `deleteShot`/`updateShot` an `isTransientAuthCheckFailure` branch reading
  the raw `supabase.auth.getUser()` error, while Cluster A's A5 had replaced
  that call with `getUserResilient`, which exposes no error. Resolved by
  keeping `getUserResilient` and re-reading the raw error only on its null
  path, so a signed-in edit stays one auth call and a transit failure still
  yields #1728's retry sentence; both suites
  (`golf-shot-edit-transient-auth.test.ts`, `golf-actions-resilient-auth.test.ts`)
  pass unchanged.
- Not done, deliberately, and not silently: C2 — the v1 offline drain
  (`syncV1Rounds` in `src/lib/offline/sync-engine.ts`) still auto-submits a
  stored terminal submission unattended, with no staleness compare against
  the server round's current holes; C4 — recovery-snapshot equivalence
  normalisation — its red-first spec was committed by `7d05175ad` (the
  `(C4)` describe block in `src/lib/utils/emergency-save.test.ts`, two of
  whose cases fail against the unchanged source, despite that commit's own
  message saying nothing was written) and is `describe.skip`ped in the merge
  commit rather than deleted, so the follow-up starts by un-skipping it; B7
  remainder — no
  correction path for a round already created with a future date (see the
  Cluster B entry above); migration D — the submit trigger fan-out (measured
  on the local stack 2026-09-02: one submit fired 38 round updates and 38
  player-stats recomputes) was not attempted, and this branch carries no
  migrations.
- Tests: see `memory/ledgers/tests/shot_tracking.md`, same date.
- Verified for the merge commit, each captured to a file, exit code checked:
  `npm run typecheck` (0), `npm run lint` (0), `npx vitest run --project
  unit --project unit-dom` over `src/app/golf/(dashboard)/dashboard/rounds/`,
  `src/app/golf/actions/`, `src/components/fairway/pages/rounds-new/`,
  `src/components/fairway/pages/rounds-recover/`,
  `src/components/fairway/pages/rounds-tracking/`, `src/hooks/golf/`,
  `src/lib/golf/`, `src/lib/offline/`, `src/lib/utils/` and `src/lib/auth/`
  (205 files, 2281 passed, 4 skipped — the C4 block — 0 failed),
  `node scripts/knowledge/document-inventory.mjs --check` (0),
  `npm run docs:path-drift` (0, 0 vs baseline 0). Not run locally:
  `npm run build` (no `.env.local` in the worktree; CI builds),
  `lint:ratchet`, `docs:schema-drift`, `knowledge:check` — the push CI runs
  them.

## 2026-09-02 — Postgres-side Flight Recorder checkpoints reach helm_debug.trace_steps

- Migration: `supabase/migrations/20260902160000_postgres_checkpoints_reach_trace_steps.sql`
  — HELD, R3, not applied. See `supabase/migrations/HELD.md` for the
  pre-apply fingerprint and the reviewer-not-yet-performed note.
- Change: `helm_private.trace_checkpoint` and `helm_private.trace_exception_checkpoint`
  (called from inside `submit_round_atomic` / `save_partial_round_atomic`,
  neither of which changed) now UPSERT a row into `helm_debug.trace_steps` in
  addition to their existing `RAISE LOG`, wrapped in their own
  `BEGIN...EXCEPTION WHEN OTHERS...END` so a broken checkpoint insert cannot
  fail or slow the round write. `layer` is always `postgres`, `requiredness`
  always `best_effort`, `parent_step_key`/`function_name`/`table_name` are
  derived from the step key (or from an explicit `metadata` key), and neither
  is ever overwritten once recorded — an UPSERT on an existing key (only
  possible for the two RPC-level entry keys, which the Server Action side
  also writes) never fights the application layer over a field it owns.
- Why: measured in production 2026-09-02, 1313 trace runs / 2420 steps carried
  ZERO steps with `function_name`/`table_name`/`trigger_name`, because the
  Postgres-side checkpoints have only ever logged, never persisted, since
  `20260825200811` shipped them. `src/app/admin/traces/trace-tree.ts` had
  never rendered a Postgres-layer child under an RPC node as a result — not
  because the tree builder couldn't (verified it already folds an arbitrary
  observed `parent_step_key` correctly; no change needed there) but because
  no such row had ever existed to render.
- Known limitation, stated in the migration header and in
  `memory/features/shot-tracking.md`'s Flight Recorder section: the
  exception-variant's new row does NOT survive the outer RPC's own
  rollback-and-reraise on any current call site (both RPCs' handler ends in
  a bare `RAISE`), so `RAISE LOG` remains the only durable failure record
  today. The write is added anyway — fail-open, harmless, and becomes
  durable the moment a future caller catches the RPC's error without rolling
  back the whole transaction.
- Second known limitation, found while verifying, not by inspection alone:
  `helm_debug.trace_runs.observed_step_count` (the count `helm_debug_list_traces`
  shows in the Bridge's trace list) is maintained only by
  `public.helm_debug_record_trace_step`'s own recount, which these new
  Postgres-side INSERTs never call — confirmed locally by running a traced
  `submit_round_atomic` and reading `observed_step_count = 0` against 7 real
  rows already in `trace_steps`, then confirming one subsequent call to
  `helm_debug_record_trace_step` for the same trace brought it to 7. Bounded,
  not indefinite: every current call site reaches that facade once per
  request immediately after the RPC returns. The trace *detail* view
  (`helm_debug_get_trace`, this migration's own contract) is unaffected
  either way, since it reads `trace_steps` directly. Recorded in the
  migration header and in `supabase/migrations/HELD.md`'s row.
- Feature-awareness gap closed in the same change: `memory/registry.yml` had
  no mapping anywhere for `src/lib/observability/helm-flight-recorder.ts` or
  `golf-round-flight-workflow.ts` before this — `npm run knowledge:map`
  resolved either file to zero features. Added `src/lib/observability/**` to
  `shot_tracking.code.services` (the feature that already owns `golf.ts`, the
  recorder's only caller) and four migration globs
  (`*helm_flight_recorder*`, `*helm_debug*`, `*trace_*`, alongside the
  registry's existing globs for round- and shot-related migration files)
  to `shot_tracking.code.db`, since none of the four flight-recorder
  migration filenames matched the prior globs.
- Tests: new flight-recorder checkpoint pgTAP suite (`supabase/tests/rls/`,
  20 assertions) — real `submit_round_atomic`/`save_partial_round_atomic` calls
  as an authenticated player with a valid `_helm_trace`, asserting substep
  rows carry `parent_step_key`/`layer`/`function_name`/`table_name`; the
  exception variant's own contract (called directly, since triggering it via
  an actual uncaught RPC exception would require catching the re-raise at a
  savepoint that then discards the very row under test — see the migration
  header and the test file's own comment); a checkpoint insert failure
  (`helm_debug.trace_steps` renamed inside a `SAVEPOINT`) does not fail the
  round write, and the actual hole/shot data is still persisted; and tracing
  disabled writes nothing (with an explicit `helm.trace_enabled` reset, since
  `configure_trace_context` only ever sets that GUC when the CURRENT call
  asks for tracing, never clears it, so an untraced call sharing one test
  transaction with a traced one would otherwise inherit the earlier state —
  not a production concern, since each request there is its own transaction).
  The flight-recorder, atomic-snapshot-integrity, lifecycle-privilege-contracts
  and round-submit-identity pgTAP suites (`supabase/tests/rls/`) all re-run
  clean against the patched functions (63 assertions, 0 failed). Two
  assertions were added after a
  review pass surfaced that the first draft's fail-open and UPSERT-ownership
  claims were each *asserted* but not *discriminated*: (1) the renamed-table
  test originally checked only that the round write still succeeded, which
  would be equally true if PL/pgSQL's plan cache had resolved the INSERT to
  the renamed relation by OID and let it through silently — added a direct
  count against the renamed table for that trace_id, confirmed 0 (RENAME
  does force a relcache-invalidation replan here, so the checkpoint's own
  `EXCEPTION WHEN OTHERS` genuinely fires); (2) `db.submit_round_atomic` /
  `db.save_partial_round_atomic` are two of the eight step keys the JS layer
  already records for every traced call, so the `ON CONFLICT` branch these
  functions' entry checkpoint always hits is the NORMAL production path for
  those two keys, not an edge case — yet no assertion had pre-seeded a
  JS-shaped row (`layer = 'supabase'`, `requiredness = 'required'`) and
  confirmed the Postgres UPSERT leaves both fields alone. Added a fifth
  fixture trace exercising exactly that; both fields held. 24 assertions
  total in the flight-recorder checkpoint pgTAP suite now, full `test:rls`
  still 74/74 files, 0 failed.
- Confirmed via the Supabase MCP (`execute_sql`, read-only `SELECT`) that
  `helm_debug.trace_steps`, `public.submit_round_atomic`,
  `public.save_partial_round_atomic`, `helm_private.trace_checkpoint` and
  `helm_private.trace_exception_checkpoint` are ALL owned by `postgres` in
  production — the specific fact the migration header's "runs with the
  table owner's implicit privileges" claim depends on, checked directly
  rather than inferred from the one earlier ownership query the header
  already cited for `trace_steps` alone.
- Also confirmed with a direct `sqlfluff lint ... --dialect postgres --rules
  core` run against exactly
  `supabase/migrations/20260902160000_postgres_checkpoints_reach_trace_steps.sql`:
  zero violations, matching what `node scripts/sql-lint-ratchet.mjs`'s
  no-regressions result implied but did not, on its own, prove for this one
  file.
- End-to-end, local Docker stack (migration applied there via `psql -f`,
  atomic, `ON_ERROR_STOP=1`): a real `submit_round_atomic` call with a valid
  `_helm_trace` produced 7 `helm_debug_get_trace` rows —
  `db.submit_round_atomic` (started, no parent) plus `.update_round`
  (`golf_rounds`), `.replace_snapshot`, `.insert_holes` (`golf_holes`),
  `.insert_shots` (`golf_shots`), `.recalculate_strokes_gained`
  (`golf_rounds`) and `.commit`, every substep `success`/`best_effort` with
  `function_name = submit_round_atomic` — matching the migration's design
  exactly.
- Verified, each captured to a file, exit code checked: `npm run test:rls`
  (74/74 files, local Docker stack — 0), `npx vitest run
  src/app/admin/traces src/lib/observability` (9 files / 82 tests — 0),
  `npm run typecheck` (0), `npm run lint` (0), `node scripts/sql-lint-ratchet.mjs`
  (0 regressions — the new migration file itself lints clean under
  `sqlfluff --dialect postgres --rules core`, zero violations),
  `node scripts/markdown-lint-ratchet.mjs` (0),
  `node scripts/knowledge/document-inventory.mjs --check` (0),
  `tsx scripts/knowledge/gen-feature-map.ts --check` (0). Not run
  locally: `npm run build` (no `.env.local` in this worktree; CI builds).
- **Merge caution, not a defect in this branch.** This branch's base
  (`9298170b1`) predates `main`'s `b3ec84872`, which flipped three
  `HELD.md` rows (the two baseball index migrations and
  `20260901140000`) to `APPLIED — hold discharged`. This branch's own
  `HELD.md` diff is additive against its OWN base — it does not touch
  those three rows — but a merge/rebase onto current `main` must keep
  `main`'s discharge wording for those three and land only this branch's
  new `20260902160000` row underneath them. Resolving the conflict the
  other way (keeping this branch's pre-discharge copies) would silently
  revert three already-applied migrations back to `HOLD`, which is the
  exact failure `HELD.md`'s own header exists to prevent.
- The local Docker stack's `supabase_migrations.schema_migrations` now
  carries a row for `20260902160000` (this migration was applied there,
  deliberately, for the end-to-end verification above) even though it is
  `HELD` in production. That is correct for a local dev stack and must not
  be read as evidence of a production apply — `HELD.md` is the source of
  truth for production state, not the local schema_migrations table.

### Follow-up, same day — closing the reviewer's high finding on `20260902160000`

- New migration: `supabase/migrations/20260902170000_blind_check_ignores_postgres_layer.sql`
  — HELD, R3, not applied. `db-migration-reviewer` review of `20260902160000`
  (verdict HOLDS, finding (2)) found that once it ships, `trace_checkpoint`'s
  unconditional Postgres-layer UPSERT gives every successful
  `submit_round_atomic`/`save_partial_round_atomic` call at least one
  Postgres-written row in `helm_debug.trace_steps`, so `helm_debug_finalize_trace`'s
  plain `count(*)` blind check (added by `20260901140000`) is never 0 for
  those two workflows again — reopening the exact 1,097-trace blind-success
  shape `20260901140000` closed. This migration narrows the blind check to a
  second, narrower count — rows whose `layer` is not `'postgres'` — while
  `observed_step_count` on the run keeps counting every row, both layers,
  unchanged. Reproduced the defect and the fix locally in rolled-back
  transactions, before and after applying: a trace carrying only
  Postgres-layer rows against `expected_step_count > 0` finalized `success`
  before this migration and `warning` after it.
- Applied `20260901140000` (not previously applied to this worktree's local
  stack — confirmed via its own pre-apply fingerprint, which matched
  exactly) and then the new `20260902170000` to the local Docker stack via
  `psql -f`, `ON_ERROR_STOP=1`, in that order, each followed by an explicit
  `supabase_migrations.schema_migrations` insert. Neither migration is
  applied in production — see `HELD.md`.
- Extended the flight-recorder checkpoint pgTAP suite (`supabase/tests/rls/`)
  with a new Test G (4 assertions, built directly against
  `helm_debug.trace_runs`/`trace_steps` rather than through the RPCs, since
  the claim under test is `helm_debug_finalize_trace`'s own counting logic):
  a trace with only Postgres-layer steps against a nonzero
  `expected_step_count` still downgrades to `warning`, with
  `status_downgraded_from` recorded; a trace with at least one
  application-layer step alongside Postgres-layer ones still finalizes
  `success`; and `observed_step_count` counts every row regardless of layer
  in both cases. `plan(24)` -> `plan(28)`.
- Test F's fixture/comment — the refuter finding that Test F had pinned
  `db.submit_round_atomic` (declared layer `'postgres'` by both sides
  already, so no override could ever be observed) instead of
  `db.save_partial_round_atomic` (the key where the JS and Postgres layers
  actually diverge) — was already corrected on this branch by the
  `test(observability): discriminate ...` commit, and independently recorded
  in `HELD.md`'s `20260902160000` row. Verified against
  `src/lib/observability/golf-round-flight-workflow.ts` that the current
  comment and fixture are accurate (`db.submit_round_atomic` declares
  `layer: 'postgres'`, `db.save_partial_round_atomic` declares
  `layer: 'supabase'`, matching what both `helm-flight-recorder.ts` call
  sites and the file's own comment say); no further change was needed.
- `HELD.md`: added the `20260902170000` row, with the pre-apply fingerprint
  of the LOCAL stack's `helm_debug_finalize_trace` taken immediately after
  applying `20260901140000` there — md5 `e017e6980ce7045f46b5e83c73580bdc`,
  length 2229 (differs from production's own post-apply fingerprint for
  `20260901140000`, `338d5f344491586a6ab416ed0798548a` / length 2021, only
  because `pg_get_functiondef`'s formatting is not byte-identical across the
  local and production Postgres builds, not because the function bodies
  differ) — and extended the `20260902160000` row's apply-order-caution
  finding (2) with a note that it is closed by `20260902170000`, and that
  the two should apply no later than each other, ideally in the same batch.
- Verified, each captured to a file, exit code checked: `npm run test:rls`
  (74/74 files, local Docker stack — 0), `node scripts/sql-lint-ratchet.mjs`
  (0 regressions), `node scripts/markdown-lint-ratchet.mjs` (0, re-run after
  the `HELD.md` edit), `npm run typecheck` (0), `npm run lint` (0),
  `node scripts/knowledge/document-inventory.mjs --check` (0, no regen
  needed). Not run locally: `npm run build` (no `.env.local` in this
  worktree; CI builds).
