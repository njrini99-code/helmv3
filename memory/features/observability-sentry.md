# Feature: Sentry Observability — Telemetry Vocabulary

## Status

- active

## Current State

The typed telemetry vocabulary Helm's other features instrument against —
not a product feature with user-facing behavior, but the shared layer
`memory/registry.yml`'s other entries route their observability through.

Full detail: `docs/observability/SENTRY_TELEMETRY_TAXONOMY.md` (metric
catalogue + dimensions, span ops + `WorkflowOutcome`, the `helmLog`
structured-log schema, the privacy rules that gate all three, and the
Sentry-trace-id <-> Helm-trace-id correlation model). `docs/observability/
SENTRY_SUPABASE_TRACING.md` covers the request-tracing layer this sits
alongside (not duplicated here).

## Primary Entry Points

### Services

- `src/instrumentation.ts` — server (Node + Edge) `Sentry.init`, `scrubPii`
  (`beforeSend`), `beforeSendMetric`/`beforeSendLog` wiring, `onRequestError`.
- `src/instrumentation-client.ts` — browser `Sentry.init` and the matching
  `beforeSend`/`beforeSendMetric`/`beforeSendLog` wiring. Profiling,
  feedback, third-party-error-filter, and replay integrations on this file
  are a SEPARATE ongoing effort (Phase D of the same build) — not covered by
  this doc.
- `src/lib/observability/metrics.ts` — the only place a Helm metric name or
  dimension lives; `record{Workflow,Job,Ai,Push,Auth,DbFailure}` +
  `sanitizeMetricAttributes`/`enforceMetricAttributeAllowlist`.
- `src/lib/observability/structured-log.ts` — `helmLog.*` +
  `sanitizeLogAttributes`/`enforceLogAttributeAllowlist`.
- `src/lib/observability/correlation.ts` — `getSentryCorrelation()` /
  `attachHelmTrace()`.
- `src/lib/observability/spans.ts` — the span/attribute vocabulary
  (`roundStage`, `finishWorkflowSpan`, the op constants, `RoundStageOutcome`/
  `WorkflowOutcome`), `safeAttributes`, `describeDbErrorForSpan`.
- `src/lib/observability/redact-pii.ts` — `maskEmails`/`redactEventPii`,
  reused by `structured-log.ts` rather than duplicated.
- `src/lib/observability/supabase-tracing.ts`,
  `src/lib/observability/helm-flight-recorder.ts` — pre-existing; the
  flight recorder's own Sentry-trace-id correlation
  (`sentry_trace_id`/`root_span_id` in `trace_runs.metadata`) predates this
  module and was left as-is (see the taxonomy doc §6.3 for why).

### Tests

- `src/lib/observability/__tests__/**` — `spans.test.ts`, `metrics.test.ts`,
  `structured-log.test.ts`, `correlation.test.ts`,
  `helm-flight-recorder.test.ts`, plus the pre-existing
  `supabase-tracing.test.ts`/`golf-round-flight-workflow.test.ts`/
  `vercel-wait-until.test.ts`/`register-process-error-handlers.test.ts`.
- `src/test/observability/**` — `redact-pii.test.ts`,
  `instrumentation-register.test.ts`,
  `instrumentation-privacy-sentinel.test.ts` (server),
  `instrumentation-client-privacy-sentinel.test.ts` (client). The last two
  push a sentinel string through every `beforeSend*` hook and assert it
  never survives.

## Consumers (who instruments AGAINST this vocabulary)

- `round_tracking`/`shot_tracking` — `roundStage`/`classifyAutosaveOutcome`
  (pre-existing) and, going forward, the `OP_ROUND_*`/`OP_SHOT_PERSIST`
  workflow ops for the server actions in `src/app/golf/actions/golf.ts`
  (deliberately NOT touched by this feature's own code — a separate,
  concurrent effort instruments that file against the vocabulary here).
- `coachhelm_ai` — `OP_COACHHELM_REQUEST`/`OP_COACHHELM_PERSIST` +
  `recordAi()`.
- Job/push/auth surfaces repo-wide — `OP_JOB_RUN`/`OP_PUSH_DELIVER`/
  `OP_AUTH_ATTEMPT` + the matching `record*()` families.

## Known Gaps / Deliberate Non-Coverage

- No `admin_events.feature` key for this feature itself — see the
  `observability` block in `memory/registry.yml`'s `observability_sentry`
  entry for why.
- Client-side profiling/feedback/third-party-error-filter/replay
  integrations are explicitly out of scope here (a separate, ongoing
  effort on the same file).
- The workflow-op instrumentation of actual call sites
  (`src/app/golf/actions/golf.ts` etc.) is NOT part of this feature's code —
  this feature is the vocabulary those call sites will use, not the
  instrumentation of them.
