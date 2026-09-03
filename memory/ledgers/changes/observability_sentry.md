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
