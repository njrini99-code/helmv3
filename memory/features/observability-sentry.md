# Feature: Sentry Observability

## Status

- active (platform infrastructure, not a product feature — see
  `memory/registry.yml`'s `integrations.sentry` entry; `npm run
  knowledge:map` only walks the `features:` map, so these files
  legitimately show zero product-feature impact)

## Current State

Two phases of the same "maximum observability" build, on the same files,
documented together because a reader touching `instrumentation-client.ts`
or `instrumentation.ts` needs both halves.

### Client experience (browser `Sentry.init`)

`src/instrumentation-client.ts` builds its `Sentry.init()` options from a
pure function, `src/lib/sentry-client-options.ts`'s
`buildClientSentryOptions(env, hostname)`, so sample rates,
`ignoreErrors`, and `tracePropagationTargets` are unit-testable without
booting the SDK.

Browser UI profiling reads `NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE` but
maps it into `profileSessionSampleRate` + `profileLifecycle: 'trace'` —
the installed SDK's `profilesSampleRate` field is deprecated and, verified
by reading the shipped profiler source, never consulted at runtime.
Requires the `Document-Policy: js-profiling` response header, already set
for every route in `next.config.mjs`. Chromium-only — Safari/iOS never
profiles.

Session Replay masks all text and all input values by default
(`maskAllText`/`maskAllInputs: true`), never sets
`networkDetailAllowUrls` (no request/response bodies or headers are ever
captured), and additionally masks two identifying components by a shared
`data-sentry-mask` attribute as defense in depth: `FairwayPlayerCard`
(roster) and `FairwayRecruitCard` (recruiting — name, email, phone).
`blockAllMedia: false` is a deliberate, kept choice.

Third-party error filtering (`thirdPartyErrorFilterIntegration`) drops
events whose stack is entirely third-party script, keyed on
`applicationKey: 'helm-web'` in `next.config.mjs`'s `withSentryConfig`
options — that key only tags first-party modules on PRODUCTION builds
(`withSentryConfig` itself is skipped in dev), so the filter is gated
`!isDev` the same way Replay is, or every dev-mode client error would be
silently dropped.

In-app feedback: `feedbackIntegration({autoInject: false, ...})` — no
floating widget. `ReportProblemButton`
(`src/components/fairway/feedback/ReportProblemButton.tsx`, mounted in
golf Settings) is the only entry point, calling
`Sentry.getFeedback()?.createForm()` and falling back to a plain
`mailto:` + a toast (never a crash) when the SDK/integration is
unavailable.

Breadcrumbs: `recordHelmBreadcrumb(category, message, data?)`
(`src/lib/observability/client-breadcrumbs.ts`) enforces an allow-listed
`data` shape (feature/action/result/count/round_ordinal — never an id,
name, or email) both at the type level and again at runtime, and never
throws. Wired at three round-entry outcome sites: autosave
(`use-shot-state-machine.ts`), per-shot edit save
(`use-edit-shot-modal.ts`), and round submit (`continue-round-client.tsx`).

Tags: `beforeSend` sets the existing coarse `sport` bucket
(admin/lifting/baseball/golf/marketing — untouched, Sentry alert rules key
on these exact values) AND now also sets `feature` via
`error-trace-classification.ts`'s `classifyTraceSurface` — the SAME
classifier `error-logging.ts`'s `logError()` already used to tag its own
events — closing the gap for events that reach Sentry without going
through `logError` (raw exceptions, non-bridge-logged console errors).

Full reference: `docs/observability/SENTRY_CLIENT_EXPERIENCE.md`. Every
`ignoreErrors` pattern is individually justified in
`docs/observability/SENTRY_IGNORE_ERRORS.md`.

### Telemetry vocabulary (server + shared)

The typed telemetry vocabulary Helm's other features instrument against —
not a product feature with user-facing behavior, but the shared layer
`memory/registry.yml`'s other entries route their observability through.

Both `instrumentation.ts` (server) and `instrumentation-client.ts`
(browser) now wire `beforeSendMetric: enforceMetricAttributeAllowlist` and
`beforeSendLog: enforceLogAttributeAllowlist` as a second, independent
line of defence beyond `metrics.ts`'s/`structured-log.ts`'s own
sanitization at the call site — each fails CLOSED on an internal error.
The client `beforeSend` also scrubs a defensive `Set-Cookie`/`set-cookie`
header pair alongside the existing `Cookie`/`Authorization` scrub (a
response header that should never appear on `event.request`, but costs
nothing to strip and the privacy-sentinel suite checks for it explicitly).

Full detail: `docs/observability/SENTRY_TELEMETRY_TAXONOMY.md` (metric
catalogue + dimensions, span ops + `WorkflowOutcome`, the `helmLog`
structured-log schema, the privacy rules that gate all three, and the
Sentry-trace-id <-> Helm-trace-id correlation model). `docs/observability/
SENTRY_SUPABASE_TRACING.md` covers the request-tracing layer this sits
alongside (not duplicated here).

## Primary Entry Points

### Client experience code

- `src/instrumentation-client.ts`
- `src/lib/sentry-client-options.ts`
- `src/lib/observability/client-breadcrumbs.ts`
- `src/components/fairway/feedback/ReportProblemButton.tsx`
- `next.config.mjs` (`withSentryConfig` options block + `headers()`)

### Telemetry vocabulary services

- `src/instrumentation.ts` — server (Node + Edge) `Sentry.init`, `scrubPii`
  (`beforeSend`), `beforeSendMetric`/`beforeSendLog` wiring, `onRequestError`.
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
  `helm-flight-recorder.test.ts`, `client-breadcrumbs.test.ts`, plus the
  pre-existing `supabase-tracing.test.ts`/`golf-round-flight-workflow.test.ts`/
  `vercel-wait-until.test.ts`/`register-process-error-handlers.test.ts`.
- `src/test/observability/**` — `redact-pii.test.ts`,
  `instrumentation-register.test.ts`,
  `instrumentation-privacy-sentinel.test.ts` (server),
  `instrumentation-client-privacy-sentinel.test.ts` (client). The last two
  push a sentinel string through every `beforeSend*` hook and assert it
  never survives.
- `src/lib/__tests__/sentry-client-options.test.ts`,
  `src/lib/security/__tests__/sentry-application-key.test.ts`,
  `sentry-profiling-header.test.ts`, `sentry-replay-privacy.test.ts`,
  `src/components/fairway/feedback/ReportProblemButton.test.tsx` — client
  experience.

## Consumers (who instruments AGAINST the telemetry vocabulary)

- `round_tracking`/`shot_tracking` — `roundStage`/`classifyAutosaveOutcome`
  (pre-existing) and, going forward, the `OP_ROUND_*`/`OP_SHOT_PERSIST`
  workflow ops for the server actions in `src/app/golf/actions/golf.ts`
  (deliberately NOT touched by this feature's own code — a separate,
  concurrent effort instruments that file against the vocabulary here).
- `coachhelm_ai` — `OP_COACHHELM_REQUEST`/`OP_COACHHELM_PERSIST` +
  `recordAi()`.
- Job/push/auth surfaces repo-wide — `OP_JOB_RUN`/`OP_PUSH_DELIVER`/
  `OP_AUTH_ATTEMPT` + the matching `record*()` families.

## Business Rules

- Never capture request/response bodies or auth headers in Replay —
  `networkDetailAllowUrls` stays unset.
- Breadcrumb `data` is allow-listed; never an id, name, or email.
- `tracesSampleRate` is out of scope for the client-experience surface —
  do not change it there; it is owned by the broader Sentry rollout
  decision, not that file.
- The workflow-op instrumentation of actual call sites
  (`src/app/golf/actions/golf.ts` etc.) is NOT part of the telemetry
  vocabulary's own code — that vocabulary is what those call sites will
  use, not the instrumentation of them.

## Known Gaps / Deliberate Non-Coverage

- No `admin_events.feature` key for this feature itself — see the
  `observability` block in `memory/registry.yml`'s `integrations.sentry`
  entry for why.

## Rollback

Every client-experience env override degrades independently to 0/off (see
`SENTRY_CLIENT_EXPERIENCE.md`); reverting the integration wiring itself is
a normal revert of the commits that added it.
