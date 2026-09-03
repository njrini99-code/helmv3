<!-- markdownlint-disable MD013 -->
# Sentry telemetry taxonomy — metrics, spans, structured logs, correlation

Phase B of the Sentry maximum-observability build. This is the vocabulary
Phase C's server-action instrumentation and Phase D's client hardening build
on: the single source of truth for every metric name, span op, and log
field this repo is allowed to emit to Sentry.

Anchor SHA for the "current" claims below: `9a99584e9`. Run
`git rev-list --count 9a99584e9..HEAD -- 'src/lib/observability/**' 'src/instrumentation*.ts'`
to see how far the code has moved since this was written — never trust a
date here, per `.claude/rules/shipping.md` §1.

Companion docs:

- `docs/observability/SENTRY_SUPABASE_TRACING.md` — how a request is traced
  end to end (spans, W3C propagation, the Supabase integration). This doc
  does not repeat that; it covers what got layered on top in Phase B.
- `docs/observability/SENTRY_SDK_API_VERIFICATION.md` /
  `SENTRY_COVERAGE_MATRIX.md` — Phase A's SDK export verification and
  current-state audit. This doc assumes those findings; verify against them
  before trusting an SDK claim below that looks stale.

---

## 1. Why a taxonomy file, not a convention

A metric name, span op, or log field is data infrastructure: a typo compiles,
ships, and silently stops a dashboard from counting real traffic — nobody
sees an error, they see a chart that quietly went to zero. Every name below
is a typed constant in code (`src/lib/observability/{metrics,spans,structured-log}.ts`)
for exactly that reason. If this doc and the code ever disagree, **the code
wins** — this doc is documentation of the constants, not a second definition
of them.

The cardinality rule, stated once because it governs every section below:
identity values (`round_id`, `player_id`, an email) belong on ONE SPAN,
scoped to the request that produced them. Low-cardinality classifiers
(`sport`, `feature`, `action`, `result`) are safe anywhere — a span
attribute, a metric dimension, a log field. A metric dimension is worse than
a span attribute if this rule is broken: it is a Sentry-side index key
forever, with no equivalent of "just this one trace" to fall back on. This
is why the metric dimension allow-list (§2) is a CLOSED set and the span
attribute vocabulary (§3) is not.

---

## 2. Metric catalogue

Source of truth: `src/lib/observability/metrics.ts`. Six families, each
following the same shape (attempt/success/failure + duration) EXCEPT where
the catalogue below says otherwise — the exceptions are deliberate, not
gaps, and the code emits exactly what this table lists, never more.

| Family | Metric names | Dimensions attached | `record*()` entry point |
| --- | --- | --- | --- |
| Workflow | `helm.workflow.attempt` (counter), `helm.workflow.success` (counter), `helm.workflow.failure` (counter), `helm.workflow.duration` (distribution, unit `millisecond`) | `feature`, `action`, `sport?`, `environment?`, `operation?`, `runtime?`; the failure/success events also carry `result` (the granular `WorkflowOutcome`, not just success/failure) and `error_code?` | `recordWorkflow()` |
| Database | `helm.db.failure` (counter), `helm.db.duration` (distribution, unit `millisecond`) | `feature`, `action`, `error_code?`, `sport?`, `environment?`, `operation?`, `runtime?` | `recordDbFailure()` |
| Job | `helm.job.started` (counter), `helm.job.completed` (counter), `helm.job.failed` (counter), `helm.job.duration` (distribution, unit `millisecond`) | `job_name`, `environment?`, `runtime?`; failure additionally carries `result`/`error_code?` | `recordJob()` |
| AI | `helm.ai.request` (counter), `helm.ai.success` (counter), `helm.ai.failure` (counter), `helm.ai.duration` (distribution, unit `millisecond`), `helm.ai.input_tokens` (distribution, unit `none`), `helm.ai.output_tokens` (distribution, unit `none`) | `feature`, `action`, `model?`, `provider?`, `environment?`, `runtime?`; token distributions only emitted when the caller supplies a count | `recordAi()` |
| Push | `helm.push.attempt` (counter), `helm.push.delivered` (counter), `helm.push.failed` (counter) | `feature`, `action`, `provider?`, `environment?`, `runtime?` | `recordPush()` |
| Auth | `helm.auth.attempt` (counter), `helm.auth.failure` (counter) | `action`, `environment?`, `runtime?`; failure carries `result`/`error_code?` | `recordAuth()` |
| Logging | `helm.log.redacted_field` (counter) — bumped once per field `helmLog`/`enforceLogAttributeAllowlist` silently drops for looking secret-shaped | `feature?` | `recordLogRedactedField()` (called from `structured-log.ts`, not a call site) |

**Deliberate asymmetries** (do not "fix" these by adding a metric the
catalogue doesn't list):

- `helm.db` has no `attempt`/`success` — Supabase call VOLUME is already
  captured by the `db` spans `withSupabaseTracing` produces (see the
  Supabase tracing doc); this family exists only for the failure signal a
  span sampling decision can drop.
- `helm.push` has no `duration` metric — push delivery latency is not
  currently a Helm SLO; add it if that changes, in the catalogue first.
- `helm.auth` has no `success` or `duration` — a successful auth attempt is
  not, on its own, an interesting metric. Failures are what this exists to
  count.

### 2.1 Allowed dimensions — a closed set

```text
environment, sport, feature, action, operation, result, runtime,
provider, error_code, model, job_name
```

Any other key is dropped at the `record*()` call site (`sanitizeMetricAttributes`)
AND again, independently, by the `beforeSendMetric` hook wired into both
`instrumentation.ts` (Node and Edge) and `instrumentation-client.ts`
(`enforceMetricAttributeAllowlist`) — so a raw `Sentry.metrics.*` call
somewhere that does not route through `record*()` still gets the same
allow-list applied before the event leaves the process.

`error_code` is additionally checked against a MESSAGE shape (contains
whitespace, or longer than 64 characters) and dropped if it looks like one —
the taxonomy is "SQLSTATE or short class, never a message"
(`57014`, `AuthApiError`), enforced in code, not just documented.

**A value is also dropped, independent of its key, if it LOOKS like PII**:
an email address, a UUID, a JWT (three base64url segments), or a URL
carrying a query string. This is a value-shape check, not a key-name check —
it protects against a legitimate dimension key (`action`, say) accidentally
being populated with something that shouldn't leave the process.

### 2.2 Drop policy: the attribute, never the whole metric

`sanitizeMetricAttributes` drops the single bad ATTRIBUTE and keeps every
other attribute plus the metric event itself. A `helm.workflow.failure`
count that arrives with one fewer dimension than intended is still a real,
countable event. Silently discarding the entire increment because one
caller-supplied value looked PII-shaped would make dashboards under-count
with no visible signal that they were doing so — worse than a slightly less
detailed but honest count.

### 2.3 Fail-open, except the one function that doesn't

Every `record*()` function, and the low-level `Sentry.metrics.*` wrappers
underneath them, are wrapped in try/catch and return `void`. A Sentry
failure, or a hostile value in one attribute, must never reach product code.

`enforceMetricAttributeAllowlist` (the `beforeSendMetric` hook body) is the
ONE exception: it fails CLOSED — on an internal error (e.g. a hostile
getter on `metric.attributes`) it returns the metric with `attributes: {}`
rather than the unsanitized originals. Its entire job is being the second,
independent line of defence against a PII leak; "fail open" there would
silently disable that defence exactly when it is needed. `enforceLogAttributeAllowlist`
(§4) follows the identical pattern for logs.

---

## 3. Span vocabulary

Source of truth: `src/lib/observability/spans.ts`. Unchanged from before
Phase B: `SPORT`, `FEATURE`, `ACTION`, `RESULT`, `OPERATION`, `ERROR_CODE`,
`RUNTIME` attribute keys; `OP_SERVER_ACTION`, `OP_ROUND_STAGE`; `safeAttributes`;
`describeDbErrorForSpan`; `roundStage()`/`classifyAutosaveOutcome()` and the
`RoundStageOutcome` taxonomy they lock. Phase B added the workflow-level
layer Phase C instruments against.

### 3.1 Workflow ops (new in Phase B)

```text
OP_ROUND_CREATE      golf.round.create
OP_ROUND_AUTOSAVE    golf.round.autosave
OP_ROUND_SUBMIT      golf.round.submit
OP_SHOT_PERSIST      golf.shot.persist
OP_ROUND_RECOVER     golf.round.recover
OP_COACHHELM_REQUEST coachhelm.request
OP_COACHHELM_PERSIST coachhelm.persist
OP_JOB_RUN           job.run
OP_PUSH_DELIVER      push.deliver
OP_AUTH_ATTEMPT      auth.attempt
```

Each names ONE complete user-facing operation, as opposed to
`OP_ROUND_STAGE` which names an internal phase within one (`roundStage()`
child spans nest under a workflow span; they are not a replacement for it).

### 3.2 `WorkflowOutcome` — a superset of `RoundStageOutcome`, not an alias

```text
success | validation_failed | auth_expired | permission_denied | conflict |
busy | timeout | network_failed | rpc_failed | unknown_commit |
provider_failed | not_found | unknown
```

`RoundStageOutcome` (the original 8: `success`, `validation_failed`,
`auth_expired`, `busy`, `timeout`, `network_failed`, `rpc_failed`,
`unknown_commit`) is locked to what `classifyAutosaveOutcome`/`roundStage()`
actually distinguish today, and stays that way — `WorkflowOutcome` is a
DIFFERENT, wider type for the workflow-span layer, not a widening of
`RoundStageOutcome` itself. Aliasing them would let every existing
`roundStage()` call site silently start accepting outcomes its own tests
never exercised.

### 3.3 `finishWorkflowSpan(span, outcome, extra?)`

Records a workflow span's terminal outcome the same way at every call site:
`result` is always set from `outcome`; any `extra` attributes (typically
`error_code`) go through `safeAttributes` first, so a `null`/`undefined`
value never becomes the literal string `"undefined"` in Sentry's UI. No-ops
on a missing span and never throws — see the same fail-open rule as
everywhere else in this taxonomy.

---

## 4. Structured-log schema

Source of truth: `src/lib/observability/structured-log.ts`.
`helmLog.{debug,info,warn,error}(event, fields)` wraps `Sentry.logger.*`.

### 4.1 Fields

| Field | Type | Notes |
| --- | --- | --- |
| `event` | `string`, required | Dot-namespaced, e.g. `golf.round.autosave.failed`. Passed as BOTH the log message and an `event` attribute, so it is filterable in Sentry's log explorer without parsing the message. |
| `sport` | `string?` | Same vocabulary as `spans.ts`/`metrics.ts`. |
| `feature` | `string?` | " |
| `action` | `string?` | " |
| `result` | `string?` | " |
| `error_code` | `string?` | SQLSTATE or short class — same convention as §2.1. |
| `retry` | `number?` | Attempt count, when the event is a retry. |
| `runtime` | `string?` | " |
| anything else | `unknown` | Sanitized per §4.2 before it reaches the SDK. |

Fields not supplied are omitted from the attributes object entirely —
never sent as `"undefined"`.

### 4.2 Sanitization of "anything else"

1. **Secret-shaped KEYS are dropped, at any nesting depth**, not just
   top-level. Matched case-insensitively as a SUBSTRING against:
   `token, secret, password, authorization, cookie, key, jwt, apikey`.
   Deliberately over-inclusive — a field named `sortKey` or `keyword` is
   also dropped. That is an accepted false positive: losing an occasional
   harmless field is a better failure mode than leaking a token because a
   future field is named `refreshTokenValue`. Each drop bumps
   `helm.log.redacted_field` (§2, Logging family).
2. Remaining **string** values go through the existing `maskEmails`
   (`redact-pii.ts`) — the same email masking every Sentry event already
   gets.
3. Remaining **object/array** values are never sent raw: `JSON.stringify`'d
   (AFTER the secret-key strip, so a nested secret never reaches the
   stringifier), capped at ~2KB (2000 characters), then also masked.
4. `null`/`undefined` fields are dropped.

`enforceLogAttributeAllowlist` (the `beforeSendLog` hook, wired into both
instrumentation entrypoints exactly like `enforceMetricAttributeAllowlist`)
applies the identical secret-key-strip + mask + cap treatment to ANY
`Sentry.logger.*` call, including ones that bypass `helmLog` entirely. Same
fail-CLOSED exception to the fail-open rule as §2.3.

### 4.3 What "never throws" does NOT cover, and why that's fine

`helmLog` cannot make `Sentry.logger.*` itself throw — that call is wrapped.
What it cannot do is make the SDK's own log capture fail; if that throws
internally the SDK is responsible for its own safety, not this file.

---

## 5. Privacy rules — the short version

- **A metric dimension key is allow-listed** (§2.1) — closed set, enforced
  twice (call site + `beforeSendMetric`).
- **A metric/log VALUE is PII-shape checked** — email, UUID, JWT,
  URL-with-query-string — independent of whether its key is otherwise
  legitimate.
- **A log field KEY is secret-pattern checked**, recursively, deliberately
  over-inclusive (§4.2).
- **Drop the attribute/field, never the whole event**, except the two
  `beforeSendMetric`/`beforeSendLog` hooks, which fail CLOSED on an
  internal sanitization error specifically (strip everything rather than
  risk passing through unsanitized data) — the one deliberate exception to
  "fail open" in this entire taxonomy, and it exists for the opposite
  reason every other exception would: to protect privacy, not availability.
- **Everything else fails open.** A Sentry outage, a malformed value, a
  thrown getter — none of it may reach product code. Every `record*()` and
  every `helmLog.*` call is wrapped in try/catch and returns `void`.

Verified with a dedicated sentinel string (`sentry-test-secret-DO-NOT-STORE-123`)
pushed through all three surfaces — `sanitizeMetricAttributes`, `helmLog`/
`enforceLogAttributeAllowlist`, and `scrubPii`'s Authorization/Cookie/
Set-Cookie header handling plus query-string stripping — in
`metrics.test.ts`, `structured-log.test.ts`, and
`instrumentation-{,client-}privacy-sentinel.test.ts` respectively. Grep the
sentinel string across `src/` to find every place this guarantee is checked.

---

## 6. Correlation model — Sentry trace id <-> Helm trace id

Source of truth: `src/lib/observability/correlation.ts`. Two independent
directions; both exist because they answer different questions.

### 6.1 Read: `getSentryCorrelation()`

> "What Sentry trace is active right now?"

Reads `Sentry.getActiveSpan()?.spanContext()` and returns
`{ traceId, spanId } | null`. Fail-open to `null` — a correlation id is
enrichment, never a requirement. `server-error-logger.ts`'s
`enrichTraceContext` already reads this inline (predates this module, left
as-is); new callers should use `getSentryCorrelation()` instead of
re-deriving the same `Sentry.getActiveSpan()` call.

### 6.2 Write: `attachHelmTrace(traceId)`

> "Make Sentry aware of Helm's own trace id."

Writes Helm's trace id (e.g. the flight recorder's UUID) two ways,
independently fail-open:

1. As a `helm.trace_id` ATTRIBUTE on the active span, if one exists —
   visible on that one trace in Sentry's trace view.
2. As a `helm.trace_id` TAG on the current scope — visible on every event
   the scope produces afterward (span, error, log), and searchable in
   Sentry's issue/event search regardless of whether a span happens to be
   active at write time.

### 6.3 The other inverse: `helm-flight-recorder.ts` (pre-existing, not rewired)

`createHelmFlightRecorder()`'s `baseMetadata` already puts
`sentry_trace_id` / `root_span_id` (from the span it constructs) into every
`trace_runs` row (`helm-flight-recorder.ts:247-248`, unchanged by Phase B).
This already works without routing through `correlation.ts`:
`Sentry.startInactiveSpan` inherits the ambient trace when one is active, so
the span the recorder constructs already IS the correlated span. Phase B
locked this with a test (`helm-flight-recorder.test.ts`) rather than
refactoring it through the new module — that file is a hot round-save path
Phase C is also touching, and "for consistency" is not a reason to take a
behavior-risk on it.

### 6.4 Why a log's `trace_id` cannot be asserted through a mocked SDK

The SDK stamps `trace_id` onto a log at SERIALIZATION time, inside
`_INTERNAL_captureLog` (`@sentry/core`), not inside `Sentry.logger.*` or
anything `helmLog`/`correlation.ts` calls directly. Every test in this
module mocks `@sentry/nextjs` at the module level — which REPLACES that
serialization step — so no such mock can ever demonstrate the stamped id;
the assertion would only be testing the mock. `correlation.test.ts` instead
unmocks the SDK for one test and verifies `getSentryCorrelation()` against a
REAL `Sentry.startSpan`, which is the actual mechanism a log's `trace_id`
relies on: while a span is active, `getSentryCorrelation()` returns that
span's own ids, and those are exactly the ids the SDK's serializer reads
from when it stamps a concurrent log.

---

## 7. What builds on this, and what is deliberately not here

This module (`src/lib/observability/{metrics,spans,structured-log,correlation}.ts`
plus the `instrumentation*.ts` hook wiring) is the vocabulary and the
enforcement layer. Two things are explicitly OUT of its scope, each owned by
a separate, concurrent effort against this same taxonomy:

- **Instrumenting actual call sites** — `src/app/golf/actions/golf.ts` and
  its siblings, using the ops in §3.1, `finishWorkflowSpan` for consistent
  outcome recording, and `record*()` from §2 for the matching metrics. This
  doc is the contract those call sites instrument against; it does not
  itself add a single `Sentry.startSpan` call to a server action.
- **The rest of `instrumentation-client.ts`** — profiling, feedback,
  third-party-error-filter, and replay integrations. Untouched here. That
  work should extend, not replace, `enforceMetricAttributeAllowlist`/
  `enforceLogAttributeAllowlist` if it needs additional client-side
  scrubbing — do not add a second, competing sanitizer.
