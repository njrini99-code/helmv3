# Shot Tracking change ledger

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
