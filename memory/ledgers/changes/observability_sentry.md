# Sentry Observability — Telemetry Vocabulary change ledger

## 2026-09-02 — new telemetry vocabulary: metrics, structured logs, correlation, workflow spans

- SHA: recorded on `agent/sentry-max-observability` (see git log for the
  commit range — this file predates the branch merging, so no single merge
  SHA yet).
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
  third-party-error-filter, and replay integrations on the client file are a
  separate, ongoing effort and were not touched.
- Privacy verified with a dedicated sentinel string
  (`sentry-test-secret-DO-NOT-STORE-123`) pushed through all three
  surfaces — metric attributes, `helmLog` fields, and both instrumentation
  entrypoints' `beforeSend`/`beforeSendMetric`/`beforeSendLog` hooks
  (Authorization/Cookie/Set-Cookie headers, and a query-string token) — in
  `metrics.test.ts`, `structured-log.test.ts`, and the new
  `instrumentation-{,client-}privacy-sentinel.test.ts` files.
- Full detail: `docs/observability/SENTRY_TELEMETRY_TAXONOMY.md`.
