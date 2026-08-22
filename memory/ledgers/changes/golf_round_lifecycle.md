# Golf Round Lifecycle change ledger

## 2026-08-22 — require server-backed start and completed-hole checkpoints

- SHA: `a68d7c299` (implementation commit; amended after ledger stamping).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: the round parent is persisted before tracking starts, completed-hole
  writes are acknowledged before the player advances, and Continue Round is
  the normal unfinished-round recovery surface.
- Why: transient saves, app backgrounding, or browser closure must not make a
  started round disappear from the player’s server-backed round list.

## 2026-08-22 — preserve parent rounds on child-write failure

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: partial-save hole and shot upsert errors retain the `in_progress`
  parent row and prior durable data; a local snapshot from a missing server
  round is discoverable through the player recovery path.
- Why: an active round must remain retryable after a transient save failure,
  including when a user has returned from sign-in without its local round ID.

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
