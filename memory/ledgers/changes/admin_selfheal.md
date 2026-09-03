# Admin Self-Heal change ledger

## 2026-09-02 — Carved out of admin_platform

- SHA: recorded on merge of `agent/bridge-worldmodel`.
- New registry entry `admin_selfheal`, split out of the single `admin_platform`
  entry (ADR-2026-09-03-control-plane-owner-decisions, memory/decisions/ — on the parallel Bridge control-plane session's branch, not yet on this branch,
  closing `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). Owns the Diagnose/Repair/
  Close stages of the self-healing loop: `selfheal-*.ts`, `rca*.ts`,
  `triage-*.ts`, `auto-resolve.ts`, the `selfheal-triage` and `log-retention`
  crons, `/admin/self-heal`, the Repair launchd runner and config, and
  `docs/ai-system/selfheal/**`.
- No code changed in this commit — this ledger records the registry/doc split
  itself, which the ADR frames as "a real behavior change to the knowledge
  system": every session's `knowledge:map` routing for these paths now
  resolves here instead of to the undifferentiated `admin_platform` node, and
  Phase E's world-model blast-radius graph (same change) needs that
  granularity to attribute edges meaningfully.
- Current-state doc: `memory/features/admin-selfheal.md`, split from
  `memory/features/admin-platform.md`. See that file's own ledger entry
  (`memory/ledgers/changes/admin_platform.md`, same date) for the full split
  rationale, shared across all three carved entries.
- Full test history for this code predates the split and lives in
  `memory/ledgers/changes/admin_platform.md` / `memory/ledgers/tests/
  admin_platform.md`'s earlier entries; this ledger starts fresh at the split.
