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

## 2026-08-25 — reject mismatched durable snapshots

- Status: uncommitted local reliability repair; not deployed.
- Change: the database rejects a save or submit payload whose shot groups do
  not correspond to its hole snapshot before it can replace persisted shots.
- Why: a stale or malformed client payload must leave the last confirmed shot
  graph available through Continue Round rather than silently dropping data.

## 2026-08-25 — rollback-proof shot workflow recorder

- Status: uncommitted local observability work; not deployed.
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

- SHA: pending commit on PR #1604; not deployed.
- Change: device backups are player-scoped, acknowledgement cleanup cannot
  overtake a later snapshot, and the explicit completed-hole retry shares the
  same synchronous in-flight guard as normal shot submission.
- Why: rapid repeat taps could enqueue duplicate checkpoints, and an old
  asynchronous cache delete could otherwise remove a later recoverable shot.

## 2026-08-23 — reconcile a stale Edit Shot reference safely

- SHA: pending commit on the stale-edit reconciliation release.
- Change: `updateShot` now returns the same stable `shot_not_found` code as
  `deleteShot` when the row has already been removed. Edit Shot closes its
  stale editor, removes only that local row, and recomputes the affected
  hole's state from the remaining server-backed history.
- Why: an Undo, second tab, or disconnected response could leave a browser
  editing a no-longer-existent shot. Treating that condition as an ordinary
  save failure falsely told golfers their action was broken and invited unsafe
  retries.

## 2026-08-23 — harden legacy checkpoint transport and background re-saves

- SHA: pending commit for the production checkpoint guard.
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
