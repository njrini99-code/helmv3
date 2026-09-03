# Observability (Sentry) test ledger

New ledger — no prior entries. Covers Phase C (`agent/sentry-max-server`,
branch built on `agent/sentry-max-observability`) only; the client-experience
and telemetry-vocabulary suites from the sibling phases (D/B) are not
re-listed here — see `memory/ledgers/changes/observability_sentry.md` for
those branches' own test claims.

Every count below is the CURRENT total in the named file, verified by
running that file alone via `npx vitest run <file> --reporter=verbose` and
counting `✓` lines on 2026-09-03 — not a hand-remembered delta. For an
EXTENDED file, the description says what's NEW; the number is the file's
current total, which may include pre-existing cases untouched by this work.

## 2026-09-02 — Deliverable 1: withSentryConfig argument-count fix

- `src/lib/__tests__/sentry-build-options.test.ts` (12) — new file. Pins
  `buildSentryBuildOptions()`'s merged-object shape: every formerly-
  discarded third-argument option present at the top level,
  `automaticVercelMonitors: false` (not the Phase A default), no
  `hideSourceMaps` (not a real 10.71.0 option), `sourcemaps.
  deleteSourcemapsAfterUpload` as its replacement, org/project/authToken/
  release pass through unchanged including when undefined, and a
  source-content check that `next.config.mjs` actually imports the helper
  and calls `withSentryConfig` with exactly two arguments (walks balanced
  parens and counts top-level commas — a real regression guard against the
  original bug reappearing, not just a snapshot).
- `src/lib/security/__tests__/sentry-application-key.test.ts` (16, shared
  with a Phase D concern) — not authored by this phase, but its 4 cases
  gate this phase's `applicationKey` parameterization directly: re-run and
  confirmed still green after `buildSentryBuildOptions` gained an
  `applicationKey` parameter (default `'helm-web'`) during the
  `f6efd45bd` merge resolution.

## 2026-09-02 — Deliverable 2: four duplicate-capture bugs

- `src/lib/observability/__tests__/register-process-error-handlers.test.ts`
  (12) — new file. Pins `isAlreadyBridgeLogged`-gating on both
  `uncaughtException`/`unhandledRejection`, and that an unmarked error still
  reaches Sentry.
- `src/app/global-error.test.tsx` (3) — new file. Pins that the boundary's
  own `console.error` never fires for an already-Bridge-logged error
  (asserted via `toHaveBeenCalledWith` on the SPECIFIC removed call, not a
  blanket `not.toHaveBeenCalled()` — React's own DOM-nesting warning under
  RTL trips the blanket form on unrelated noise) — plus a source-content
  guard that the literal `console.error(` call is actually gone from the
  file, not merely untriggered by this test's fixture.
- `src/test/observability/instrumentation-duplicate-capture.test.ts` (10)
  — new file, covers three of the four fixes together: `sharedIgnoreErrors`
  now includes all three `withLiftingAction` control-flow classes (and
  does NOT ignore a genuine Lifting failure — the false-negative check
  matters as much as the false-positive one) applied identically on both
  Node and Edge `Sentry.init`; `onRequestError`'s `__helmBridgeLogged`
  gating (marked errors skip `captureRequestError`, unmarked ones don't,
  the Bridge-write half of the behavior is unchanged either way).

## 2026-09-02 — Deliverable 3: Sentry Cron Monitor check-ins

- `src/lib/observability/__tests__/cron-monitors.test.ts` (18) — new file.
  Pins `shouldEmitCronCheckIns` (env-flag override, `production`/`preview`
  default-on), `resolveCronMonitorSlug` (registered-job dashed-path slug vs.
  `job-<jobType>` fallback), and `resolveCronMonitorConfig` NEVER returning
  undefined — a registered job gets its real crontab schedule
  (`checkinMargin:5, maxRuntime:30`), an unregistered one gets a
  conservative 30-day-interval fallback rather than silently instrumenting
  nothing.
- `src/lib/admin/__tests__/job-log.test.ts` (20) — extended. New cases pin
  `recordJobRun` wrapping every job with `startCronCheckIn`/
  `finishCronCheckIn` on all 3 exit paths (success, a resolved 4xx/5xx
  Response, a thrown error) and that the check-in never blocks or alters
  the job's own return value on failure (fail-open).
- `src/lib/admin/__tests__/cron-registry.test.ts` (58 total — most
  pre-existing contract tests parameterized over `CRON_REGISTRY`, which
  scale automatically with registry size). New/changed for this
  deliverable: the required `schedule: string` field on every
  `CronRegistryEntry`; a `cronScheduleToMinutes` case for the
  comma-separated-hour-list shape (`'17 3,9,15,21 * * *'` ->
  `selfheal-triage`'s real cadence, added during the `f6efd45bd` merge
  resolution and verified byte-for-byte against `vercel.json` directly,
  not the incoming comment); the byte-identical
  `entry.schedule === vercel.json's schedule string` contract test
  (parameterized over every entry, so it automatically covers the 2 new
  entries — `reliability-triage`/`selfheal-triage` — without a
  hand-written case for each).
- `src/lib/inngest/__tests__/functions-bridge-logging.test.ts` (4) — new
  file. Pins `withBridgeLogging` starting a check-in keyed by the Inngest
  function id, finishing ok/error on the two outcomes, and that the
  check-in finish happens BEFORE the Bridge log write (a hung logger must
  not delay Sentry visibility).
- `src/test/scripts/sentry-cron-checkin.test.ts` (11) — new file. Pins
  `scripts/lib/sentry-cron-checkin.mjs`'s dependency-injected
  `createCronCheckIn` for the launchd Repair script — the
  `heartbeat-state-unknown` status is deliberately left `in_progress`
  rather than mapped to ok/error, mirroring `reconcileRepairRun`'s
  "unreadable != absent" rule.

## 2026-09-02 — Deliverable 4: /api/health readiness probe

- `src/app/api/health/route.test.ts` (13) — new file. Pins the bounded
  query (`AbortSignal.timeout`), honest status codes (200 healthy / 503
  degraded), the 60s-throttled degraded-branch log (not logged every
  poll), the response body shape (`status/database/release/timestamp/
  responseTimeMs`, no `deploymentId`), and that no sensitive field ever
  appears in the body.
- `src/hooks/golf/__tests__/use-connection-status.test.ts` (4) — new file.
  Pins the fixed `isConnected` semantics: connected on 200, STILL
  connected on a 503 from this exact route (a degraded backend is a
  reachable one), not connected when `fetch` itself throws or aborts. This
  is the regression test for a real latent bug found while auditing
  `deploymentId` consumers, not just new-route coverage.
- `src/components/providers/__tests__/StaleDeploymentRecoveryScript.test.ts`
  (4) — new file. Pins that the script reads `data.release` (not the
  removed `data.deploymentId`), and that `layout.tsx`'s `x-deployment-id`
  meta tag uses the same release-resolution formula as the route.

## 2026-09-02 — Deliverable 5: AI observability, all 5 production call sites

- `src/app/api/coachhelm/v3/chat/stream/route.test.ts` (4) — new file.
  Pins `experimental_telemetry` opt-in with `recordInputs`/`recordOutputs`
  explicitly `false`, `Sentry.setConversationId` tagging the turn with the
  opaque server-generated id, and `recordAi` success/failure. The
  success-path assertion required hoisting `createUIMessageStream` into
  the test's own mock object and a `runPostAndSettle` helper, because the
  route does not `await` that stream — `await POST(...)` alone does not
  wait for `execute`/`onFinish` to run.
- `src/lib/golf/__tests__/schedule-vision-transport.test.ts` (5) —
  extended. New cases pin both `generateObject` calls (primary extraction
  AND the day-verification pass) opting in with `recordInputs`/
  `recordOutputs` false and each recording its own `recordAi` success;
  plus a failure case for the extraction call.
- `src/lib/admin/__tests__/rca.test.ts` (10) — extended. New cases pin
  `experimental_telemetry` opt-in and `recordAi` success/failure around
  `runRcaAnalysis`'s `generateObject` call, alongside the pre-existing
  `buildRcaContextText` cases.
- `src/lib/coachhelm/v3/llm/compose.test.ts` (10) — extended for the same
  opt-in + `recordAi` success/failure pattern around `runLlmAttempt`'s
  `generateText` call, after that function was restructured with an
  explicit try/catch to make the failure path observable at all.

## 2026-09-03 — Deliverable 6: round-lifecycle, recover, login, push, and wrapper metrics

- `src/lib/observability/__tests__/helm-flight-recorder.test.ts` (27,
  extended from 15) — +12 new cases in a dedicated `helm.workflow.*
  metrics, helmLog, and Sentry trace correlation` describe block: pins
  `attachHelmTrace` firing at construction before the enabled check;
  `recordWorkflow`/`helmLog` firing once per `finalize()` call with the
  right feature/action/outcome/duration; the PROMOTED outcome (a failed
  step always reads as `'failure'`, even when the caller passed
  `'success'` to `finalize`) reaching the metric, not the raw caller
  status; `'warning'`/`'pending'` logging at `warn` rather than `error`;
  and — the two branches easiest to leave untested, called out explicitly
  because the whole point of this change was covering them — the
  DISABLED-mode no-op recorder (production, no override) and the
  start-TIMEOUT degrade path BOTH still emit the metric. A final ordering
  test proves the metric is emitted before the (unbounded)
  `persistFinalize` write, so a hung DB write cannot swallow it.
- `src/app/golf/actions/__tests__/golf-round-recover-observability.test.ts`
  (6) — new file. Pins `deleteInProgressRoundImpl`'s
  `recordDiscardRoundOutcome` at each of its 6 branches
  (`invalid_input`/`unauthenticated`/`player_not_found`/`db_error`/
  `stale_round_state`/`success`/`exception`), including the specific
  distinction between `stale_round_state` (the ordinary
  already-finished/removed race — never `db_error`) and a genuine system
  fault.
- `src/app/golf/actions/__tests__/auth-login-observability.test.ts` (11)
  — new file, two layers: unit tests directly on `recordLoginOutcome`
  (mocked `recordAuth`/`helmLog`), plus a source-content check that
  `loginActionImpl` actually calls it exactly 8 times (one per return
  branch) with the right outcome string at each — chosen over a full
  behavioral drive of `loginActionImpl` because that function pulls in
  ~15 real dependencies (rate limiter, account lockout, GoTrue, demo/
  super-admin/coach-entry resolution, several logging modules) a focused
  observability test has no reason to stand up.
- `src/test/notifications/push-observability.test.ts` (6) — new file,
  reusing the exact fake-Supabase/mock scaffold from the sibling
  `push-reports-delivery.test.ts`. Pins `recordPush` firing for a real
  delivery attempt (success, token-read-failure, all-devices-rejected) but
  NOT firing for opted-out/no-devices returns — those log at
  `helmLog.info` only, so the attempt counter isn't inflated by calls that
  were never real delivery attempts. One case (the per-token `invoke`
  throw) needed correcting mid-write: that throw is caught INSIDE the
  token loop's own try/catch, so it lands in the same `delivered === 0`
  branch as an ordinary rejection (`errorCode: 'no_device_accepted'`), not
  the function's outer catch (`errorCode: 'exception'`) — the test
  originally asserted the wrong branch and was fixed against the code's
  actual (unchanged) control flow, not the other way around.
- `src/lib/golf/__tests__/with-golf-action.test.ts` (17, extended from
  13), `src/lib/baseball/__tests__/with-baseball-action-observability.test.ts`
  (10, extended from 6), `src/lib/lifting/__tests__/
  with-lifting-action-observability.test.ts` (4, new file) — each gained
  or introduced a `helm.workflow.* metric` describe block pinning: success
  emits `outcome:'success'`; an unexpected throw emits `outcome:'failure'`;
  an expected/control-flow throw emits the classified severity (golf) or
  the specific error class name (baseball/lifting) rather than a flat
  `'failure'`; and — the cardinality invariant the whole design depends
  on — no `roundId`/`playerId`/`teamId`/`orgId` dimension ever appears on
  the metric call, only `sport`+`action`.

## Gate verification (this phase, cumulative)

`npx tsc --noEmit` clean after every deliverable. `npm run lint` (0
warnings) and `npm run lint:ratchet` (68 warnings, at baseline, no
regressions) clean as of the Deliverable 6 commits. Full-repo vitest sweeps
run before each commit across every directory these changes touch — see
`memory/ledgers/changes/observability_sentry.md`'s Deliverable 6 entries for
the exact file/test counts from those sweeps (2316 tests / 213 files after
part 1; 1228 tests / 153 files across the wrapper-dependent sweep after part
2 — two different, overlapping subsets of the repo, not the same 2316 run
twice). `audit:supabase-errors`/`audit:fail-open`/`audit:paginated-reads`
and `knowledge:doc-inventory --check`/`docs:path-drift`/`docs:schema-drift`
all clean at every gate run in this phase, no regressions against their
baselines.
