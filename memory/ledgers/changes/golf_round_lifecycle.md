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
