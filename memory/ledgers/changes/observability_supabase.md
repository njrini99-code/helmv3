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

<!-- merged: Track B section appended by the Phase 2 integrator -->
# Change ledger — observability_supabase

## 2026-09-03 — Phase 2 Track B: Auth/Storage/Realtime/Edge Function observability, retry-outcome model, coverage audit

- Branch: `agent/dbobs-p2-services` (Track B of Phase 2 of
  `docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`,
  built on Phase 1's PostgREST/Postgres error envelope + classifier +
  out-of-band recorder, already merged into this branch's tip
  `c7d8b35c1`). Full design writeup, fetched-docs ledger, and
  what's-wired/what's-not: `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md`.
  Feature current-state doc: `memory/features/observability-supabase.md`.
- Change, by deliverable:
  - **B5** (SHA `a867875f5`): `commit-outcome.ts` — pure retry/timeout/
    commit-outcome model (`classifyCommitOutcome`, `verifyDurableOutcome`,
    `summarizeAttempts`, `compareDurableChildCounts`). Not wired anywhere
    (`golf.ts` is owned by another session this phase).
  - **B1** (SHA `57d2bb3dd`): `classify-auth.ts` + `observe-auth.ts` — Auth
    error classifier (code table fetched from
    supabase.com/docs/guides/auth/debugging/error-codes.md) + server-only
    observer, mirroring `observe-result.ts`'s wiring. Not wired into any
    Auth call site yet.
  - **B2** (SHA `5feec5164`): `classify-storage.ts` + `observe-storage.ts` —
    Storage error classifier (code table fetched from
    supabase.com/docs/guides/storage/debugging/error-codes.md;
    `AccessDenied`'s default deliberately inverted from `classify.ts`'s
    `42501` convention — documented at length in the file header) + wired
    into 6 storage-delete/rollback sites across 4 server actions. One
    additive metric to `metrics.ts` (`helm.storage.failure`).
  - **B3** (SHA `d476a9cd2`): `realtime.ts` — client-safe channel
    observability (connect latency, reconnect count, `CHANNEL_ERROR`/
    `TIMED_OUT` classification with a once-per-`channelClass`-per-session
    `Sentry.captureMessage`, `CLOSED` deliberately treated as ambiguous not
    a failure). Wired into all 11 target hooks/components. One additive
    metric (`helm.realtime.channel_failure`) and one additive
    `client-breadcrumbs.ts` category (`'realtime'`). Fixed one existing
    test (`use-golf-messages.single-load.test.ts`) whose source-text
    boundary search broke when the bare `.subscribe()` it looked for was
    replaced by the wrapper call.
  - **B4** (SHA `faffc23b8`): `classify-edge.ts` + `observe-edge.ts` (app
    side) + `supabase/functions/_shared/observability.ts` (Deno side, fail-
    open Sentry Deno wrapper, import form and `Sentry.init()` shape
    verified against the official Supabase guide). Wrapped all three Edge
    Functions (`personalize-email`, `send-apns-push`, `send-fcm-push`);
    added the three trace headers to each one's CORS allow-list; wired
    `observeEdgeInvoke` into the one `functions.invoke(` call site
    (`push.ts`). One additive metric (`helm.edge_function.failure`).
    Deployment is an OWNER action, not performed.
  - **B6** (SHA `b04da98a1`): extended `scripts/supabase-error-audit.mjs`
    with a report-only Auth/Storage/Realtime/Edge coverage section — zero
    effect on the existing ratchet's exit code.
- Why: brief §10–13 (service-specific observability), §36–39 (retry/
  timeout/commit-outcome, error-rate metrics), §49–55 (coverage audit).
- Verification, every deliverable: `npx tsc --noEmit -p .` (clean each
  time), targeted `npx eslint <changed files> --max-warnings 0` (clean each
  time), targeted `npx vitest run` on new + touched-existing test files
  (all passed, including confirming B2/B3/B4's wiring did not change any
  existing action/hook/push test's behavior). B4's four Deno files were
  type-checked with `deno check --node-modules-dir=none` during this
  track's own build (clean, network-resolved through the sandbox proxy
  against real npm/jsr registries) — but the integrator disabled `deno`
  invocation on this machine shortly after (its cache reached 4.1 GB twice
  on a volume that dipped to 7 GiB free and has been removed), so as of
  this entry: **Deno type-check NOT VERIFIED (deno disabled on this machine
  by the integrator)** — that earlier clean pass is not a standing
  guarantee and no `deno` command ran again after the constraint landed.
  `supabase/functions` is excluded from the main `tsconfig.json` project
  (confirmed before touching Deno files, so `npx tsc --noEmit -p .` never
  saw them).
- Correction avoided: initially assumed (per the task brief's own fallback
  language) that `metrics.ts` might be `server-only`, which would have
  pushed Realtime's failure signal onto a breadcrumb+captureMessage-only
  path. Read the actual import graph (`flush.ts` → `vercel-wait-until.ts`,
  neither carries a `server-only` marker) before writing `realtime.ts` and
  found it IS browser-safe — so `realtime.ts` uses both the metric and the
  gated Sentry capture, per the brief's own "only if metrics.ts supports
  browser use" branch, rather than the fallback the brief describes for the
  case that turned out not to apply.
- Not verified / open items: see
  `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` §8 in full — in
  short, Auth has zero wired production call sites, Storage has one
  client-side gap (`upload-course-image.ts`, cannot import a server-only
  observer) plus five out-of-scope files, Realtime's silent-propagation
  monitor is exposed but unused (no product invariant to hang it on yet),
  Edge Functions are not deployed, the commit-outcome model is not wired
  anywhere, `Sentry.continueTrace` for Edge Functions was not verified
  against the pinned SDK, and the Deno type-check is NOT VERIFIED as of
  this entry (deno disabled on this machine by the integrator).

## 2026-09-03 — Phase 3 track E: certification, replay fixtures, fault injection, security posture, coverage matrix

- Branch: `agent/dbobs-p3-certification`, built on the Phase 2 integration
  tip (Phase 1 + track A + track B). Sibling tracks' work (the platform
  track's trace-cert script and repo-doctor module, the Bridge database
  page) is NOT on this branch and was neither rebuilt nor modified.
- Change: this track adds CHECKS, not observability. Six deliverables —
  a Trace Explorer layer model with the brief's rollback banner
  (`src/app/admin/traces/trace-explorer-layers.ts` +
  `TraceExplorerLayerPanel.tsx`, mounted in `TraceTree.tsx`); replay
  fixtures and a runner (`src/lib/observability/supabase/__fixtures__/`,
  `scripts/db-observability-replay.mjs`); a certification matrix
  (`scripts/db-observability-certify.mjs`); a fault-injection suite; a
  static security-posture check (`scripts/db-observability-security.mjs`);
  and a GENERATED coverage matrix
  (`scripts/db-observability-coverage.mjs` ->
  `docs/observability/SUPABASE_COVERAGE_MATRIX.md`, `--check` supported).
  Full narrative in `docs/observability/SUPABASE_CERTIFICATION.md`.
- Production-code changes are three and are all one seam:
  `RecordDbErrorOptions.client`, threaded through `observe-result.ts` and
  `integrity.ts` as `recorderClient`. It exists because the recorder was
  previously testable only via `vi.mock`, and a fixture suite that can only
  run inside one test framework cannot be run from a runbook. Production
  call sites never pass it, so `createAdminClient()` remains the only path
  a request takes. `trace-tree.ts` also gained one additive field
  (`metadata`), because the step's jsonb is the only place
  `sentry_trace_id` and the exception checkpoint's `{sqlstate}` live.
- Why: brief §56–61 (Trace Explorer layers, replay, certification, chaos,
  security, no generic ingest), §79 (coverage matrix), §80 (acceptance).
- Verification: `npx tsc --noEmit -p .` clean; targeted
  `npx eslint <changed files> --max-warnings 0` clean each time;
  `npx vitest run src/lib/observability scripts` all green; all four new
  scripts run and their output is recorded in the certification doc. A
  NEGATIVE CONTROL was run on the replay suite (corrupting one expected
  bucket and removing one sentinel from the sweep input failed exactly the
  two tests that should have failed), so it is discriminating rather than
  vacuous. The two `scripts/lib/__tests__` files are registered in
  `vitest.config.ts` and were confirmed running from a `--reporter=verbose`
  run by filename, not inferred from a passing total.
- Bugs found in this track's OWN checks, all of the same shape and all
  fixed: (1) a Sentry detector matched `observe-result.ts`'s doc comment
  saying it does NOT capture, reporting the opposite of the truth — the
  same failure the platform track hit with its live-proof regex; (2) a
  §61 detector flagged the CRM calendar route because a COMMENT mentions
  `error_logs`; (3) the same detector flagged an admin route that returns
  401 without a session, because it did not distinguish reading a session
  from enforcing one; (4) a storage-privacy assertion tested `/key/i`
  against the error CODE, so `NoSuchKey` failed it; (5) one test passed
  VACUOUSLY because a path helper silently returned `''` and
  `not.toContain` is true of the empty string. Every source-pattern check
  now strips comments and carries a positive control.
- Findings reported, NOT papered over: `buildSupabaseFingerprint` ignores
  `action`, so two actions on one relation with one code share a dedupe
  key; and in `observe-result.ts` the durable write sits downstream of the
  metric call, so a throwing metrics emit would suppress the durable
  evidence (not reachable today — `metrics.ts` guards its own emits — but
  the ordering consequence is pinned by a test). Neither was changed:
  both are behaviour changes to contracts other tracks depend on.
- Not verified / open: every migration in this program is HELD and
  unapplied, so every claim about a durable ROW (persistence,
  occurrence_count collapsing, rollback survival, rows/day, table sizes)
  is NOT VERIFIED — the DISPATCH is exercised, the row is not. Sentry and
  Bridge routing for Supabase failures is static-only: it depends on
  whether the error escapes to an action wrapper. No pgTAP suite was
  written or run for these migrations. The live catalog is NOT_CONFIGURED
  (no credential used, no query run). `log-error` is a pre-existing
  anonymous ingest route lacking auth and a field allow-list — allow-listed
  with its per-control status printed, an owner decision. Full acceptance
  table in `docs/observability/SUPABASE_CERTIFICATION.md` §8.
- Cost: INCREMENTAL RECURRING OBSERVABILITY COST $0. No drain, no
  continuous ingestion, no new vendor, no scheduled job; every script is
  static or in-process and none opens a database connection or makes a
  network request.
