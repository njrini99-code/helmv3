<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
<!-- schema-drift-absent: golf_action, baseball_action -->
<!-- `golf_action`/`baseball_action` below are Sentry metric `feature`
     dimension LITERALS (the fixed string withGolfAction/withBaseballAction
     pass to recordWorkflow) — never database objects, and were never meant
     to be. They only match the golf_*/baseball_* schema-drift identifier
     pattern by naming coincidence with the sport prefix convention. -->
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

- `golf_round_lifecycle`/`shot_tracking` — `roundStage`/`classifyAutosaveOutcome`
  (pre-existing, sparse: one `roundStage` call in
  `submitGolfRoundComprehensiveImpl`'s post-submit stats-cache step, one
  `classifyAutosaveOutcome`/`OPERATION` pairing in `savePartialRoundImpl`'s
  RPC call — not a full per-step span vocabulary, and NOT extended by the
  work below). On top of that, `recordWorkflow`/`helmLog`/`attachHelmTrace`
  (metrics.ts / structured-log.ts / correlation.ts, all three listed above)
  are now wired into `createHelmFlightRecorder`'s `finalize` — one shared
  hook covering all four flight-recorder workflows
  (`golf.round.submit`/`golf.round.autosave`/`golf.shot.delete`/
  `golf.shot.add_or_edit`) from every one of `finalize`'s three return
  paths (the real recorder, the disabled-mode no-op, and the
  start-timeout degrade path) — plus `deleteInProgressRoundImpl` ("recover")
  via a local `recordDiscardRoundOutcome` helper, since that action never
  constructs a flight recorder. See
  `memory/ledgers/changes/observability_sentry.md`'s Deliverable 6 entries
  for commits/tests.
- `coachhelm_ai` — `recordAi()`, wired into all 5 production AI SDK call
  sites per Deliverable 5 (see the ledger) via per-call
  `experimental_telemetry`; the `OP_COACHHELM_REQUEST`/
  `OP_COACHHELM_PERSIST` span ops remain a separate, pre-existing surface
  this feature's own commits did not touch.
- `auth_onboarding_join` — `recordAuth()` via
  `src/lib/observability/golf-login-outcome.ts`'s `recordLoginOutcome`,
  called from every one of `loginActionImpl`'s 8 return branches
  (`src/app/golf/actions/auth.ts`).
- Push delivery — `recordPush()`, wired into
  `src/lib/notifications/push.ts`'s `sendPushNotification` (the single-user
  delivery function; `sendBulkPushNotification` is covered transitively,
  since it calls the former per recipient — not separately instrumented).
- The three generic action wrappers — `withGolfAction`/`withBaseballAction`/
  `withLiftingAction` (`src/lib/{golf,baseball,lifting}/with-*-action.ts`)
  each call `recordWorkflow` at their own success/expected-error/unexpected-
  error exit points, dimensioned by `sport`+`action` only (a fixed
  `feature` literal per wrapper — `golf_action`/`baseball_action`/
  `lifting_action` — never a per-call identity dimension like
  round/team/org id, since these wrappers are shared across every action
  they wrap). `withLiftingAction` matched no `feature_id` in
  `memory/registry.yml` as of this writing — a registry gap, not fixed
  here; see that file's own `features:` map before assuming lifting has no
  telemetry-consuming code at all.
- Job/cron surfaces — `recordJobRun`/Sentry Cron Monitor check-ins
  (`src/lib/observability/cron-monitors.ts`,
  `docs/observability/SENTRY_CRON_MONITORS.md`), added in Deliverable 3.

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
