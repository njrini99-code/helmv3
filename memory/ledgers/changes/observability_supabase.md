<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Change ledger — observability_supabase

## 2026-09-03 — Phase 2 track A: locks, table health, pg_cron/pg_net health, connection/rollback rules, telemetry freshness, retention v2, Bridge sections

- Branch: `agent/dbobs-p2-collectors`, built on the merged Phase 1
  observability tip. Companion track B (Bridge/Sentry-facing work outside
  `src/lib/observability/supabase/**` and `src/lib/admin/database/**`) is a
  sibling branch, not touched here.
- Change: four HELD migrations
  (`20260903190000_helm_debug_db_lock_incidents.sql`,
  `20260903190100_helm_debug_db_table_samples.sql`,
  `20260903190200_helm_debug_jobs_health_read.sql`,
  `20260903190300_helm_debug_observability_retention_v2.sql`); five new
  pure evaluator modules
  (`src/lib/observability/supabase/{locks,health-rules,table-health,jobs-health,freshness}.ts`)
  with fixture tests; four new Bridge readers
  (`src/lib/admin/database/{locks,tables,jobs,telemetry}.ts`) plus a
  `rules` extension to the existing `overview.ts` snapshot; one new hourly
  cron (`db-table-health`, registered in `vercel.json` and
  `cron-registry.ts`); the existing `db-health-sampler` route extended to
  fold in a lock-snapshot read after its health write; the existing
  `db-observability-prune` route's response type extended for the two new
  prune counts; four new sections on `src/app/admin/database/page.tsx`.
- Why: extends the zero-incremental-cost Supabase/Postgres observability
  program (`docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`)
  past Phase 1's health/error/query-performance collectors into locks,
  table bloat/vacuum health, pg_cron/pg_net health, connection-saturation
  and rollback-rate rules, and a telemetry-freshness view answering "is the
  observability system itself watching."
- Decisions the brief left open, resolved here (see each file's own header
  for the full reasoning, this is the short version):
  - `helm_debug_prune_observability`'s signature stayed byte-identical to
    Phase 1's (4 args, all defaulted) rather than gaining two new
    parameters for the two new tables' retention windows — `CREATE OR
    REPLACE FUNCTION` cannot add a parameter without creating a second,
    ambiguous overload, which the existing zero-argument cron call would
    then fail against (`PGRST203`, not in this route's
    migration-not-applied code set). The two new windows are fixed
    30-day internal constants instead.
  - No "critical app cron" classification exists for native `pg_cron.job`
    rows — production has exactly one such row today and nothing marks
    it critical; the evaluator reports evidence-based findings (never
    ran, abnormal duration, repeated failure, stale-vs-inferred-cadence)
    uniformly instead of inventing a criticality tag with nothing to back
    it.
  - `db_error_events`' freshness is classified identically to every
    scheduled source, even though it is event-driven — an empty store
    reads `unknown`, never `green`, per the brief's own "no telemetry as
    no errors" anti-pattern (§80-86).
  - `freshness.ts` is a new, separate module from the existing
    `src/lib/admin/incidents/sources.ts`, not a reuse — different
    vocabulary and thresholds than that Bridge-wide module already
    serves other callers with.
- Corrections carried forward from the Phase 1 measured-truth doc, applied
  throughout: `connections_pct_max` is a 0-1 FRACTION (not a 70/80/90
  integer scale) — `evaluateConnectionSaturation`'s thresholds are
  0.70/0.80/0.90 accordingly, with a fixture test specifically pinned
  against the wrong integer-scale assumption; service-role lock/active/
  idle-in-tx thresholds in `locks.ts` use the measured 30s `service_role`
  statement timeout, not the brief's original ~2m snapshot.
- Verification: `npx tsc --noEmit -p .` clean throughout (several real
  type errors were caught and fixed mid-work — a readonly-array mismatch,
  an RPC-result cast TypeScript correctly refused, two Fairway component
  `tone` prop mismatches); `npx eslint` on every touched file, 0 warnings;
  `npx vitest run src/lib/observability/supabase src/lib/admin/database
  src/app/api/cron` — 25 files / 241 tests passing at the final commit.
  No migration in this PR was applied anywhere; all four are HELD per
  `supabase/migrations/HELD.md`.
- Not verified / explicitly out of scope for this track: production
  application of any migration (owner-apply-only after
  `db-migration-reviewer` sign-off, per `supabase/migrations/HELD.md`'s
  own convention); pgTAP coverage (none written, consistent with Phase
  1's own migrations); `memory/registry.yml` still has no entry for this
  feature area — flagged in `memory/features/observability-supabase.md`'s
  own Status section as a real gap, not silently filled, since adding a
  registry mapping was outside this track's assigned deliverables.
