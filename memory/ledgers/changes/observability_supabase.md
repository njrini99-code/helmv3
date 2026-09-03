<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Change ledger — observability_supabase

## 2026-09-03 — Phase 2 track A: locks, table health, pg_cron/pg_net health, connection/rollback rules, telemetry freshness, retention v2, Bridge sections

- Branch: `agent/dbobs-p2-collectors`, built on the merged Phase 1
  observability tip. Companion track B (Bridge/Sentry-facing work outside
  `src/lib/observability/supabase/**` and `src/lib/admin/database/**`) is a
  sibling branch, not touched here.
- Change: four HELD migrations
  (`20260903191000_helm_debug_db_lock_incidents.sql`,
  `20260903191100_helm_debug_db_table_samples.sql`,
  `20260903191200_helm_debug_jobs_health_read.sql`,
  `20260903191300_helm_debug_observability_retention_v2.sql`); five new
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
  `20260903191400_helm_debug_db_platform_samples.sql`); added the
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

## 2026-09-03 — Phase 2 Track B WIRING pass (Auth + remaining server-side Storage)

- What: connected the two Track B observers that had been built, tested and
  left unconnected. Track B's own doc recorded the gap honestly
  (`observeAuthResult` "NOT WIRED into any Auth call site"; Storage wired at
  6 of 16 sites), and this pass closes it.
  - **W1 — Auth.** `observeAuthResult` wired into 17 server-side call sites
    across 9 files: the OAuth/magic-link callback (`exchangeCodeForSession`),
    golf and baseball login, golf/baseball/lifting sign-up, the golf staff-
    invite sign-up, the baseball onboarding sign-up and its ownership probe,
    the baseball change-password reauth and update, both demo gates'
    shared-account sign-in and `is_demo` stamp, the admin password-reset
    link minter, and the admin auth-user delete. Full table with the
    per-site expected-vs-actionable reasoning in
    `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` §2.
  - **W2 — Storage.** `observeStorageResult` wired into the 3 remaining
    server-side sites (`recruiting.ts` purge; `github-feedback.ts` upload
    and createSignedUrl). Server-side Storage coverage is now complete.
  - **W3 — Tests.** Two behavioural wired-site tests (`password-reset-
    observability`, `github-feedback-storage-observability`) proving the
    return value unchanged on success AND every error path plus the
    observer's context; one source-content wiring contract
    (`src/test/observability/supabase-service-wiring.test.ts`) inventorying
    all 20 sites; classifier/observer coverage for the new flag.
  - **W4 — Docs.** §2, §3, §7 and §8 of the Track B doc rewritten from
    "not wired" to what is wired, with the genuine remaining gaps kept.
- Why: brief §10 (Auth) and §11 (Storage). An observer with no call sites
  produces no signal, and Track B's §8 named this as its first open item.
- **One additive change to an existing module**, deliberately narrow:
  `ClassifyAuthContext.expectedMissingUser` (default false, so no
  pre-existing caller reclassifies). `user_not_found` was already
  context-dependent but keyed only on `operation === 'sign_in'`, which left
  `sendPasswordResetEmail` no honest way to declare that an unregistered
  address is routine there — it would have had to mislabel its operation.
  That call site is why the flag exists: it collapses every
  `admin.generateLink` failure into `'no-account'`, so a GoTrue 429 or 5xx
  currently tells the user "if an account exists we emailed it", sends
  nothing, and is recorded nowhere.
- The decision that mattered most was what NOT to wire. `supabase.auth.getUser()`
  at the top of a server action is the most common Supabase Auth call in
  this repo and a null user there is the authorization check working;
  wiring those is the alert noise brief §7/§82 forbid. The wiring contract
  test asserts no observed call site is getUser-shaped, so a future pass
  cannot do it silently.
- Verification: `npx tsc --noEmit -p .` exit 0; `npx eslint <every changed
  file> --max-warnings 0` exit 0; `npx vitest run src/lib/observability/supabase
  src/test/observability/supabase-service-wiring.test.ts
  src/test/auth/password-reset-observability.test.ts
  src/lib/admin/__tests__/github-feedback-storage-observability.test.ts` —
  23 files, 375 tests, exit 0. `node scripts/supabase-error-audit.mjs` exit
  0, `baseline 1039, no regression`, Storage observed 6 -> 9.
  Both halves of the wiring contract test were MUTATION-CHECKED rather than
  assumed: renaming one wired action fails it, and turning one observer call
  into an assignment fails the standalone-statement assertion with that call
  site named.
- Not verified / still open (full list in the Track B doc §8): there is no
  CLIENT-SAFE Auth or Storage observer, which is now the largest remaining
  gap on both surfaces — every sign-out, password-reset page, settings
  email/password change, session-activity hook, and the four client Storage
  modules are blocked on it. `session_refresh` has no wired call site
  because no `refreshSession()` call exists in `src` at all (measured: zero
  hits), so brief §10's "session refresh failures" Bridge card still has no
  source. `invalid_credentials` on the server-owned demo shared account is a
  config defect that classifies EXPECTED — a recorded false negative.
  `lib/supabase/middleware.ts` is unwired by choice (local-scope cookie
  clear, no auth-server round-trip, already self-reporting).
