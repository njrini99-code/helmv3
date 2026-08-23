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

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-delete-shot-stale-id.md`.
- Change: Undo, Edit Shot save, and Edit Shot delete now share one in-flight
  mutation guard. A server-confirmed absent shot reconciles the stale local
  entry without replaying a destructive request.
- Why: active golfers could be blocked by a stale ID after a concurrent or
  completed delete, and downstream edit writes could outlive the visible edit.

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
