<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Change ledger — observability_supabase

## 2026-09-03 — Phase 3 track D: diagnostics and correlation (schema drift, RLS, release causality, service layers, call budgets, incident detail)

- Branch: `agent/dbobs-p3-diagnostics`, built on the Phase 2 integration tip
  (Phase 1 + Track A + Track B). Sibling Track C
  (`agent/dbobs-p2-platform`: Metrics API, advisors, platform rules,
  on-demand log evidence, alert policy, repo-doctor keys, trace
  certification) is a separate branch and nothing here imports it.
- Change: five new PURE modules under
  `src/lib/observability/supabase/` — `schema-drift.ts`,
  `authorization-diagnosis.ts`, `release-correlation.ts`,
  `service-layers.ts`, `call-budgets.ts` — plus two server-only readers
  (`src/lib/admin/database/incident-detail.ts`, `drift-inputs.ts`) and a
  single-fingerprint detail surface on `src/app/admin/database/page.tsx`
  reached by `?incident=<fingerprint>`. Full design:
  `docs/observability/SUPABASE_DIAGNOSTICS.md`.
- **No migration.** Every read goes through an RPC that already exists
  (HELD or not); the drift inputs are repository files plus one bounded
  on-demand Management API query. No new table, no new facade, no new
  `HELD.md` row. No existing module was modified other than the Bridge
  page.
- Why the three drift axes never collapse: `.claude/rules/shipping.md` §4
  and `scripts/db/migration-ledger-drift.mjs`'s own header both record that
  the ledger is not a reliable index of what is live (five local-only
  migrations verified live in production with no ledger row, 2026-08-26)
  and that a migration file existing is not evidence the object exists. So
  `migrationFile` / `ledgerRow` / `generatedTypes` are reported
  independently, each with its own `unknown`, and an unreadable input is
  `unknown` rather than `absent`.
- Why the causal ladder carries no number: PR #1789 fixed a defect in
  `src/lib/admin/incidents/release-context.ts` where proximity was counted
  both as the trigger for considering a release and as corroboration for
  it, producing a false "new after release" at 60% confidence. This module
  sorts every signal into corroborating (release-side facts, true whether
  or not the incident occurred) / not-corroborating (restatements of the
  incident — proximity, occurrence count, SQLSTATE fit alone) /
  exculpatory (can only lower the rung), emits the rejected signals so a
  reader sees they were considered, and offers only the rungs
  unknown / no-signal / possible / likely / reproduced-cause. A numeric
  confidence would invite the same accumulation.
- Why `authorization-diagnosis.ts` has no default expectation: nothing in a
  42501 distinguishes an expected security denial from a defect. Defaulting
  to "expected" hides defects; defaulting to "unexpected" pages someone for
  a routine permission check, which the brief's own anti-pattern list
  names. A caller that states nothing gets UNKNOWN.
- Deliberately a NEW correlation module rather than a reuse of
  `admin/incidents/release-context.ts`, for the reason `freshness.ts`
  already records in that directory for not reusing `sources.ts`: different
  question, different output vocabulary, and the observability layer must
  not depend on `src/lib/admin/incidents/**`.
- Privacy §6: `authorization-diagnosis.ts` does not accept a message,
  `details` or `hint` at all, so a policy predicate has no code path to
  travel in — a test passes a sentinel through a widened cast and asserts
  the serialized output does not contain it. `schema-drift.ts` reads the
  already-sanitized `normalizedMessage` only to recover an object NAME, and
  its explanation is built from enumerated axes alone (also tested).
- Four composition-layer defects found in review AFTER the first eight
  commits and fixed in a ninth, each with the regression test that would
  have caught it:
  1. `recentChange` keyed on `migrationFilenames.length`, so a blind drift
     read rendered "No migration in this tree names the failing object" — a
     confident denial, and the DEFAULT condition in a deployed Bridge where
     the file reads never work. It now derives its state from the drift
     axis: `unconfigured` for a failure that names no missing object,
     `blind` when the migrations could not be listed, `empty` only when
     they were listed and named nothing.
  2. `postgrestCode` was derived as "the error code whenever sqlstate is
     null", which swept in `classify.ts`'s message-fallback labels
     (`unknown_authorization` and friends). Those are SWALLOWED POSTGRES
     verdicts, and the catch-all branch labelled them "a PostgREST-native
     code — the request never became a Postgres verdict", contradicting the
     authorization panel on the same incident. Both sides now require a
     `PGRST` prefix.
  3. The applied-ledger read was unconditional, and the page carries an
     unconditional 60s `AutoRefresh` while being `force-dynamic` — so an
     "on-demand" query was in fact a once-a-minute poll per open tab.
     `readSchemaDriftInputs` now takes `includeAppliedLedger`, defaulting
     false, and `incident-detail.ts` opts in only for a missing-object
     mechanism (a 42501 says nothing about the ledger).
  4. Two smaller ones: the commit workflow stage asserted `not-reached` for
     transport/connection failures where `commit-outcome.ts` says
     UNKNOWN_COMMIT (now `unknown` for PGRST000-003 and SQLSTATE class 08),
     and the repair link pointed at `/admin/traces?trace=<id>` when that
     page takes no `searchParams` at all — it now links the index honestly
     and carries the trace id in the label.
- A fifth defect surfaced on re-review of the fix itself: making
  `recentChange` return `unconfigured` for a non-missing-object failure gave
  the UI chip "NOT SHIPPED YET" beside a note explaining the section does not
  apply — a new wrong answer in the slot the old one occupied, on the
  majority case. `SectionState` gained a distinct `not-applicable`
  (chip: NOT APPLICABLE), so the distinction lives in the model and the UI
  needs no special case. `dataInvariant` and `sentryIssue` genuinely ARE
  unshipped and keep `unconfigured` — pinned by a test that asserts all
  three at once.
- Verified after the fixes: `npx tsc --noEmit -p .` clean; `npx eslint
  <changed files, including src/app/admin/database/page.tsx>
  --max-warnings 0` clean; `npx vitest run src/lib/observability/supabase
  src/lib/admin/database src/app/admin/__tests__` — 35 files, 477 tests
  passing, `admin-gate-coverage.test.ts` included (it is the suite most
  likely to have an opinion about a page that now reads `searchParams`).
  Not run, by this track's own constraints: `npm run build`, the full
  `npm test`, `npm run test:rls`, deno, any docs regeneration script.
- **NOT VERIFIED / open items:**
  - `drift-inputs.ts`'s applied-ledger read is credential-gated
    (`SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`) and `.env.local` is
    withheld from worktrees, so it has never been observed returning a
    non-null result. It fails open to `null`, which reads as `unknown`.
  - `drift-inputs.ts`'s FILE reads do not work on Vercel:
    `supabase/migrations/**` and `src/lib/types/database.ts` are repository
    files, not part of a traced serverless function bundle, so in a
    deployed Bridge both axes report `unknown` and the surface renders
    UNREADABLE. Fixing that means an `outputFileTracingIncludes` change to
    `next.config.mjs`, deliberately not made here.
  - `call-budgets.ts` is NOT WIRED. `helm_debug.db_stat_deltas` has no
    journey dimension, so nothing in this repo can attribute a DB call to a
    journey today. The evaluator ships; the collector does not, and a
    fabricated attribution was rejected as worse than an honest
    `collecting`.
  - No Sentry issue fetch, no Flight Recorder read, no data-invariant
    registry — all three are declared `unconfigured` on the detail surface
    rather than omitted or rendered as passing.
  - The Bridge surface was not rendered in a browser; there is no
    component test for `page.tsx` in this repo's admin suite.

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

<!-- merged: Track B section appended by the Phase 2 integrator. The
     duplicate `# Change ledger` H1 that arrived with this merge was removed
     2026-09-03 (Phase 3 Track F): one document, one title. -->
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

## 2026-09-03 — Phase 3 Track F: absence, memory and the operating model

- Branch: `agent/dbobs-p3-intelligence`, built on the Phase 2 integration
  tip (Phase 1 + Track A + Track B). Sibling Phase 3 tracks C, D and E were
  building in parallel and are NOT represented here.
- Change: eight new pure modules under `src/lib/observability/supabase/`,
  one server-only writer, one tsx CLI, two docs, and NO migration and NO
  new table.
  - `db-state.ts` (§67) — `foldDatabaseState` returns GREEN / AMBER / RED /
    DEGRADED / UNKNOWN plus the evidence that produced it. A required
    source that is not live can never yield GREEN; RED still beats DEGRADED
    (DEGRADED is on the observability axis, not the severity axis) with
    confidence capped at `low`; a stale source's last row contributes a cap
    and no signals, so a dead collector cannot render as a healthy
    database. Consumes `FreshnessState` from `freshness.ts` rather than
    redefining it.
  - `absence.ts` (§74) — five detectors for signals that STOPPED.
    `ActivityContext` is a REQUIRED field with three variants, so omitting
    it is a compile error and an unreadable context yields `unknown`, never
    `absent`. No sport calendar is hardcoded; an EMPTY season-window list
    reads `unknown` rather than `quiet`.
  - `layered-performance.ts` (§73) — request p95 (measured, supplied) vs
    database shape (aggregates). The database half carries no
    percentile-shaped field at all and a test asserts that structurally
    over the output keys; a missing layer yields `request_unknown` /
    `database_unknown` rather than a clean-looking verdict.
  - `incident-memory.ts` + `incident-memory-writer.ts` (§75) — writes into
    `memory/incidents/**`, the store this repo already has. No database
    table: a store that can disagree with committed state is a second
    authority for engineering truth. Templates only the contract
    `scripts/knowledge/check-ledger-integrity.mjs` enforces (read from the
    checker, not the README prose) plus the nine §75 fields; narrative is
    caller-supplied. An unmapped feature id and an unreadable registry are
    both refusals, and an existing file is never overwritten.
  - `repair-completeness.ts` (§76) — eight criteria, PASS / FAIL / UNKNOWN
    each, three-valued roll-up, no score and no boolean anywhere in the
    result (asserted by test). FAIL outranks UNKNOWN; the unknown ids are
    listed alongside so a failure never swallows them.
  - `query-explainer.ts` (§69) — the file has NO IMPORTS AT ALL, so "never
    runs against production automatically" is a property of the import
    graph rather than a promise. ANALYZE is withheld for every mutating
    class in every environment and for reads against production;
    `persistsPlan` is `false`. A non-safe-query-class input is refused and
    the rejected value is never echoed back.
  - `repo-mapping.ts` (§70) — envelope feature + object to migration,
    callers, tests and feature doc, with the registry and migration listing
    passed in. Resolves a runtime feature KEY through
    `observability.feature_keys`, not just an exact id. Gaps are reported,
    never swallowed.
  - `sentry-contract.ts` (§71–72) — allow-list, not a scrubber: the ten
    named keys are copied and an eleventh structurally cannot ride along.
    An allow-listed key with an unsafe value is refused rather than masked
    (a masked tag is still a series). `helm.trace_id` is the one exemption,
    the one §6 carves out itself, and gets a shape check instead of the
    free-text masker. Three trace ids stay separately named and
    `sentryMatchesW3c` is REPORTED, not assumed.
  - `docs/observability/SUPABASE_RUNBOOKS.md` (§68) — 42501 and 57014 as
    ordered steps with the exact command per step, and an explicit section
    on why raising the statement timeout is never the fix for a 57014.
  - `docs/observability/SUPABASE_OPERATING_MODEL.md` (§77, §86) — the
    operating model plus a §86 scoring that marks four criteria NOT MET or
    NOT VERIFIED with the evidence for each.
  - `scripts/observability/record-db-incident.ts` — a thin tsx CLI.
    `tsconfig.json` excludes `scripts/`, so it is lint-covered but NOT
    type-checked by `npm run typecheck`; it is deliberately small enough to
    verify by eye and every rule lives in the two `src/` modules.
- Also changed: `envelope.ts`'s `sanitizeSupabaseFreeText` gained an
  optional `maxChars` (default unchanged) so a human-read incident record
  gets more room under identical masking rather than forking a second,
  weaker redactor. And two prose line-wraps in
  `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` that began with a
  plus sign and a space were re-wrapped: markdownlint parsed them as list
  items, and that
  pre-existing MD004 regression was what made `npm run markdown:ratchet`
  fail on this branch's base before Track F wrote anything. Verified by
  moving the new runbook aside and re-running.
- Why: brief §67–77 and §86.
- Verification, every deliverable: `npx tsc --noEmit -p .` exit 0;
  `npx eslint <changed files> --max-warnings 0` exit 0;
  `npx vitest run src/lib/observability/supabase src/lib/admin/database`
  501 passed / 36 files; `npm run markdown:ratchet` exit 0 (30484 → 30465,
  baseline deliberately NOT updated — that is the integrator's call once
  every track has landed). Two read-only audits were run for the §86
  scoring rather than asserting it: `npm run audit:supabase-errors`
  (baseline 1039 unchecked reads, no regression) and
  `npm run audit:fail-open` (baseline 51, no regression).
- Cost: INCREMENTAL RECURRING OBSERVABILITY COST $0. No migration, no new
  table, no drain, no vendor, no continuous polling, no second incident
  store, no second trace system.
- Registry gaps found and NOT closed by this track: two features claim the
  identical `src/lib/observability/**` glob (`observability_sentry` and
  `shot_tracking`); no runtime feature key covers the database
  observability surfaces (`admin_platform`'s only key is
  `admin_dashboard`); five features declare no `code.db` and four declare
  no `code.tests`. Listed in full in
  `docs/observability/SUPABASE_OPERATING_MODEL.md`.
- Not verified / open: the W3C propagation certification (§14) is modelled
  but not measured, so "traceable" is a design property here, not an
  observed one. `db-state.ts` is not mounted on any Bridge surface —
  `src/app/admin/database/page.tsx` was owned by a sibling track this
  phase, so no component was added; `foldDatabaseState` is the intended
  input to a Mission Control header chip. Nothing in Track F is wired into
  a production call site.
