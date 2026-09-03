<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
<!-- schema-drift-absent: golf_action, baseball_action -->
<!-- `golf_action`/`baseball_action` below are Sentry metric `feature`
     dimension LITERALS, not database objects — see
     memory/features/observability-sentry.md's own marker for why. -->
# Change ledger — observability_sentry

## 2026-09-02 — client "maximum observability" build: profiling, replay privacy, third-party filter, feedback, breadcrumbs, feature tags

- Branch: `agent/sentry-max-client` (Phase D of a multi-phase Sentry build;
  server-side spans/metrics/structured-log are a sibling phase on another
  branch and were not touched here).
- Change: rebuilt `src/instrumentation-client.ts`'s `Sentry.init()` on a new
  pure options builder, `src/lib/sentry-client-options.ts`
  (`buildClientSentryOptions`); added browser UI profiling
  (`browserProfilingIntegration`, `profileSessionSampleRate` +
  `profileLifecycle: 'trace'` — NOT the deprecated `profilesSampleRate`),
  `thirdPartyErrorFilterIntegration` (gated `!isDev`, keyed on
  `applicationKey: 'helm-web'` added to `next.config.mjs`), a programmatic
  feedback form (`feedbackIntegration({autoInject:false})` +
  `ReportProblemButton` in golf Settings), `browserSessionIntegration`,
  `httpClientIntegration`, `reportingObserverIntegration`; hardened Replay
  (`maskAllInputs: true` explicit, `mask: ['[data-sentry-mask]']` wired and
  applied to `FairwayPlayerCard`/`FairwayRecruitCard`); added
  `recordHelmBreadcrumb` (`src/lib/observability/client-breadcrumbs.ts`) at
  3 round-entry outcome sites; added a `feature` Sentry tag in `beforeSend`
  reusing `error-trace-classification.ts`'s existing classifier.
- Why: this repo had error tracking but no browser profiling, no
  first-party/third-party error separation, no in-app way for a user to
  report a problem, and events that bypassed `logError()` carried a
  `sport` tag but never a `feature` tag.
- Correction: the code comment `Sentry.feedbackIntegration` had carried
  since an earlier `@sentry/nextjs` v10.x minor — "moved out... crashes the
  entire client SDK init" — was re-verified at runtime against the
  currently-installed 10.71.0 and found FALSE for this version:
  `feedbackIntegration`/`getFeedback`/`browserProfilingIntegration`/
  `thirdPartyErrorFilterIntegration` all resolve as real functions through
  the actual client export chain (`@sentry/nextjs` -> `@sentry/react` ->
  `@sentry/browser`). Verified with `node -e "import('@sentry/browser')..."`
  reading `typeof` on each export, not just the `.d.ts` files that missed
  it the first time. `profilesSampleRate` was also found to be
  functionally dead in this SDK version (never read by the shipped
  `UIProfiler`/`shouldProfileSession`) despite still typing as valid —
  `profileSessionSampleRate` + `profileLifecycle` is what actually gates
  the profiler.
- Docs: `docs/observability/SENTRY_CLIENT_EXPERIENCE.md`,
  `docs/observability/SENTRY_IGNORE_ERRORS.md`,
  `memory/features/observability-sentry.md`.

## 2026-09-02 — new telemetry vocabulary: metrics, structured logs, correlation, workflow spans

- Branch: `agent/sentry-max-observability` (a sibling phase of the same
  multi-phase Sentry build as the entry above; merged into
  `agent/sentry-max-client` the same day — see that branch's own commit
  range for the exact SHAs, since this entry predates the merge).
- New `src/lib/observability/metrics.ts`: the only place a Helm metric name
  or dimension lives. `helm.workflow/db/job/ai/push/auth` catalogue as typed
  constants, an 11-key closed dimension allow-list, `sanitizeMetricAttributes`
  (drops the one bad attribute, never the whole metric — never a value
  shaped like an email/UUID/JWT/URL-with-query-string, never an `error_code`
  that looks like a message rather than a SQLSTATE/short class),
  `record{Workflow,Job,Ai,Push,Auth,DbFailure}()`, and
  `enforceMetricAttributeAllowlist` — the `beforeSendMetric` hook body, the
  one function in the file that fails CLOSED (strips attributes) on an
  internal error rather than following the fail-open convention everywhere
  else.
- New `src/lib/observability/structured-log.ts`: `helmLog.{debug,info,warn,error}`
  over `Sentry.logger`, normalizing `sport/feature/action/result/error_code/
  retry/runtime` and sanitizing everything else — secret-shaped field KEYS
  (`token/secret/password/authorization/cookie/key/jwt/apikey`, matched
  case-insensitively as a substring, at any nesting depth) dropped and
  counted via a new `helm.log.redacted_field` metric; remaining strings
  masked via the existing `maskEmails`; remaining objects/arrays
  `JSON.stringify`'d and capped at ~2KB — never sent raw. Also gains
  `enforceLogAttributeAllowlist`, the `beforeSendLog` hook body, mirroring
  `metrics.ts`'s fail-closed pattern.
- New `src/lib/observability/correlation.ts`: `getSentryCorrelation()`
  (reads the active span's trace/span id, fail-open to `null`) and
  `attachHelmTrace(traceId)` (writes Helm's own trace id onto both the
  active span and the current scope tag). `helm-flight-recorder.ts`'s
  pre-existing inverse (`sentry_trace_id`/`root_span_id` in
  `trace_runs.metadata`) was left unrewired — a hot round-save path a
  concurrent effort is also touching — and instead got one locking test in
  `helm-flight-recorder.test.ts` asserting the existing behavior.
- `src/lib/observability/spans.ts` extended, every existing export
  unchanged: ten workflow-level op constants (`golf.round.create/autosave/
  submit`, `golf.shot.persist`, `golf.round.recover`, `coachhelm.request/
  persist`, `job.run`, `push.deliver`, `auth.attempt`), a `WorkflowOutcome`
  union (13 members — a deliberate SUPERSET of `RoundStageOutcome`, not an
  alias of it, so existing `roundStage()` call sites cannot silently start
  accepting outcomes their own tests never exercised), and
  `finishWorkflowSpan(span, outcome, extra?)`.
- `src/instrumentation.ts` (Node + Edge branches) and
  `src/instrumentation-client.ts` gain `beforeSendMetric`/`beforeSendLog`
  wiring (the second, independent enforcement line for the two files above)
  and a defensive `Set-Cookie`/`set-cookie` header scrub alongside the
  existing `Cookie`/`Authorization` deletions in each file's request-header
  scrubber. No other change to either file — profiling, feedback,
  third-party-error-filter, and replay integrations on the client file are
  the sibling phase above and were not touched by this entry.
- Privacy verified with a dedicated sentinel string
  (`sentry-test-secret-DO-NOT-STORE-123`) pushed through all three
  surfaces — metric attributes, `helmLog` fields, and both instrumentation
  entrypoints' `beforeSend`/`beforeSendMetric`/`beforeSendLog` hooks
  (Authorization/Cookie/Set-Cookie headers, and a query-string token) — in
  `metrics.test.ts`, `structured-log.test.ts`, and the new
  `instrumentation-{,client-}privacy-sentinel.test.ts` files.
- Full detail: `docs/observability/SENTRY_TELEMETRY_TAXONOMY.md`.
## 2026-09-02 — Sentry Snapshots visual-diff CI added

- SHA: 75d3c761a (branch point; see the PR for the merge SHA).
- Change: new `.github/workflows/sentry-snapshots.yml` (advisory, not
  required), `e2e/sentry-snapshots.spec.ts` (public pages + GolfHelm
  player), `e2e/sentry-snapshots-baseball.spec.ts` (BaseballHelm coach +
  player), and shared capture helpers in
  `e2e/fixtures/sentry-snapshot-helpers.ts`. Captures a fixed, named set of
  15 screens (30 images across mobile + desktop viewports) from each PR's
  own build and uploads them via `sentry-cli snapshots upload` (pinned
  3.7.0) for Sentry to diff head against base and post a status check.
  `playwright.config.ts` updated to wire the new baseball spec into the
  existing `baseball-coach` / `baseball-player` projects, same pattern
  `visual-audit.spec.ts` already uses.
- Why: no automated visual-regression signal existed on PRs before this —
  `visual-audit.spec.ts` is a manual-only, unbounded route crawl against
  production, not a fixed-filename diffable set. Runs against the real
  shared Supabase project (strictly read-only) rather than a local
  throwaway stack, because no GolfHelm demo-seed script exists and
  replicating `baseball-auth-smoke`'s ~17-minute local-stack pattern for a
  second product on every PR would reintroduce the PR-throughput cost that
  got that job moved off the PR gate on 2026-08-26.
- Full design, screen list, determinism rules, and OWNER ACTION items (a
  CI-scoped `SENTRY_AUTH_TOKEN` — blocked, Sentry's org-auth-token API
  refuses personal-token Bearer auth; golf coach-role coverage — needs a
  `GOLFHELM_COACH_EMAIL`/`PASSWORD` secret) live in
  `docs/observability/SENTRY_SNAPSHOTS.md`.

## 2026-09-02 — Phase C, Deliverable 1: withSentryConfig's discarded third argument

- Branch: `agent/sentry-max-server`. SHA: `c23cbb947`.
- Change: `withSentryConfig(nextConfig, sentryBuildOptions)` in
  `next.config.mjs` was called with THREE positional arguments; the
  installed `@sentry/nextjs@10.71.0` signature has exactly two, so the
  third — six real options including the ad-blocker-safe tunnel route and
  `hideSourceMaps` — was silently discarded every build. Extracted the
  merged options object into `src/lib/sentry-build-options.mjs`'s
  `buildSentryBuildOptions()` (unit-testable outside `next.config.mjs`'s
  non-TS pipeline), fixed `hideSourceMaps: true` (not a real 10.71.0
  option) to `sourcemaps: { deleteSourcemapsAfterUpload: true }`, and
  deliberately set `automaticVercelMonitors: false` (would build-time-
  inject a second, independent Vercel Cron Monitor mechanism alongside
  Deliverable 3's per-job `captureCheckIn` calls — see that entry).
- A later merge (`f6efd45bd`, below) reconciled this with an independent
  inline fix from another phase that kept both bugs; `applicationKey`
  became a parameter of `buildSentryBuildOptions` (default `'helm-web'`)
  so `next.config.mjs` can pass it explicitly, keeping the literal
  Phase D's `sentry-application-key.test.ts` greps for in that file's own
  raw text without editing that test.
- Docs: `docs/observability/SENTRY_PHASE_A_FINDINGS.md` §(h).

## 2026-09-02 — Phase C, Deliverable 2: four duplicate-capture bugs

- Branch: `agent/sentry-max-server`. SHA: `1698732c7`.
- Change: (1) `register-process-error-handlers.ts` — process-level
  `uncaughtException`/`unhandledRejection` handlers now check
  `isAlreadyBridgeLogged` before writing a second admin_events row for an
  error the request-scoped handler already captured. (2)
  `global-error.tsx` — the same marker-gating, plus a fix so the boundary's
  own `console.error` breadcrumb doesn't fire for an error already logged.
  (3) `instrumentation.ts`'s `sharedIgnoreErrors` gained the three Lifting
  control-flow error classes (`LiftingUnauthorizedError`/
  `LiftingNoOrgError`/`LiftingForbiddenError`) that were reaching Sentry as
  full Errors despite being expected auth/access rejections. (4)
  `onRequestError` now computes `alreadyLogged` once and gates
  `Sentry.captureRequestError` on `!alreadyLogged`, closing the last
  double-capture path.
- Docs: `docs/observability/SENTRY_PHASE_A_FINDINGS.md` §(a)/(b)/(c)/(d).

## 2026-09-02 — Phase C, Deliverable 3: Sentry Cron Monitor check-ins

- Branch: `agent/sentry-max-server`. SHA: `d8de018dd`; correctness
  follow-ups from an advisor review of this and Deliverable 1: `974f9ff27`.
- Change: new `src/lib/observability/cron-monitors.ts`
  (`shouldEmitCronCheckIns`, `resolveCronMonitorSlug`,
  `resolveCronMonitorConfig` — never returns undefined; unregistered jobs
  get a conservative 30-day-interval fallback config rather than silently
  achieving nothing, `startCronCheckIn`/`finishCronCheckIn`, all fail-open)
  wired into `recordJobRun` (Vercel crons, `src/lib/admin/job-log.ts`, all
  3 exit paths — success, resolved 4xx/5xx Response, thrown error),
  `withBridgeLogging` (Inngest, `src/lib/inngest/functions.ts`), and a new
  dependency-injectable `scripts/lib/sentry-cron-checkin.mjs` for the
  launchd Repair script (`scripts/run-selfheal-repair.mjs`), which cannot
  import TS/`@/`-aliased modules. `src/lib/admin/cron-registry.ts` gained a
  required `schedule: string` field (the exact vercel.json crontab string)
  on every `CronRegistryEntry`, contract-tested byte-exact against
  `vercel.json` so a monitor's expected schedule in Sentry can never
  quietly disagree with what Vercel actually runs.
- The correctness follow-up (`974f9ff27`) flipped
  `automaticVercelMonitors` from an initially-shipped `true` back to
  `false` after re-reading the installed SDK's own build-time source
  showed it would inject a second, duplicate Cron Monitor mechanism — see
  Deliverable 1's entry.
- Docs: `docs/observability/SENTRY_CRON_MONITORS.md` (full job table,
  monitor slug conventions, the `automaticVercelMonitors:false` decision
  record).
- Follow-up owed and NOT done in this phase: `memory/features/
  admin-platform.md` was not updated for the cron check-in wiring at the
  time — closed in this same session's Deliverable 7 pass (see that
  entry below).

## 2026-09-02 — Phase C, Deliverable 4: /api/health readiness probe

- Branch: `agent/sentry-max-server`. SHA: `00fceaa03`.
- Change: rewrote `src/app/api/health/route.ts` — bounded Supabase query
  via `.abortSignal(AbortSignal.timeout(2500))` on
  `.from('users').select('id').limit(1)`, honest HTTP status
  (200 only when `status: 'healthy'`, else 503 for `'degraded'`), a
  60-second-throttled `logServerError` on the degraded branch (never
  logged every poll), and a response body of `{status, database, release,
  timestamp, responseTimeMs}` — dropped the previous `deploymentId` field
  in favor of `release` (`NEXT_PUBLIC_SENTRY_RELEASE ??
  VERCEL_GIT_COMMIT_SHA ?? 'unknown'`), with no sensitive fields.
- Every real consumer of the old `deploymentId` field was found and fixed
  in the same commit: `scripts/warm-edge.ts`,
  `StaleDeploymentRecoveryScript.tsx`, `src/app/layout.tsx`'s
  `x-deployment-id` meta tag. Also fixed a latent bug found while auditing
  consumers: `src/hooks/golf/use-connection-status.ts` was conflating
  `response.ok` with reachability — any response (including a 503 from
  this exact route) proves the network path works, so `isConnected` now
  reads `true` for any response that arrives at all.
- Docs: none dedicated; `docs/observability/SENTRY_PHASE_A_FINDINGS.md`
  §(k)/(l) cover the original findings this addressed.

## 2026-09-02 — Phase C, Deliverable 5: AI observability, all 5 production call sites

- Branch: `agent/sentry-max-server`. SHA: `0113043b6`.
- Change: per-call `experimental_telemetry: { isEnabled: true, functionId,
  recordInputs: false, recordOutputs: false }` opt-in at every production
  Vercel AI SDK call site — `src/app/api/coachhelm/v3/chat/stream/route.ts`
  (`streamText`, `functionId: 'coachhelm.chat'`), both `generateObject`
  calls in `src/lib/golf/schedule-vision.ts` (extraction + day-
  verification), `src/lib/admin/rca.ts`'s `generateObject`, and
  `src/lib/coachhelm/v3/llm/compose.ts`'s `runLlmAttempt` (`generateText`,
  restructured with a try/catch to add per-attempt telemetry + recordAi).
  Flipped the global `Sentry.vercelAIIntegration({recordInputs: false,
  recordOutputs: false})` default in `instrumentation.ts` to match — Phase
  A found it configured with BOTH flags `true` while being structurally
  inert (no call site opted in), one line away from recording every
  prompt/output body the moment any of them did.
  `Sentry.setConversationId(convId)` added to the chat-stream route (the
  only call site with a stable, opaque, non-user-derived thread id).
  `recordAi()` (metrics.ts) called on both success and failure at all 5
  sites.
- Docs: `docs/observability/SENTRY_PHASE_A_FINDINGS.md` §(a) (the
  recordInputs/recordOutputs finding).

## 2026-09-02/03 — merge + Deliverable 6: re-merge and round-lifecycle/wrapper metrics

- SHA: `f6efd45bd` (re-merge of `origin/agent/sentry-max-observability`,
  required before Deliverable 6 per this phase's own directive — resolved
  4 conflicts: `next.config.mjs` kept the Deliverable 1 extracted-helper
  approach over an independent inline fix that still carried both bugs;
  `src/instrumentation.ts` kept both phases' imports and de-duplicated a
  `beforeSendMetric`/`beforeSendLog` key that auto-merge had landed twice
  from non-conflicting hunks; `src/lib/admin/cron-registry.ts` added the
  incoming `selfheal-triage` entry's required `schedule` field, verified
  byte-for-byte against `vercel.json` rather than trusting the incoming
  comment; `docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md` resolved by
  regeneration).
- SHA `922360b34` (Deliverable 6, part 1): `createHelmFlightRecorder`'s
  `finalize()` (`src/lib/observability/helm-flight-recorder.ts`) now emits
  `recordWorkflow` (feature `golf_round_lifecycle`) + one `helmLog` line
  from all three of its return paths — the real recorder, the
  disabled-mode no-op, and the start-timeout degrade path — covering all
  four flight-recorder workflows (`golf.round.submit`/`.autosave`,
  `golf.shot.delete`/`.add_or_edit`) from one change; deliberately NOT
  gated behind the recorder's own production opt-in, since that gate is a
  helm_debug DB-persistence decision and gating the Sentry metric behind
  it too would make it mostly silent exactly where it matters.
  `attachHelmTrace(traceId)` now runs at construction. `deleteInProgressRoundImpl`
  ("recover" — `src/app/golf/actions/golf.ts`) gained a local
  `recordDiscardRoundOutcome` helper at its 6 return branches
  (`outcome:'stale_round_state'`, not `'db_error'`, for the ordinary
  already-finished/removed race). `loginActionImpl`
  (`src/app/golf/actions/auth.ts`) calls `recordLoginOutcome` — moved into
  its own module, `src/lib/observability/golf-login-outcome.ts`, after a
  first attempt at exporting it directly from `auth.ts` broke that file's
  `'use server'` constraint (every export must be an async Server Action)
  and was caught by `coverage-contract.observability.test.ts` before it
  shipped. `sendPushNotification` (`src/lib/notifications/push.ts`) records
  `recordPush` only for calls that attempted a device delivery; the
  opted-out/no-devices returns log at `helmLog.info` without calling
  `recordPush`, so the attempt counter isn't inflated by non-attempts.
- SHA `bbc474178` (Deliverable 6, part 2): `withGolfAction`/
  `withBaseballAction`/`withLiftingAction`
  (`src/lib/{golf,baseball,lifting}/with-*-action.ts`) each call
  `recordWorkflow` at their success/expected-error/unexpected-error exit
  points, dimensioned by `sport`+`action` only (fixed `feature` literal
  per wrapper — `golf_action`/`baseball_action`/`lifting_action` — never a
  per-call identity dimension).
- Docs: `memory/features/observability-sentry.md`'s Consumers section
  updated in this same session's Deliverable 7 pass (see below) to
  describe this work concretely rather than anticipate it.
