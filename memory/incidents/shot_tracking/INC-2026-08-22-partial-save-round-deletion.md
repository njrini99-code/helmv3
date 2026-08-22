# INC-2026-08-22 — partial-save child failure could delete an active round

- Feature: `shot_tracking` (also affects `golf_round_lifecycle`)
- Status: verified — release and production verification pending
- Risk: R2 — active player workflow and persisted scoring data
- First seen: 2026-08-22
- Last seen: 2026-08-22
- Bridge fingerprint: `dec06c7d` (`Load failed`, client, auto-save initial attempt)

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
