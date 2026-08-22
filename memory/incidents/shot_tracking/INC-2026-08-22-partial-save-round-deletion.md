# INC-2026-08-22 — partial-save child failure could delete an active round

- Feature: `shot_tracking` (also affects the Golf Round Lifecycle feature)
- Status: verified — release and production verification pending
- Risk: R2 — active player workflow and persisted scoring data
- First seen: 2026-08-22
- Last seen: 2026-08-22
- Bridge fingerprint: `dec06c7d` (`Load failed`, client, auto-save initial attempt)
- External tracker: https://github.com/njrini99-code/helmv3/issues/1602
- Repair SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`

## User impact

A golfer can enter a full round, encounter an interrupted or failed save, be
returned to sign-in, and then find no in-progress round in the library. The
2026-08-22 customer report describes that exact outcome during shot tracking.
Bridge recorded eight client `Load failed` events across seven users on the
new-round route the same day. Those events are network/degradation evidence;
they do not prove that every occurrence reached the server cleanup branch.

## Confirmed root cause and invariant

`savePartialRound`'s no-local-round-ID recovery branch first reuses or creates
an `in_progress` parent, then upserts holes and shots. If either child upsert
failed, it deleted the parent round as cleanup. A transient child-write failure
therefore converted an otherwise retryable save into a missing active round.

Invariant: child persistence failures must preserve the parent round, all
previously durable child data, and the device emergency snapshot. Recovery may
create or resume a round, but it must never erase player-entered scoring data.

## Repair

- Removed the destructive parent-round cleanup from failed hole and shot
  upserts in `savePartialRound`.
- Added regression coverage for both failure modes against an existing
  recoverable in-progress round.
- Added `loadLatestEmergencySave()` and routed both the player rounds recovery
  banner and new-round recovery dialog through it. A local snapshot keyed by a
  former server round ID is now discoverable even after that server row is
  unavailable; restore starts a fresh save rather than targeting the missing ID.

## Verification

- Reproduction before repair: simulated hole and shot upsert failures removed
  the existing in-progress parent round in both cases.
- Regression suite after repair: 88 tests across partial-save, emergency-save,
  recovery-banner, shot-state-machine, and new-round decision coverage passed.
- Changed-file lint passed.
- Remaining before release: full static preflight, production build, PR CI,
  release approval/window, and post-deploy monitoring of fingerprint
  `dec06c7d` plus any `savePartialRound` child-write failures.

## Customer recovery — 2026-08-22

The affected qualifier round was confirmed intact in production with all 18
holes scored and 81 stored shots. Under explicit owner direction it was marked
completed with its stored totals, linked to the existing qualifier entry, and
recalculated into the round statistics cache. Post-write verification confirmed
that it is visible in the completed-round query and qualifier record.

## Durability follow-up — 2026-08-22

The initial repair preserved an existing parent round, but a new round could
still enter tracking before that parent had been committed and a completed-hole
save was launched without awaiting its acknowledgement. The follow-up makes
server parent creation a prerequisite to tracking, checkpoints every completed
hole before advancing, and removes the normal-library device-only recovery
banner. This closes the gap that made the banner appear during ordinary play
instead of reserving local storage for exceptional recovery.
