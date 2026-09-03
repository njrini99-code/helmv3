<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Admin Reliability Collector change ledger

## 2026-09-02 — Carved out of admin_platform

- SHA: recorded on merge of `agent/bridge-worldmodel`.
- New registry entry `admin_reliability_collector`, split out of the single
  `admin_platform` entry (ADR-2026-09-03-control-plane-owner-decisions, memory/decisions/ — on the parallel Bridge control-plane session's branch, not yet on this branch, closing
  `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). Owns the Collect stage of the
  self-healing loop: `src/lib/reliability/**`, the three-hourly
  `src/app/api/cron/reliability-triage/**` cron, and `/admin/reliability`.
- No code changed in this commit — this ledger records the registry/doc split
  itself, which the ADR frames as "a real behavior change to the knowledge
  system": every session's `knowledge:map` routing for these paths now
  resolves here instead of to the undifferentiated `admin_platform` node, and
  Phase E's world-model blast-radius graph (same change) needs that
  granularity to attribute edges meaningfully.
- Current-state doc: `memory/features/admin-reliability-collector.md`, split
  from `memory/features/admin-platform.md`. See that file's own ledger entry
  (`memory/ledgers/changes/admin_platform.md`, same date) for the full split
  rationale, shared across all three carved entries.
- Full test history for this code predates the split and lives in
  `memory/ledgers/changes/admin_platform.md` / `memory/ledgers/tests/
  admin_platform.md`'s earlier entries; this ledger starts fresh at the split.

## 2026-09-03 — Phase F remainder: change-risk scoring + rollback recommendation

- SHA: recorded on merge of `agent/controlplane-fj`.
- New pure modules `src/lib/admin/release-intel/risk-score.ts` (change-risk
  tier + itemized reasons over feature criticality / blast radius / auth-
  RLS / migration / destructive-write / incident density / test-coverage
  confidence — unknown inputs bias the tier UP, never down) and
  `src/lib/admin/release-intel/rollback.ts` (KEEP / WATCH / PAUSE_ROLLOUT /
  ROLLBACK_RECOMMENDED / UNKNOWN over reliability-snapshot window
  summaries; an unreadable candidate or baseline window is always UNKNOWN,
  never KEEP).
- `src/lib/admin/release-intel/read-model.ts` (server-only): live rollback
  recommendation for `/admin/deploys` via Supabase `background_job_logs`
  (job_type `reliability-snapshot`) + `fetchReleaseLedger()`'s existing live-
  SHA detection — no new repo-file reads. Pending-release-queue risk scores
  via defensive reads of `memory/operations/release-queue.yml`,
  `memory/registry.yml`, and `docs/generated/WORLD_MODEL.json` — every read
  wrapped so a missing file degrades to `unconfigured`, never a crash.
  **UNVERIFIED**: whether those repo files are present in the deployed
  Vercel serverless bundle — no existing runtime code in `src/lib`/`src/app`
  read `memory/**`/`docs/generated/**` before this change, and `npm run
  build` was not run against this change in the authoring session.
- CLI scripts `scripts/release-intel/score-change.ts` (`npm run risk:score
  -- --files <paths> | --diff [base]`) and
  `scripts/release-intel/evaluate-rollback.ts` (`npm run
  release:rollback-check -- --live ... | --from-json <path>`) — real-diff/
  real-registry/real-World-Model inputs, smoke-tested against this repo's
  own recent git history (`npm run risk:score -- --diff HEAD~3` correctly
  resolved 9 touched features and scored R3 on a migration+auth-touching
  diff) and a synthetic JSON fixture for the rollback path (live Supabase
  path is UNVERIFIED — no credentials in the authoring session).
- `src/app/admin/deploys/_components/ReleaseIntelPanel.tsx` wired into
  `/admin/deploys/page.tsx` as a new "Release intelligence" section — a
  sibling to `ReleaseLedger`/`ReleaseRunwayStrip`, not an edit to either.
  Deliberately does NOT wire a real verdict into
  `src/lib/admin/triage/release-runway.ts`'s hardcoded
  `rollbackRecommended: false` (that file's own header already documents the
  gap this PR closes) — that file is a different track's, and answering a
  narrower "is the LIVE release fine right now" question as a sibling panel
  avoids the larger, riskier per-historical-card rework.
- No canary/staged-rollout mechanism built — ADR
  `CANARY_ROLLOUT_MECHANISM` = "Canary later", deliberately deferred.
- Verified: `npx tsc --noEmit` and `npx eslint` clean on every new/changed
  file; `npx vitest run src/lib/admin/release-intel` — 26/26 passing,
  covering both pure functions' F.5-required synthetic-diff/synthetic-
  snapshot cases (a migration-touching diff always at least R2; an
  unreadable window is always UNKNOWN, never KEEP).
## 2026-09-03 — Fourth collector arm: executable invariants (Phase D.4.3)

- SHA: recorded on merge of `agent/controlplane-d`.
- `collect.ts` now runs a fourth, independently fault-isolated arm — the
  round-graph invariant runner (`src/lib/reliability/invariants/**`) — via a
  SEPARATE `Promise.allSettled` alongside the existing 3-source array, never
  folded into it (`ReliabilitySource` stays closed). Result lands on a new
  OPTIONAL `ReliabilityRun.invariants` field; `version` was NOT bumped.
- Also added `error-budget.ts`: a pure rolling-window read over this
  feature's own `reliability-snapshot` history, consumed by the new
  `admin_slo` sub-capability (`memory/features/admin-slo.md`) rather than
  duplicated there.
- `CorrelatedSignal` gained a new `countIsFloor: boolean` field
  (`normalize.ts`) — sticky across a merge, true whenever any contributing
  `RawSignal.countBasis === 'unknown'` — so `error-budget.ts` can mark an
  observed count as a floor rather than an exact total.
- See `memory/features/admin-slo.md` for the invariants themselves
  (round-graph orphaned-shots / completed-without-holes,
  `memory/invariants/registry.yml`) and the downstream reads.
