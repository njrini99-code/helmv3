<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Change ledger — observability_supabase

## 2026-09-03 — Phase 2 Track C: Metrics API, Advisors, alert policy, on-demand log evidence, doctor/trace-cert

- Branch: `agent/dbobs-p2-platform` (Track C of a three-track parallel Phase
  2 build — `dbobs-collectors` and `dbobs-services` are sibling tracks on
  their own branches; this ledger entry covers Track C's own commits only).
  Builds on Phase 1 (error envelope, classifier, out-of-band recorder,
  health sampler, query-delta engine — already on this branch at tip
  `c7d8b35c1` before Track C started).
- Change: added `src/lib/observability/supabase/{metrics-api,advisors,
  log-evidence,platform-rules,alert-policy}.ts` and their readers
  (`src/lib/admin/database/{platform,advisors,alerts}.ts`); extended
  `src/app/api/cron/db-health-sampler/route.ts` to also record one
  `db_platform_samples` row per tick (fail-open, HELD migration
  `20260903190400_helm_debug_db_platform_samples.sql`); added the
  "Fetch Supabase evidence" form
  (`src/app/admin/database/{log-evidence-actions.ts,LogEvidenceForm.tsx}`)
  and four new `/admin/database` page sections (Platform, Advisors, Alert
  policy, Fetch Supabase evidence); added a `db-observability` repo-doctor
  check module (14 keys) and `scripts/db-observability-trace-cert.mjs`
  (static W3C propagation certification, 5/5 PASS); added the
  `'database'` `IncidentSourceName` (minimal edit to
  `src/lib/admin/incidents/{types,sources}.ts` plus a new adapter,
  `db-observability-source.ts`, deliberately not wired into
  `fetch.ts`/`fetchIncidentBoard` — that file belongs to a different
  track).
- Why: brief §20 (Metrics API), §30 (Advisors), §32 (on-demand log
  evidence), §49-55 (alert policy, retry-storm detection, workload
  budget), §62 (doctor keys), §14 (trace-propagation certification) — see
  `docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`.
  All at $0 incremental recurring cost — see
  `docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md` §9.
- Correction/gap, stated rather than hidden: the Metrics API allow-list
  (`PLATFORM_METRIC_ALLOW_LIST`, `metrics-api.ts`) is DOCS-DERIVED, not
  live-verified — `SUPABASE_ACCESS_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` were
  unavailable in the worktree this was built in (`.env.local` withheld by
  `.worktreeinclude`, per `AGENTS.md`). `scripts/db-observability-metrics-names.mjs`
  is the read-only discovery script to correct it once a credential is
  available; every derived field degrades to `null` on a name mismatch, so
  a wrong allow-list entry cannot fabricate a healthy or unhealthy reading.
- Same caveat applies to `PG_STAT_STATEMENTS_AVAILABLE`, `PG_CRON_AVAILABLE`,
  and `PGAUDIT_OFF` (all live-only doctor checks) — they report
  `Status.LOCAL_ONLY` without a credential, the first use of that status
  anywhere in `scripts/repo-doctor/` (chosen specifically so a missing
  optional credential never flips `repo:doctor`'s exit code for every
  contributor — see the check module's own header for the full reasoning).
- Cross-track consequence recorded, not silently absorbed: adding
  `'database'` to `INCIDENT_SOURCES` means `canClaimAllClear`
  (`src/lib/admin/incidents/sources.ts`) can no longer return `true` for
  any incident board built from `fetch.ts`'s fixed `sourceHealth` array,
  until that file adds this track's adapter reading to it. Documented in
  both edited files' headers and in
  `docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md` §8.
- Verified: `npx tsc --noEmit -p .` clean; `npx eslint` (changed files,
  `--max-warnings 0`) clean; 575+ vitest tests pass across
  `src/lib/observability/supabase`, `src/lib/admin/database`,
  `src/lib/admin/incidents`; `node scripts/db-observability-trace-cert.mjs`
  PASS 5/5; `npm run repo:doctor` PASS (1 named WARN for the
  `db_platform_samples` retention gap, 0 FAIL/DRIFT/BLOCKED). No migration
  applied to production — see `supabase/migrations/HELD.md`.
