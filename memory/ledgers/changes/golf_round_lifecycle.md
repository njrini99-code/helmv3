# Golf Round Lifecycle change ledger

## 2026-08-22 — active-round stale-shot reconciliation

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-delete-shot-stale-id.md`.
- Change: server-side `deleteShot` now returns the stable `shot_not_found`
  code when the user-scoped lookup finds no row. Undo and Edit Shot use a
  shared local single-flight guard, reconcile that specific stale reference,
  and wait for cascading edit writes before releasing the guard.
- Why: concurrent Undo/Edit actions could apply multiple local-history
  removals, while an already-completed delete surfaced as a misleading
  production server error to the golfer.

## 2026-08-25 — durable checkpoint, recovery, and lifecycle repair

- Release candidate: round-lifecycle reliability promotion (final promoted SHA
  is recorded in `memory/ledgers/deployments.md`).
- Change: completed-hole checkpoints retain valid emergency saves without a
  time expiry; recovery is scoped to the active player and no longer prompts
  for data already durable on the server. Qualifier setup/manual closure and
  saved-round identity rules now fail with actionable messages instead of
  mutating or stranding a player's existing round.
- Database: restores the protected round save/submit lifecycle contract,
  replaces the invalid generic active-round DELETE trigger with typed trigger
  functions, and permits only a coach/player-authorized editorial recap write
  on completed rounds.
- Why: a stale migration could break roster/qualifier administration, while
  older recovery and recap paths could surface misleading errors despite the
  player's shots being intact.

## 2026-08-25 — atomic snapshot hole-group integrity

- Status: uncommitted local reliability repair; not deployed.
- Change: `save_partial_round_atomic` and `submit_round_atomic` now reject a
  snapshot before any replacement work when a shot group names a hole that is
  absent from `p_holes`. Their former unmatched-hole fallback now raises rather
  than silently continuing, preserving transaction safety if a future path
  bypasses the preflight.
- Why: both RPCs previously returned `success: true` while dropping unmatched
  shot groups; submit could mark that incomplete graph as completed.

## 2026-08-25 — preserve all failed submit/checkpoint paths

- Status: uncommitted local reliability repair; not deployed.
- Change: removes the live direct delete/reinsert submit fallback and retains
  the protected RPC as the sole completion writer. A client-side abort is
  read-back reconciled only; every other failure returns the durable
  server/device recovery path. The auto-save fallback no longer deletes an
  in-progress parent round if an upsert of a hole or shot fails.
- Why: a branch divergence reintroduced a legacy fallback that could delete a
  round graph after an RPC error, while checkpoint cleanup could erase an
  existing Continue Round record after a transient child-write failure.
