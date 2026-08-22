# Shot Tracking change ledger

## 2026-08-22 — preserve rounds after partial-save child failures

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: `savePartialRound` no longer deletes an `in_progress` parent when a
  hole or shot upsert fails. The player recovery surfaces the freshest valid
  emergency save, including a snapshot keyed by a now-unavailable server ID.
- Why: a transient child-write failure could turn an otherwise recoverable
  active round into a missing round after a user returned from sign-in.

## 2026-08-22 — serialize local shot mutations

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-delete-shot-stale-id.md`.
- Change: Undo, Edit Shot save, and Edit Shot delete now share one in-flight
  mutation guard. A server-confirmed absent shot reconciles the stale local
  entry without replaying a destructive request.
- Why: active golfers could be blocked by a stale ID after a concurrent or
  completed delete, and downstream edit writes could outlive the visible edit.
