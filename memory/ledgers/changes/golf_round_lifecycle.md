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
