<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Sentry Phase A findings

Measured at commit `44f4ce183` (branch `main`). Read-only pass from
`/Users/ricknini/Downloads/helmv3`; written into the worktree per the audit's
read/write split. Every claim below carries a file:line anchor or is marked
UNKNOWN with what would resolve it — no guessed YES.

**Feature-awareness gap, stated up front per `AGENTS.md`'s routing rule:**
`npm run knowledge:map -- --files src/instrumentation.ts src/instrumentation-client.ts src/lib/observability/spans.ts src/lib/error-logging.ts src/lib/server-error-logger.ts`
returns `"impactedFeatures": []` for all five files, while
`memory/registry.yml:1377-1381` declares `integrations.sentry` owns
`sentry.*` and `src/instrumentation*.ts`, and `:1383-1388` declares a
SEPARATE `integrations.datadog` entry over the same `src/instrumentation*.ts`
glob. The router does not route the observability spine to either doc. This
is a real feature-awareness gap, not a finding about Sentry itself — noting
it because AGENTS.md requires saying so explicitly when a mapped file misses
its feature doc.

**Correction to a hypothesis raised mid-audit:** Datadog is NOT a dead
reference. `@datadog/browser-logs` and `@datadog/browser-rum` are real
dependencies (`package.json:132-133`), and `src/lib/datadog/index.ts`,
`src/components/providers/DatadogProvider.tsx`, and a top-level `datadog/`
directory all exist. `docs/OBSERVABILITY.md:25`'s claim that client errors
also reach "Datadog RUM" was not falsified by this pass — it just was not
independently re-verified, since Datadog itself is outside this Sentry-scoped
audit's brief. Flagging the correction because the audit almost reported this
as doc rot before checking.

---

## (a) Where raw PII or payloads can reach Sentry today

### The headline finding: the AI SDK integration is fully configured and currently inert

`src/instrumentation.ts:243-246` configures:

```ts
Sentry.vercelAIIntegration({
  recordInputs: true,
  recordOutputs: true,
}),
```

Per the installed SDK's own doc comment
(`node_modules/@sentry/node/build/types/integrations/tracing/vercelai/index.d.ts:20-33`,
verified in `SENTRY_SDK_API_VERIFICATION.md`): **`vercelAIIntegration`
instruments nothing for a given call unless that call itself sets
`experimental_telemetry.isEnabled: true`.** `recordInputs`/`recordOutputs`
are a second opt-in on top of that first one.

Every production AI SDK call site in this repo was located and checked for
`experimental_telemetry`:

| Call site | Function | `experimental_telemetry` set? |
|---|---|---|
| `src/app/api/coachhelm/v3/chat/stream/route.ts:312` | `streamText({...})` — CoachHelm chat | NO |
| `src/lib/golf/schedule-vision.ts:231` | `generateObject({...})` — schedule screenshot import | NO |
| `src/lib/golf/schedule-vision.ts:352` | `generateObject({...})` — verification pass | NO |
| `src/lib/admin/rca.ts:197` | `generateObject({...})` — root-cause analysis | NO |
| `src/lib/coachhelm/v3/llm/compose.ts:305` | `generateText({...})` — CoachHelm insight composition | NO |

`grep -rn "experimental_telemetry" src/ --include="*.ts"` returns exactly one
hit outside these files: `src/types/ai-shim.d.ts:25`, a TYPE DECLARATION, never
an actual call. **Net: today, zero AI SDK calls in this application emit any
Sentry span, trace, prompt, or output — not because the data is being
withheld by a PII guard, but because the integration's own required opt-in
was never added anywhere.** This is not "safe by design" — it's inert by
omission, and the surface area is one line away from activating at every
call site simultaneously, because `recordInputs`/`recordOutputs: true` is
already set globally.

Cross-checked `sendDefaultPii`: `grep -rn "sendDefaultPii" src/` returns
zero hits. So when this integration DOES activate at some future call site,
the reason prompt/output bodies get recorded will be exactly the two
explicit flags at `instrumentation.ts:244-245` — not a `sendDefaultPii`
fallback, and not a surprise.

### What would actually flow through, once activated

Confirmed by reading how each call site builds its prompt/message content:

- **Player names, unredacted, directly in the prompt text.** `src/lib/coachhelm/v3/llm/hero-narrative.ts:65`:
  `` `You are a college golf coach writing one short paragraph to ${input.player_first_name} on their dashboard.` `` —
  `player_first_name` is a required input field (`hero-narrative.ts:20`).
  Same pattern at `src/lib/coachhelm/v3/llm/round-review.ts:201`
  (`player_first_name`, declared `:63`).
- **Raw image bytes of a student-athlete's class schedule.** `src/lib/golf/schedule-vision.ts:229-240`:
  the `generateObject` call's `messages` array attaches
  `{ type: 'file', data: img.base64, mediaType: img.mediaType }` for every
  uploaded schedule screenshot (`ScheduleImageInput`, `:209-212`) — this is
  the "Schedule screenshot import" feature (this session's own memory:
  `project/golfhelm_schedule_screenshot_import`, gateway free tier). This is
  a materially stronger PII vector than text: a schedule screenshot can show
  a student's full name, university, course numbers/times, and section/CRN
  data, none of which passes through `redact-pii.ts`'s email-only regex even
  if it DID reach `beforeSend` (image bytes aren't text `maskEmails` can scan
  in the first place — `redact-pii.ts` operates on strings, `redact-pii.ts:48-51`).
- **Incident reports + up to 3 raw stack traces.** `src/lib/admin/rca.ts:186-197`
  builds the RCA prompt (`buildRcaContextText`) from `context.incidentReport`
  (the "Copy-for-Claude" report this repo already builds, per the file's own
  header, `:1-14`) plus `context.rawStacks.slice(0, 3)` (`:186-190` — 3 raw
  stack traces, capped at `MAX_CONTEXT_CHARS`, `:196-199`). This content
  ALREADY passed through `redactFreeTextForStorage` once (email-masking +
  URL-secret stripping) on its way into `error_logs`/`admin_events`
  (`server-error-logger.ts:668-672`), so it is not raw-raw — but stack
  traces can still carry row-level data Postgres echoed back (per
  `spans.ts:70-79`'s own documented concern about Postgres error text
  "echoing row values back at you") that email-regex redaction does not
  catch. `incident-report.ts:254`'s own comment notes `user_id`/`user_email`
  are "usually zero" in these reports — a genuine mitigating fact, not an
  assumption, worth recording precisely rather than either over- or
  under-stating the risk.

### Supabase query/mutation payloads — deliberately NOT a leak path

`src/lib/observability/supabase-tracing.ts:118` passes
`{ sendOperationData: false }` explicitly to `Sentry.instrumentSupabaseClient`
at every one of the five client factories the file's header enumerates. Per
that same file's header (`:25-51`, cross-checked against the installed
`SupabaseIntegrationOptions` type in the SDK verification doc), this single
flag withholds all four of: `db.query` filter values, `db.body` mutation
payloads, breadcrumb `query`/`body` data, and the `scope.setContext('supabase', ...)`
error-context payload. This is a correctly-engineered, already-audited
control — recorded here for completeness of the PII inventory, not as a gap.

### Auth email+IP pairing — mitigated, not open

`redact-pii.ts:14-22`'s own header names
`src/app/baseball/actions/auth.ts:320,471` as the specific call sites that
send `{email, ip}` together on a login/signup failure. `maskEmails`
(`redact-pii.ts:48-51`) reduces the email half to `n***@domain` before the
event leaves the process, applied in `beforeSend` on both runtimes
(`instrumentation.ts:212`, `instrumentation-client.ts:164`). Current state:
mitigated. Not re-verified whether the IP half is separately scrubbed
(Sentry's own `beforeSend` does not by default strip `event.user.ip_address`
or `request.env` IP fields unless explicitly told to — `sendDefaultPii` is
OFF here per the grep above, and Sentry does not auto-populate IP without
that flag, so the IP is likely present only where the call site put it
explicitly into `metadata`; not independently traced past what the header
comment states).

---

## (b) Duplicate-capture paths — does one failure become two Sentry issues?

Four concrete duplicate-capture bugs were found by tracing the actual call
graph, not by assumption. Two more mechanisms were checked and found to
correctly avoid duplication (recorded so they aren't "fixed" into a
regression later).

### CONFIRMED BUG 1 — process-level handlers double-capture every time

`src/lib/observability/register-process-error-handlers.ts:68-89`:

```ts
export async function handleUnhandledRejection(reason: unknown) {
  ...
  Sentry.captureException(error);                    // capture #1, line 77
  return logProcessErrorToBridge('process.unhandledRejection', error, ...);
}
```

`logProcessErrorToBridge` (`:49-65`) calls `logServerException(error, {
action, source: 'background_job', handled: false, ...metadata }, 'error')`
with **no `skipSentry: true`**. `logServerException` →
`captureServerTrace(..., forceException=true)` → since
`!enriched.skipSentry`, `captureSentryTrace` runs and calls
`Sentry.captureException(...)` again (`server-error-logger.ts:595`) —
**capture #2**. `handleUncaughtException` (`:86-89`) is the byte-identical
pattern. **Every Node process-level `unhandledRejection` or
`uncaughtException` currently produces exactly two Sentry issues, not one.**
This is not hypothetical noise — `docs/OBSERVABILITY.md:88-90` itself cites
"6 process-level rejections in Sentry" as the measured baseline this whole
mechanism was built to serve; that count (whatever it is today) is
double what it should be.

**One-line fix:** add `skipSentry: true` to the context object at
`register-process-error-handlers.ts:57`, in both `handleUnhandledRejection`
and `handleUncaughtException`. The Bridge DB write stays; the redundant
Sentry capture stops.

### CONFIRMED BUG 2 — `global-error.tsx` races its own dedup marker

`src/app/global-error.tsx:14-22`:

```tsx
useEffect(() => {
  console.error('Global error boundary caught:', error);   // line 15
  logError(error, { component: 'GlobalErrorBoundary', ... }, 'critical'); // line 16
}, [error]);
```

`captureConsoleIntegration({levels:['error']})`
(`instrumentation-client.ts:86`) captures the `console.error` on line 15
SYNCHRONOUSLY, at the moment it executes — before `logError` (line 16) has
run `markBridgeLogged(error)` (`error-logging.ts:343`, the first statement in
`logError`, by design "deliberately unconditional and FIRST"). The dedup
check that's supposed to catch this
(`isConsoleOriginEvent(event) && isAlreadyBridgeLogged(hint?.originalException)`,
`instrumentation-client.ts:117-119`) reads `isAlreadyBridgeLogged` as `false`
at the instant the console-origin event is captured, because the marker
hasn't been set yet. **Every hit of the app's own last-resort root error
boundary — precisely the "Critical Error" path a user sees when everything
else has already failed — currently mints two Sentry issues.**

Verified this is NOT the general pattern across the ~162 `error.tsx`
boundaries: `RouteErrorBoundary.tsx` (the shared component ~140+ of them
render) has no preceding explicit `console.error` before its own `logError`
calls (`grep -n "console.error\|logError(" src/components/errors/RouteErrorBoundary.tsx`
→ only the two `logError(...)` calls, no `console.error`). The bug is
specific to `global-error.tsx`'s own extra line.

**One-line fix:** delete `global-error.tsx:15`'s `console.error` (`logError`
already dev-logs via `console.group`, `error-logging.ts:381-389`), or move it
to AFTER `logError` returns.

### CONFIRMED BUG 3 — Lifting Lab reproduces the exact bug already fixed for Baseball/Golf

`src/instrumentation.ts:37-70` (`sharedIgnoreErrors`) exists specifically so
that a wrapper's typed control-flow error class, logged with `skipSentry:
true` and then deliberately re-thrown so callers can branch, does not ALSO
become a Sentry issue when it escapes to `onRequestError`
(`Sentry.captureRequestError` runs unconditionally there, see Bug 4 below).
The list currently names: `BaseballUnauthorizedError`,
`BaseballNoActiveTeamError`, `BaseballCapabilityError`,
`BaseballDisabledSourceError`, `BaseballDemoReadOnlyError`,
`GolfDemoReadOnlyError`, `PlayerAccessError` (`:60-69`).

`src/lib/lifting/with-lifting-action.ts:195-215` implements the byte-for-byte
same pattern for Lifting Lab — three typed classes
(`LiftingUnauthorizedError`, `LiftingNoOrgError`, `LiftingForbiddenError`,
declared `:44-66`), logged via `logServerEvent(error.message, {..., skipSentry:
true, ...}, 'info')` (`:202-213`), then `throw error;` (`:214`) to let the
caller branch — but **none of the three Lifting class names appear anywhere
in `sharedIgnoreErrors`.** When one of these escapes to `onRequestError`
(and by design, it always does — that's the point of re-throwing), Next's
`Sentry.captureRequestError(error, request, errorContext)`
(`instrumentation.ts:410`) runs unconditionally, and the SDK-level
`ignoreErrors` filter (`instrumentation.ts:264`) does not suppress it because
the error name isn't on the list. **Every "not signed in" / "no Lifting org
resolved" / "no edit access" throw in Lifting Lab currently produces a live,
alertable Sentry issue — the exact noise pattern the `sharedIgnoreErrors`
comment (`:51-59`) documents was already found and fixed for Baseball,
reproduced in the one wrapper that was never updated to match.**

**One-line fix:** add `'LiftingUnauthorizedError', 'LiftingNoOrgError',
'LiftingForbiddenError'` to `sharedIgnoreErrors` at `instrumentation.ts:60-69`.

### CONFIRMED BUG 4 (structural, not a call-site bug) — `onRequestError`'s Sentry capture is unconditional; only the Bridge write is gated

`instrumentation.ts:405-410`:

```ts
export async function onRequestError(error, request, errorContext) {
  Sentry.captureRequestError(error, request, errorContext);   // ALWAYS runs
  try {
    ...
    if (shouldSkipBridgeWrite(error, isAlreadyBridgeLogged(error))) return; // only gates the DB write below
```

`shouldSkipBridgeWrite` (`:350-361`) checks `isNextControlFlowDigest`,
`alreadyLogged` (the `__helmBridgeLogged` marker), and
`bridgeSkipErrorNames` (derived from the Baseball/`PlayerAccessError` subset
of `sharedIgnoreErrors`, `:338-343`) — but this only ever decides whether the
**second** `logServerException` call (`:427-451`) runs, i.e. whether a
**second Bridge DB write** happens. It has no effect on the
`Sentry.captureRequestError` call four lines above it, which already ran
unconditionally regardless of whether the original throw site had already
called `Sentry.captureException` itself. **This is the shared root cause
underneath Bugs 1 and 3 above** — any call site that logs to Sentry and then
lets the error escape the boundary is structurally exposed to a second
Sentry capture unless the error's NAME (not just its already-logged marker)
is separately enrolled in the SDK-level `ignoreErrors` list. The
`__helmBridgeLogged` marker prevents a second DB WRITE; it does nothing for
Sentry, because `Sentry.captureRequestError` at `:410` never checks it.

### Checked and confirmed CORRECT (no bug) — recorded so it isn't "fixed" into a regression

- **`server-error-logger.ts:427-451`'s own second-capture guard.** When
  `onRequestError` DOES proceed to call `logServerException` (i.e. the error
  was NOT already Bridge-logged), it explicitly passes `skipSentry: true`
  (`:442`) with a comment explaining exactly why: `Sentry.captureRequestError`
  four lines up already has it, and `logServerException`'s own internal
  capture would otherwise be a second, differently-fingerprinted issue for
  the same error. This is the same fix Bugs 1 and 3 above are missing,
  applied correctly at this one call site.
- **`instrumentation-client.ts:117-119`'s console-origin dedup**, when the
  ordering is right (i.e. everywhere except `global-error.tsx`'s Bug 2 above)
  — verified this suppresses the `captureConsoleIntegration` echo of
  React's own automatic `onCaughtError` console.error, which is what the
  mechanism was built for (`error-logging.ts:329-342`'s own comment: "~140
  route error.tsx files produced TWO Sentry issues per crash").

---

## (c) Every `sharedIgnoreErrors` entry, why it exists, and where the equivalent health signal lives

All from `src/instrumentation.ts:37-70`, applied identically on both the Node
(`:264`) and Edge (`:321`) `Sentry.init` calls.

| Entry | Why it's ignored | Equivalent health signal |
|---|---|---|
| `'NEXT_NOT_FOUND'`, `'NEXT_REDIRECT'` | Next's own control-flow signals (`redirect()`/`notFound()`), not incidents. | None needed — these are not failures. |
| `'Invalid Refresh Token: Refresh Token Not Found'`, `'Refresh Token Not Found'`, `/AuthApiError: Invalid Refresh Token/`, `/Refresh Token Not Found/` | Routine session expiry (logged-out users, long-idle tabs, just-rotated tokens); middleware/`src/proxy.ts` already swallows these. | `src/proxy.ts`'s own handling (not independently re-verified this pass whether it writes any positive signal for a NORMAL expiry, vs. only for a genuine failure — likely correctly writes nothing, since routine expiry isn't an incident). |
| `'BaseballUnauthorizedError'`, `'BaseballNoActiveTeamError'`, `'BaseballCapabilityError'`, `'BaseballDisabledSourceError'`, `'BaseballDemoReadOnlyError'` | `withBaseballAction`'s (M2) fixed allowlist of typed control-flow classes — logged as handled `admin_events`/error_logs rows with `skipSentry`, then re-thrown for the caller to branch on. | `admin_events`/`error_logs` via `logServerException`, at the ORIGINAL M2 catch site (M2's own Bridge write, not this ignore list — this list only stops the SECOND, redundant Sentry capture at the escape boundary). |
| `'GolfDemoReadOnlyError'` | Shared demo golf account under concurrent load — "dozens" of expected rejections per demo night, working as designed. | Same shape: the original throw site's own Bridge write (not independently located in this pass — likely `golf.ts`'s demo-gate check). |
| `'PlayerAccessError'` | Golf's player-scoping guard — a player trying to view/act on data outside their own scope; expected rejection, not an incident. | Same shape as above; not independently traced to its throw site this pass. |
| **MISSING: `LiftingUnauthorizedError`, `LiftingNoOrgError`, `LiftingForbiddenError`** | Should be here by the exact same reasoning as the Baseball five — see Bug 3 in §(b). Currently absent. | `admin_events`/`error_logs` via `logServerEvent` at `with-lifting-action.ts:202-213` — that half already works; only the Sentry-side suppression is missing. |

---

## (d) Scheduled jobs

**Correction to an earlier pass of this document, verified directly against
`vercel.json` and `find src/app/api/cron -iname route.ts` (both re-run for
this revision, not hand-counted):** 19 Vercel crons in `vercel.json`'s
`crons` array, and **five**, not two, `route.ts` files under
`src/app/api/cron/**` with no matching `vercel.json` entry:

| Orphan route | Status |
|---|---|
| `process-sequences` | Intentionally unregistered — its own file header states "Schedule: NOT registered in vercel.json by design — automated sequence sends are kept OFF." |
| `v3/genome-backfill` | Intentionally one-shot — header: "one-shot backfill... used once after the schema lands to seed the vector." |
| `v3/standing-backfill` | Intentionally one-shot — header: "W12 — standing backfill (one-shot, chunked)... iterates over EVERY team." |
| `v3/ingest-sync` | **Genuine gap, not documented as intentional.** No "intentionally unwired" note in its own header. Zero `recordJobRun` references. See the CRITICAL finding below — this route's own internal failure handling makes the missing schedule a compounding problem, not just a scheduling oversight. |
| `v3/weekly-coach-email` | **Genuine gap, not documented as intentional.** Header: "Designed to fire Sundays... builds a WeeklyRecap... sends via Resend," with no note that it's deliberately unregistered. Zero `recordJobRun` references. |

The three one-shot/intentional routes are correctly unregistered. The two
genuine gaps (`v3/ingest-sync`, `v3/weekly-coach-email`) mean: if either was
ever meant to run automatically, nothing currently triggers it — and per the
handled-error audit in §(e) below, both also silently swallow per-item
failures internally, so even a manual/Inngest-triggered run of either would
report success regardless of how many individual failures occurred inside it.

**Sentry Cron Monitor check-in: NO for all 19+2, no exceptions.**
`automaticVercelMonitors: true` (`next.config.mjs:454`) is configured but
inert — see §(h). `grep -rn "captureCheckIn\|withMonitor" src/` returns zero
matches anywhere in the repository. No cron route manually calls either API.

**What IS covered, and the precise limit of that coverage:** all cron routes
except the two orphans above call `recordJobRun(jobType, fn)`
(`src/lib/admin/job-log.ts:24-43`), which writes a `background_job_logs` row
(schema: `id, job_type, job_id, status, duration_ms, error_message,
retry_count, metadata, started_at, completed_at` —
`supabase/migrations/20260527000000_prod_public_baseline.sql:7314-7325`) AND,
on a failed run (thrown, or a resolved Response with status ≥400,
`job-log.ts:32-41`), calls `logServerEvent('Cron failed: ${jobType}', {
action: 'cron.${jobType}', source: 'cron', errorDetails: message }, 'error')`
— severity `'error'` routes through `captureSentryTrace`'s exception path
(`server-error-logger.ts:589-596`, since `'error'` is neither `'info'` nor
`'warning'`), so **a cron run that executes and fails DOES currently produce
a Sentry issue**, via the generic `logServerEvent` mechanism, not a
dedicated Cron Monitor. **What this does NOT cover: a job that never runs at
all** — Vercel's scheduler silently failing to invoke it, the deployment
being paused, or the function timing out/crashing before `recordJobRun` ever
gets to run its own try/catch. That specific "silence, not failure" case is
exactly what Sentry Cron Monitors exist to catch (a missed check-in alert)
and nothing in this codebase currently replaces it, `ingest-gmail-replies`'s
own hand-built `alreadyAlertedToday`/self-throttle mechanism
(`ingest-gmail-replies/route.ts:822-873`) being the one place that pattern
was noticed and partially worked around, for degraded-but-running states
only — not for total silence.

| Job | Schedule | job_type / `recordJobRun` | Sentry check-in | What breaks silently if it stops entirely |
|---|---|---|---|---|
| `coachhelm-validation` | `15 * * * *` (hourly) | YES | NO | UNKNOWN — not individually read; name suggests CoachHelm insight validation. |
| `coachhelm-calibration` | `40 3 * * *` (daily) | YES | NO | UNKNOWN — not individually read; name suggests confidence-calibration model refresh. |
| `coachhelm-safety-net` | `*/30 * * * *` (every 30 min) | YES | NO | UNKNOWN — not individually read; frequency suggests a fallback/catch-up sweep. |
| `coachhelm-insight-lifecycle` | `0 4 * * *` (daily) | YES | NO | UNKNOWN — not individually read; likely insight expiry/archival. |
| `coachhelm-roster-sweep` | `0 2 * * *` (daily) | YES | NO | Confirmed reads roster rows and reports per-player outcomes (`{playerId, ok, err}`, `coachhelm-roster-sweep/route.ts:138`) — a silent stop means roster-driven CoachHelm state drifts unnoticed. |
| `event-reminders` | `0 * * * *` (hourly) | YES | NO | Confirmed: calendar event RSVP reminders, including push notifications (`event-reminders/route.ts` imports `sendPushNotification`) — a silent stop means players/coaches stop getting event reminders with no signal anywhere. |
| `task-reminders` | `0 * * * *` (hourly) | YES | NO | Confirmed: task due-date reminders, including push (`task-reminders.ts:756`); per §(e) below, per-reminder send failures inside the fan-out loop (`task-reminders.ts:669`) are aggregated into a response body nobody reads rather than reported per-item. |
| `v3/standing-refresh` | `20 2 * * *` (daily) | YES | NO | UNKNOWN — not individually read; likely CoachHelm v3 standing/ranking recompute. |
| `v3/genome-nightly` | `40 2 * * *` (daily) | YES | NO | UNKNOWN — not individually read; CoachHelm "genome" per repo naming conventions (v3 causal/insight engine). |
| `v3/causality-attribute` | `0 3 * * *` (daily) | YES | NO | UNKNOWN — not individually read. |
| `v3/goal-suggestions-write` | `20 3 * * *` (daily) | YES | NO | UNKNOWN — not individually read. |
| `v3/goal-suggestions-evaluate` | `20 4 * * *` (daily) | YES | NO | UNKNOWN — not individually read. |
| `integrity-check` | `0 7 * * *` (daily) | YES | NO | UNKNOWN — not individually read; name suggests data-integrity verification, which is itself the kind of job whose own silent failure is highest-consequence to miss (a check that stopped checking looks identical to "nothing wrong"). |
| `log-retention` | `30 7 * * *` (daily) | YES (6 refs — heaviest instrumentation of any cron route) | NO | Confirmed via §(e): its own `autoResolveFixedIncidents()` catch (`log-retention/route.ts:168`) is `console.error`-only and returns a plain object rather than a `Response`, which defeats `recordJobRun`'s own status-code failure detection — the one route that instruments itself the most heavily also has a hole in that instrumentation. |
| `admin-digest` | `0 11 * * *` (daily) | YES | NO | Confirmed: builds and sends the daily "Cup of Helm" ops email (`admin-digest/route.ts:17-`) — a silent stop means the owner's one daily digest of shipped PRs, Sentry issues, and deploy freshness simply never arrives, with nothing else surfacing that absence (the digest IS the alerting mechanism for several OTHER signals, per its imports of `fetchSentryIssues`/`fetchTriageQueue`/`fetchDeployFreshness` — so this job stopping silently degrades multiple downstream visibility surfaces at once, not just itself). |
| `refresh-engagement` | `10 */4 * * *` (every 4h) | YES | NO | UNKNOWN — not individually read. |
| `ingest-gmail-replies` | `*/30 * * * *` (every 30 min) | YES, `JOB_TYPE` constant + the most defensively-engineered route read this pass (self-throttled daily alert on degraded auth state, `:822-873`) | NO | Best-covered of the 19 for the "degraded but still running" case; the pure "never invoked at all" case is still uncovered like every other row. |
| `helm-debug-prune` | `30 4 * * *` (daily) | YES | NO | UNKNOWN — not individually read; name suggests `helm_debug`/Flight Recorder retention cleanup, meaning a silent stop would eventually degrade the Flight Recorder correlation described in §(g) via unbounded table growth, not an immediate user-facing break. |
| `reliability-triage` | `0 */3 * * *` (every 3h) | YES (6 refs) — also writes `background_job_logs` directly from `src/lib/reliability/collect.ts:127`, not only via `recordJobRun` | NO | Feeds the admin reliability dashboard directly (`src/lib/admin/data/reliability.ts:75`) — a silent stop would make that dashboard stale without saying so. |
| `process-sequences` | **NOT in `vercel.json`, by design** (see table above) | NO recordJobRun refs | NO | N/A — intentionally off. |
| `v3/genome-backfill` | **NOT in `vercel.json`, by design** (one-shot backfill) | NO recordJobRun refs | NO | N/A — one-shot, not a recurring job. |
| `v3/standing-backfill` | **NOT in `vercel.json`, by design** (one-shot backfill) | NO recordJobRun refs | NO | N/A — one-shot, not a recurring job. |
| `v3/ingest-sync` | **NOT in `vercel.json` — genuine gap, no "intentional" note.** | NO recordJobRun refs; always resolves `NextResponse.json(summary)` with implicit 200 regardless of per-connection failures | NO | **CRITICAL, verified in §(e).** `src/lib/coachhelm/v3/ingest/providers/arccos.ts:94,125,179` soft-swallows Arccos token-decrypt/refresh/fetch failures into a `{errors_count, error_detail}` return value rather than throwing; the route tallies these into a summary counter and returns 200 regardless. A player's Arccos connection can token-fail and silently stop feeding shot data into CoachHelm indefinitely — the only trace is an unread JSON counter and a `golf_ingest_sync_log` row, and because this route also has no cron entry, it is unclear this pathway runs on any schedule at all. |
| `v3/weekly-coach-email` | **NOT in `vercel.json` — genuine gap, no "intentional" note.** | NO recordJobRun refs; per-recipient `result.delivered===false` failures tallied into a counter, route always resolves 200 | NO | Weekly coach recap emails (`src/lib/coachhelm/v3/foundation/email.ts:103`, via Resend) can fail with zero telemetry beyond an unread summary counter — same shape as `v3/ingest-sync` above, and same missing-schedule question. |

**`background_job_logs` schema and `job_type` values** (schema:
`supabase/migrations/20260527000000_prod_public_baseline.sql:7314`;
RLS admin-read + service-write, `:17603-17610`). Distinct `job_type`
literals in code: the 19 cron-registry entries above
(`src/lib/admin/cron-registry.ts:12-41`, one per `vercel.json` path) plus
`selfheal-triage` and `selfheal-repair` (`src/lib/admin/selfheal-registry.ts:88,98`
— see the self-heal finding below) plus a reliability-collector job type
referenced in `src/lib/reliability/types.ts:177` (exact literal not isolated
in this pass — confirm directly in `src/lib/reliability/collect.ts` if a
Phase B change needs it precisely). Primary write site:
`src/lib/admin/job-log.ts:199`; also written directly by
`src/lib/reliability/collect.ts:127`; read by
`src/app/api/cron/log-retention/route.ts:136` (90-day purge),
`src/app/api/cron/admin-digest/route.ts:102`, and several
`src/lib/admin/data/*.ts` dashboard loaders.

### The self-heal "Repair job" — a real launchd agent, currently non-functional, confirmed live today

This is the "Repair job" the audit brief's reading list points at, and it is
NOT a repo-tracked `.plist` (which is why a `find . -iname "*.plist"` sweep
finds nothing — the file lives on the owner's Mac, outside this checkout).
It is a documented three-stage loop (`docs/ai-system/selfheal/README.md`):
**CAPTURE** (the app writes `admin_events`) → **DIAGNOSE**
(`selfheal-triage`, an Anthropic-hosted cloud routine, daily 09:17 UTC,
contract in `docs/ai-system/selfheal/triage-contract.md`) → **REPAIR**
(`selfheal-repair`, a `launchd` agent on the owner's Mac,
`~/Library/LaunchAgents/com.helm.bridge-rca-repair.plist`, daily 06:40
local, contract in `docs/ai-system/selfheal/repair-contract.md`, runner
`scripts/run-selfheal-repair.mjs`) → **CLOSE** (the `log-retention` Vercel
cron, via `src/lib/admin/auto-resolve.ts`).

**Current state, verified directly against two independent sources dated
today (2026-09-02):**

- `docs/ui-audits/MASTER_BUG_REPORT_2026-09-02.md:26`: *"Self-heal repair
  automation (`com.helm.bridge-rca-repair` LaunchAgent) has **never run
  once** — bypasses its own wrapper, times out via SIGALRM, no fallback
  heartbeat. Logs empty since Aug 27; `runs = 0`. Not fixed."*
- `src/lib/admin/selfheal-registry.ts:18-24`'s own header, independently:
  *"On 2026-08-27 the repair half's launchd plist had been written and
  installed for hours and never loaded — `launchctl list` returned nothing
  for it — while every artifact around it (the plist on disk, the routine
  definition, the contract doc) said the loop was running."*

Both the DIAGNOSE and REPAIR stages are, by that same file's own framing,
*"outside this deployment entirely — nothing in the app invokes them,
nothing in CI tests them"* — which is precisely why `selfheal-registry.ts`
exists, to report each stage's own heartbeat into `background_job_logs`
under its own `job_type` so a stopped stage is at least visible on
`src/app/admin/self-heal/page.tsx`, the same `classifyCronStatus` shape
`cron-registry.ts` uses for Vercel crons. No Sentry Cron Monitor covers
either stage (consistent with the zero-monitor finding throughout this
audit) — the ONLY visibility into "REPAIR has never run" is a human opening
the `/admin/self-heal` page or the `background_job_logs` table directly.

### Push notifications

Primary send path: `src/lib/notifications/push.ts`'s `sendPushNotification`
(callers: `golf-message-fanout.ts`, `dispatch.ts`, `insights.ts`,
`announcements.ts`, the `event-reminders` cron, `player-notify.ts`). It
reads `device_tokens`, then per token calls
`supabase.functions.invoke('send-apns-push'|'send-fcm-push', ...)`
(`push.ts:278`). Failure handling is granular but incomplete: a token-read
failure and a total-rejection outcome both call `logServerError`
(`push.ts:238-241,412-415`); a dead-token deactivation calls
`logServerEvent` at info (`push.ts:379-388`) — but the per-device `invoke`
failure branch (`push.ts:288-397`), the per-token `try/catch`
(`push.ts:399-401`), and the outermost function-level `catch`
(`push.ts:420-426`) are all `console.error`-only, reaching Sentry solely
via the server `captureConsoleIntegration` safety net, with no `admin_events`
row and none of `logServerError`'s tags.

**Confirmed dead, per the file's own comment (`push.ts:266-276`, verified
2026-08-26 per that comment): the `send-fcm-push` Edge Function that Android
push tokens route through is not deployed in production.** Every Android
push attempt 404s indefinitely and the dead token is never deactivated,
since deactivation logic assumes the function exists to tell it the token is
invalid. Tracked as `RISK-041` in `docs/qa/helm-bug-risk-register.md` per
that same comment — an existing, acknowledged gap, not new to this audit,
but directly relevant to this table since it means the push channel's
Android half is currently non-functional regardless of anything Sentry-side.

Inngest functions (separate scheduling system, not Vercel cron; all three
registered in `functions.ts:230` and wired via `src/app/api/inngest/route.ts`):

| Function | id | Trigger | `onFailure` |
|---|---|---|---|
| `weeklyHealthPing` | `weekly-health-ping` | cron `0 14 * * 1` | `functions.ts:62` calls `logServerException(..., 'error')` |
| `healthPing` | `inngest-health-probe` | event `helm/health.ping` | `functions.ts:110`, same pattern |
| `onCoachHelmRoundSubmitted` | `coachhelm-round-submitted` | event `coachhelm/round.submitted` | `functions.ts:182`, same pattern |

All three route their own failure through the Bridge; none calls
`Sentry.captureCheckIn`/`withMonitor` (`grep -rn "captureCheckIn\|withMonitor"
src/lib/inngest/ src/app/api/inngest/` — zero hits), so per-run failure IS
reported but a run that never HAPPENS at all is not — the same asymmetry as
the Vercel cron rows above, and Inngest has no equivalent auto-instrumentation
option in the installed SDK (no `inngestIntegration` export exists in
`@sentry/nextjs` 10.71.0, confirmed in the SDK verification doc). This
session's own memory (`project/helmv3_inngest_credentials_dead`) already
establishes both Inngest API keys are currently REJECTED and rounds fall
back — meaning the practical question for these three functions today may be
"do they run at all," which `instrumentation.ts:277-294`'s
`reportInngestCredentialFault('startup')` DOES specifically detect and
Bridge-report (real code, confirmed, not speculative) — so the
credential-level failure mode is covered even though a per-run "silently
never invoked" gap (distinct from the credential-rejection case) would not
be.

launchd: see the dedicated "self-heal Repair job" subsection below the job
table — it is a real, currently-non-functional `launchd` agent on the
owner's Mac (not repo-tracked, so `find . -iname "*.plist"` correctly finds
nothing in this checkout), confirmed via two independent sources both dated
2026-09-02.

---

## (e) Handled-error audit — `src/app/golf/actions`, `src/lib/golf`, `src/lib/coachhelm`, `src/lib/admin`, `src/app/api/cron`, push code

**Methodology, stated so the counts below don't rot into unverifiable prose
(shipping.md §1's rule).** This section merges two independent, exhaustive
(not sampled) passes covering all six directories the brief named, each
individually opening and classifying every `catch`/`.catch(` in scope — not
a regex-window heuristic. Classification rubric, applied identically by
both passes: **EXPECTED CONTROL FLOW** (a deliberate, anticipated branch —
a uniqueness violation, a demo-mode guard, a "no rows" result) /
**RECOVERABLE WARNING** (a real failure with a retry/fallback path AND
already visible somewhere — `logServerEvent`/`logServerError` at warning, an
explicit `Sentry.captureMessage`, or at minimum a bare `console.error`,
which server-side reaches Sentry via `captureConsoleIntegration` even
without a Bridge row) / **ACTIONABLE ERROR** (a real, unrecovered failure
reaching neither a Bridge pathway nor even a bare `console.error` — silently
swallowed) / **CRITICAL ERROR** (same gap as ACTIONABLE, but the failure can
corrupt data, drop a write the user believes succeeded, mis-authorize, or
silently disable a scheduled job).

| Scope | Catch blocks reviewed | Bare (no Bridge/Sentry signal) | Note |
|---|---|---|---|
| `src/app/golf/actions/**` + `src/lib/golf/**` (excl. `with-golf-action.ts`) | 462 (86 files) | 67, after excluding 2 comment false-positives and resolving 7 via a called helper (`formatSafeErrorResponse`/`observePlayerPatternsFailure`) that itself logs | See ranked list below. |
| `src/lib/coachhelm/v2/**` | 23 (all files) | 0 | Best-instrumented directory in scope — every catch calls `logServerError`/`logServerEvent`. |
| `src/lib/coachhelm/v3/**` | 38 (all files) | 9 | 5 in `chat/agent-tools.ts`, 3 CRITICAL in `ingest/providers/arccos.ts`, 1 partial in `foundation/email.ts` (caller compensates, route doesn't). See ranked list. |
| `src/lib/admin/**` | 39 (all files) | 0 hard, but a structural pattern gap (below) | Dominant convention is deliberate fail-soft (`degraded[]` push, never fake-green) — correct, but ~19 of those sites have zero active alerting on top of the passive degraded-banner signal. |
| `src/app/api/cron/**` | 31 (all routes) | 3 | `log-retention/route.ts:168`, plus the `v3/ingest-sync` and `v3/weekly-coach-email` route-level gaps already detailed in §(d) (both always resolve 200 regardless of per-item failure counts tallied internally). |
| Push notification code | ~16 files matching `apns\|web-push\|sendpush\|webpush\|vapid` | see §(d)'s Push Notifications subsection | `push.ts`'s per-device/per-token/outermost catches are `console.error`-only (RECOVERABLE via the console safety net, no Bridge row); `push-registration.ts` (client) is console-only throughout, consistent with client auto-capture. |

**Systemic finding, cutting across most of the golf-scope "covered" catches:**
`formatSafeErrorResponse` (`src/lib/validation/server-action-validator.ts:139-174`)
is the funnel for the majority of `golf.ts`'s outer catches and ~72 call
sites repo-wide (per that function's own comment count, `:161`). It DOES
call `logServerException`, so these are not silent — but every call site
reports the same generic `action: 'server_action.formatSafeErrorResponse'`
and `featureArea: 'server_action_unknown_error'`. Sentry's fingerprint still
differentiates by underlying message, so issues don't literally collapse —
but the `action`/`feature`/`sport` facets used for per-feature Sentry/Bridge
triage are destroyed for every caller: there is no way to filter "show me
every `createGolfEvent` failure" without opening each stack trace. **Fix:**
thread the calling action name through — `formatSafeErrorResponse(error,
'golf.createGolfEvent')`.

### Ranked, worst-first: the highest-value ACTIONABLE/CRITICAL sites found

1. **`src/app/golf/actions/golf.ts:9057,9077` — CRITICAL, silent data loss the user believes succeeded.** An optional-detail upsert (e.g. `approach_miss_details`) in both `createShot` and `updateShot` catches UNCONDITIONALLY on the theory the table "may not exist" — nothing verifies that; a real RLS denial or constraint violation is swallowed identically, and the outer function still returns `success: true`. Fix: check the actual Postgres error code (`42P01`) before swallowing; log everything else via `logServerError`.
2. **`golf.ts:3800` — `deleteGolfEventImpl` outer catch, no error binding, fully bare.** DELETE failures are entirely invisible. Fix: `catch (error) { await logServerException(error, { action: 'golf.deleteGolfEvent' }); return {...}; }`.
3. **`golf.ts:3484` — `updateGolfEventImpl` non-Zod branch, same shape.**
4. **`golf.ts:4754` — `updatePlayerStatusImpl` unexpected-error branch, same shape.**
5. **`golf.ts:3054,3436,3474` — event invitation/notification sends silently swallowed** on create/update/delete ("don't fail the whole operation" — correct product behavior, but a systemic delivery outage would be invisible). Fix: `logServerEvent(..., 'warning')` per swallow.
6. **`golf.ts:5600,5640` — notification-read WRITEs (mark-read/mark-all-read) silently fail.**
7. **CRITICAL — `src/lib/coachhelm/v3/ingest/providers/arccos.ts:94,125,179` + `src/app/api/cron/v3/ingest-sync/route.ts`** (cross-referenced from §(d)): Arccos token decrypt/refresh/fetch failures return a soft `{errors_count, error_detail}` shape instead of throwing; the route always resolves 200. A player's shot-data ingest can silently stop forever.
8. **`schedule-vision.ts:423` — LLM cost/budget-accounting write silently fails** on schedule import — a cost-governance blind spot given this repo already treats LLM budget accuracy as high-value telemetry (`docs/OBSERVABILITY_AUTHORITY.md`'s `v3.llm.budget.platform_default` example).
9. **`schedule-vision.ts:375` — AI vision day-verification pass failure invisible**, silently returns the unverified extraction.
10. **`coachhelm-data.ts:493` — CoachHelm dashboard silently serves stale/fallback scores** if the canonical score computation throws.
11. **`src/lib/coachhelm/v3/chat/agent-tools.ts:163,240,269,549,573` — CoachHelm's AI chat tool-calling layer has no Sentry/Bridge visibility on failure** (confirmed exhaustively, not just a window read: five catches across the action/practice-plan builders and context-read tools, none logging). A systemic break (schema drift, bad DB state) is only visible as repeated user-facing "could not build the plan" messages. Fix: `logServerError` (warning severity — the user already gets a graceful message) in each.
12. **`src/app/api/cron/log-retention/route.ts:168`** — the self-heal auto-resolve job's own catch is `console.error`-only AND returns a non-`Response` object, which defeats `recordJobRun`'s own status-code failure detection — the most heavily-instrumented cron route (6 `recordJobRun` refs) has a hole in exactly the mechanism it otherwise relies on.
13. **`golf.ts:7805,7919,8220`** (qualifier reads) and **`golf.ts:5298,5456,5517,5563,5683,5741,5772`** (schedule-conflict/availability/notifications/RSVP reads) — eleven read-path catches silently fail with no signal.
14. **`v3/goals.ts:634,666,774`, `v3/intent.ts:151`, `round-type.ts:532`** — writes/actions silently fail, no signal.
15. **`task-reminders.ts:669`, `task-templates.ts:734`, `v3/goals.ts:774`** — per-item failures inside fan-out loops are aggregated into a response body nobody reads, with no per-item Sentry/Bridge signal.
16. **`src/lib/admin/data/player-detail.ts` (5 sites), `team-detail.ts` (7), `ben-leah-issues.ts:165`, `github-pr-timeline.ts:279`, `rca.ts:210`, `change-timeline.ts:578`** — the Bridge's OWN internal admin data-fetch layer has zero active alerting on any section failure; visibility is scoped entirely to "someone opens that exact admin page and reads the degraded banner." A section failing 100% of the time would never alert anyone. Lower urgency (admin-only, not user-facing) but worth a shared `console.warn`/breadcrumb at the point each `degraded.push(...)` fires, given this layer partly feeds the Bridge's own health picture.
17. **Systemic — `formatSafeErrorResponse`, described above** — thread the action name through its ~72 call sites.
18. **`golf.ts:1235` — Flight Recorder creation failure silently degrades to a no-op tracer repo-wide**, no signal on total flight-recorder outage.
19. **`insight-delivery.ts:523` — transient-auth-retry path logs via `console.debug`**, which `consoleLoggingIntegration({levels:['log','warn','error']})` does not forward — looks logged, is invisible in production Sentry.
20. **`round-reviews.ts:536` — AI-generated round-review failures recorded as a DB status column but never reach an operator surface.**

Lower-severity items not itemized individually (recorded so they aren't
independently "discovered" again): `demo-access.ts:355`'s fully empty catch
with no explanatory comment; `foundation/email.ts:103`'s soft-return that IS
compensated by its one caller (`task-reminders.ts:1034,1043` wraps it in
`logServerError`) but is silent at its own layer — correct end-to-end
today, fragile if a second caller is ever added without the same wrap.

### What both passes explicitly did NOT find

Neither pass found any catch in `src/lib/coachhelm/v2/**` lacking a Bridge
signal (0 of 23) — this is the best-instrumented directory in the audited
set. Neither pass found evidence that `src/lib/admin/sentry-api.ts` or
`vercel-api.ts`'s fail-soft catches are anything other than correctly
designed per the existing `docs/operations/SENTRY_ADMIN_READ_API.md`
contract (never-throw, resolve to a typed `unconfigured`/`error` state).

---

## (f) Sampling / cost, per runtime, as configured today

| Runtime | Traces | Replay | Profiles | Logs |
|---|---|---|---|---|
| **Node (server)** | `tracesSampler` (`instrumentation.ts:126-139`) — NOT a flat rate: parent-sampled decisions are always respected (`:131-133`); otherwise `db.*`-op spans sample at **1.0** (`:136`), everything else at **0.2 prod / 0.1 dev** (`:127`). Deliberately asymmetric — the file's own comment explains DB spans are "comparatively rare per request and carry the highest diagnostic value" so keeping them at 1.0 while discarding 4/5 of page-load-class spans is "close to free". | N/A — Replay is browser-only. | `profileSessionSampleRate: isDev?0:0.3` (`:260`), `profileLifecycle:'trace'` (`:261`) — profiles are attached to 30% of sessions containing a sampled trace, in production only; `nodeProfilingIntegration()` itself is conditionally loaded (`try/require`, `:220-226`) and skipped entirely if the native module is unavailable, meaning profiling coverage additionally depends on runtime environment, not just the sample rate. | `enableLogs: true` (`:256`) — uncapped/unsampled at the SDK-option level (no `logsSampleRate` or equivalent set); actual volume is bounded only by how much `console.*` traffic + (currently zero) `Sentry.logger.*` calls exist, forwarded via `consoleLoggingIntegration({levels:['log','warn','error']})` (`:250`). |
| **Edge (proxy/middleware)** | Same `tracesSampler` function reused (`instrumentation.ts:319`), so same DB-span-1.0 / page-0.2-or-0.1 split applies where Edge code produces DB-shaped spans (uncommon, since most DB access is server-only). | N/A. | **NO profiling on Edge** — `nodeProfilingIntegration` import is gated `NEXT_RUNTIME === 'nodejs'` (`:218`), never reached on the Edge init block (`:307-328`). | `enableLogs: true` (`:318`), same `consoleLoggingIntegration`/`captureConsoleIntegration` pair (`:315-316`). |
| **Browser (client)** | Flat `tracesSampleRate: isDev?0.1:0.2` (`instrumentation-client.ts:63`) — NOT a custom sampler like the server; every trace class (page load, navigation, interaction) gets the same 20%/10% flat rate. Per §29 of the coverage matrix: **80% of production browser traces are simply never sampled**, a real and apparently deliberate cost tradeoff, not a bug — but worth stating as a number in this table (which is the right place for a count, not in prose elsewhere) since it directly bounds how often "why was this slow" is individually diagnosable versus only visible in the aggregate. | `replaysOnErrorSampleRate: 1.0` (100% of ERROR sessions) + `replaysSessionSampleRate: isDev?0:0.1` (10% of ALL sessions, prod only) (`:69-70`) — `maskAllText: true, blockAllMedia: false` (`:75-76`), gated off entirely in dev (`!isDev` on the integration itself, `:74`). | **NO profiling configured on the client** — `browserProfilingIntegration` exists in the installed SDK (confirmed in the verification doc) but is not added to `instrumentation-client.ts`'s `integrations` array (`:72-93`). | `enableLogs: true` (`:66`), same console-forwarding pair as the other two runtimes (`:82,86`). |

**Cost visibility this pass could NOT determine (would need live Sentry, per
the task's stated boundary):** actual event volume, actual dollar spend
against Sentry's plan quota, and whether any of these rates have been tuned
DOWN from a defaults-caused overage incident (the way this session's own
memory records a $427 unrelated Google Places incident from an uncapped
quota — the analogous Sentry question is unanswered by code alone).

---

## (g) Correlation between Sentry trace id, Flight Recorder trace id, and Bridge `admin_events` — what's stored where, today

Three distinct identifiers exist, and the code deliberately correlates them
rather than treating them as independent:

1. **Sentry's own trace id** — `Sentry.getActiveSpan()?.spanContext().traceId`.
   `server-error-logger.ts:263-268`'s `enrichTraceContext` auto-populates
   `context.traceId` from this on EVERY call to `logServerError`/
   `logServerException`/`logServerEvent`, defensively wrapped in try/catch
   (":264-268", explicit comment: "Observability must never be able to throw
   inside a logging call itself"). This becomes `admin_events.metadata.traceId`
   (`normalizeContext`, `server-error-logger.ts:135`) — i.e. **every
   `admin_events` row that has an active Sentry span at write time carries
   that span's real Sentry trace id, automatically, with no call-site
   changes required** (the file's own comment at `:253-258` states this was
   a deliberate fix for a "please pass traceId" convention that "already
   failed once" when tried per-call-site).

2. **Helm's own opaque `helmTraceId`** — a `crypto.randomUUID()` (or a
   caller-supplied UUID) minted by `createHelmFlightRecorder`
   (`helm-flight-recorder.ts:183`), explicitly documented as "Never auth
   data" (`server-error-logger.ts:68-69`'s field comment). This is a
   SEPARATE identifier from Sentry's trace id — it correlates every step of
   ONE golf-round workflow (create/autosave/submit) across however many
   Supabase RPCs and Sentry spans that workflow touches, independent of
   whatever Sentry trace happens to be active at each individual step.

3. **The bridge between 1 and 2** — `helm-flight-recorder.ts:224-225`:
   `sentry_trace_id: span.traceId` and `root_span_id: span.spanId` are
   written into `baseMetadata`, which flows into every `persistStart`/
   `persistStep`/`persistFinalize` RPC call (`helm_debug_start_trace`,
   `helm_debug_record_trace_step`, `helm_debug_finalize_trace` —
   `helm-flight-recorder.ts:109-127`) — i.e. **the `helm_debug` schema
   stores the REAL Sentry trace/span id alongside its own opaque
   `helmTraceId`, for every recorded workflow step, explicitly for
   cross-system correlation.** Additionally, when a caller passes
   `context.helmTraceId` into `logServerError`/`logServerException`, it's
   set as a Sentry TAG (`scope.setTag('helm.trace_id', context.helmTraceId)`,
   `server-error-logger.ts:562`) — so the correlation also runs in the other
   direction: a Sentry issue can be filtered/searched by the Flight
   Recorder's own trace id.

**What is NOT correlated:** the `deploy-marker.ts` release marker (§28 of the
coverage matrix) ties an `admin_events` row to a git SHA but not to any
Sentry Release object by anything more than the two happening to share the
same SHA string — no automated cross-link, no shared identifier field. And
per `OBSERVABILITY_AUTHORITY.md` (already in this repo, `docs/OBSERVABILITY_AUTHORITY.md`,
last touched 2026-08-30 per its own header) — the RECONCILIATION between
Sentry-as-a-surface and `admin_events`-as-a-surface (not the trace-ID-level
correlation described above, but the higher-level "does surface A's silence
mean production is healthy" question) is a SEPARATE, already-shipped
mechanism: `src/lib/admin/incidents/reconciliation.ts` (named in that doc as
the shipped verdict, not independently re-opened and re-read this pass) and
`ErrorSurfaceReconciliation` (the component rendering it on `/admin/errors`).
That document's own stated rule is worth restating here since it bears
directly on how to read every "NO" in the coverage matrix's Live-verified
column: **"A count of zero from one surface is not a statement about
production. It is a statement about that surface."**

---

## (h) Release / source-map pipeline as configured — and the load-bearing bug in how it's wired

### The bug: `withSentryConfig` is called with an argument the installed SDK never reads

`next.config.mjs:407-459`:

```js
withSentryConfig(
  withBundleAnalyzer(nextConfig),
  { silent: true, org: ..., project: ..., authToken: ..., release: {...}, telemetry: false },   // 2nd arg
  { widenClientFileUpload: true, tunnelRoute: '/monitoring', hideSourceMaps: true,
    disableLogger: true, automaticVercelMonitors: true, reactComponentAnnotation: {enabled:true} } // 3rd arg
);
```

The installed runtime, read directly (not just its `.d.ts`):
`node_modules/@sentry/nextjs/build/cjs/config/withSentryConfig/index.js:6`:

```js
function withSentryConfig(nextConfig, sentryBuildOptions = {}) {
```

**Exactly two parameters.** JavaScript does not error on an extra call-site
argument — it is simply never bound to `sentryBuildOptions` and never read
anywhere inside the function. The type declaration confirms the same
two-parameter signature independently
(`build/types/config/withSentryConfig/index.d.ts:12`:
`function withSentryConfig<C>(nextConfig?: C, sentryBuildOptions?: SentryBuildOptions): C`).
**This means the entire third argument — all six of `widenClientFileUpload`,
`tunnelRoute`, `hideSourceMaps`, `disableLogger`, `automaticVercelMonitors`,
and `reactComponentAnnotation` — currently has zero effect, regardless of
what value is set.** Five of those six ARE genuinely valid `SentryBuildOptions`
keys when placed in the right argument position (confirmed against
`node_modules/@sentry/nextjs/build/types/config/types.d.ts:69,81,140,463,493,521,533,539,545,547` — see the SDK
verification doc's per-option rows); `hideSourceMaps` specifically is doubly
broken because it isn't a real option in 10.71.0 AT ALL, even in the right
position (grepped every `.d.ts` under `@sentry/nextjs`, zero matches).

**Concrete, current-state consequences of the five real-but-misplaced options
being inert:**

- `tunnelRoute: '/monitoring'` not applying means there is currently **no**
  Next.js rewrite routing browser Sentry requests through `/monitoring` —
  the client SDK sends directly to Sentry's ingest endpoint, unprotected
  from ad-blockers. This is the EXACT failure mode the option's own comment
  in `next.config.mjs:444` says it exists to prevent ("circumvent
  ad-blockers"). UNKNOWN what fraction of browser events this actually costs
  without live data (an ad-blocker-using visitor's events may simply never
  arrive) — but the mechanism meant to prevent it is not running.
- `automaticVercelMonitors: true` not applying is the direct cause of every
  "NO" in the coverage matrix's Cron Monitor column — see §(d).
- `widenClientFileUpload: true` not applying means fewer source maps are
  uploaded at build time than intended — stack traces for some client bundle
  chunks may be less precise than the config's author expected.
- `disableLogger: true` not applying is the lowest-stakes of the six — a
  minor bundle-size cost (un-tree-shaken Sentry logger statements), not a
  coverage gap.
- `reactComponentAnnotation: { enabled: true }` not applying means stack
  traces do not carry JSX component names the way the config's own comment
  (`next.config.mjs:456`) says they should.

**One-line fix:** merge the second and third argument objects into one
`{ ...secondArg, ...thirdArg }` passed as the single `sentryBuildOptions`
argument. Replace `hideSourceMaps: true` with the actual 10.71.0 equivalent,
`sourcemaps: { deleteSourcemapsAfterUpload: true }` — though that specific
sub-option already DEFAULTS to `true` (confirmed,
`node_modules/@sentry/nextjs/build/types/config/types.d.ts:239`-adjacent doc comment), so this particular line may
turn out to be a no-op fix for a line that was already achieving its
practical intent by accident, unlike the other five.

**One caveat on the fix, from the repo's OWN existing docs, not this audit's
inference:** `docs/guides/SENTRY_SETUP_GUIDE.md:225` carries its own comment
next to `automaticVercelMonitors: true`: *"(Does not yet work with App
Router route handlers.)"* — every cron route in this all-App-Router repo IS
a route handler. If that comment is still accurate for 10.71.0 (not
independently re-verified against the current SDK version — the comment
predates this audit and may itself be stale), fixing the argument-position
bug alone may NOT retroactively activate cron monitoring the way it would
activate the other four options. This is exactly the kind of claim that
needs a live test, not a code read, to close — flagged for the commander
rather than asserted either way.

### What CI does and does not do for this pipeline

`.github/workflows/ci.yml`'s only Sentry-related step is "Bridge env drift"
(`:313-322`), which runs `node scripts/check-helm-bridge-env.mjs --drift`
against `SENTRY_READ_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT` (plus Vercel/internal-log-key vars) — **this is a
config-drift checker for the `/admin/errors` READ panel's credentials
(`src/lib/admin/sentry-api.ts`), unrelated to the build-time sourcemap/release
pipeline.** The `next-build` job (`ci.yml:620-656`, the one that actually
runs `npm run build`) has **no `env:` block at all** — no `SENTRY_ORG`,
`SENTRY_AUTH_TOKEN`, or `SENTRY_PROJECT` — so CI's own build never uploads
sourcemaps or creates a Sentry release; the `isDev` check
(`next.config.mjs:403-406`) doesn't skip `withSentryConfig` there (`NODE_ENV`
isn't forced to `'development'` in CI), so the webpack plugin DOES run, just
with `org`/`project`/`authToken` all `undefined` — `silent: true`
(`next.config.mjs:411`) means any resulting warning from the plugin is
suppressed rather than failing the build. **The actual sourcemap/release
upload, if it happens at all, happens during VERCEL's own build** (triggered
by an on-demand `vercel deploy`, per `shipping.md §5` — pushing does not
deploy), pulling `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` from
Vercel's OWN project environment variables, which this agent has no access
to read. **What a live verification would need:** confirm those three
variables are set in Vercel's Production (and, if source-mapped previews
matter, Preview) environment — `vercel env ls` is the documented tool, though
this session's own memory notes team-scoped/integration vars don't show
there — and then confirm an actual release/sourcemap appears in Sentry after
the next real deploy.

### `review-gate.yml` and the Playwright/UI-audit screenshot system — no Sentry wiring, confirmed by direct grep

`grep -in "sentry" .github/workflows/review-gate.yml` returns **zero
matches** — Review Gate's static-analyzer job (ast-grep, semgrep, gitleaks,
actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff,
hadolint) has no Sentry step of any kind; the only CI Sentry step anywhere
is `ci.yml`'s Bridge env-drift check, already covered above. No
`.sentryclirc` or `sentry.properties` file exists at repo root.

Two independent browser-testing systems exist, neither integrates Sentry:

- **`scripts/ui-audit-golf.mjs`** — a local Playwright-driven route auditor.
  It captures `pageerror`/`console`/`response` events per route
  (`:397,405,416`) and reports console errors as its own `P0` findings
  (`:425`) in a self-contained report — entirely separate from Sentry, and
  **not wired into any CI workflow** (`grep -rn "ui-audit-golf"
  .github/workflows/*.yml .circleci/config.yml` — zero hits). A console
  error this script catches locally has no relationship to whether that same
  error would also reach Sentry in production; the two systems currently
  give no cross-signal to each other.
- **`e2e/*.spec.ts`** (19 Playwright spec files, `playwright.config.ts` at
  repo root) — run in CI via `ci.yml`'s e2e job (`npx playwright test`,
  confirmed at `ci.yml:886`). No spec file integrates Sentry. Two
  accessibility specs (`e2e/accessibility.spec.ts:108`,
  `e2e/crm-accessibility.spec.ts:43`) exclude a `#sentry-feedback` selector
  from axe scans — checked whether this corresponds to an actually-mounted
  widget: it does not (`grep -rn "feedbackIntegration\|sentry-feedback"
  src/` matches only the comment in `instrumentation-client.ts:87-92`
  explaining why `feedbackIntegration` is currently NOT added). The
  selector exclude is precautionary for a widget that isn't there today,
  not evidence of one.

---

## (i) Health / readiness route

`src/app/api/health/route.ts` (single file, 34 lines) EXISTS. It checks
exactly one dependency: a `SELECT id FROM users LIMIT 1` via the standard
server Supabase client (`:9-14`). Returns
`{status: 'healthy'|'degraded', database, deploymentId, timestamp,
responseTimeMs}`.

**What it does NOT check:** Inngest (credential health has its OWN separate
detection path, `instrumentation.ts:277-294`, not surfaced here),
the AI Gateway/model provider (no probe), push notification provider
connectivity, Sentry's own configuration, or any of the ~28 scheduled jobs
from §(d). It is a narrow DB-liveness probe, not a system-readiness check in
the fuller sense the name might suggest.

**What it does NOT do on failure:** both failure branches (`:16-18` for a
Supabase `{error}` response, `:22-25` for a thrown exception) are silent —
no `logServerError`, no Sentry call, no `admin_events` row. A degraded health
check is invisible to Sentry/Bridge; only a system that actively POLLS this
route's JSON body and interprets `status: 'degraded'` itself would ever
notice. No such poller was found in the directories read this pass (not
exhaustively searched for one — `grep -rn "/api/health"` outside this file
was not run; a follow-up `grep -rln "api/health" .github .circleci scripts`
would resolve whether Vercel's own health-check feature, an uptime monitor,
or nothing at all currently reads this route).

No Sentry `captureCheckIn`/monitor wraps this route (consistent with the
zero-monitor finding throughout this audit) and no `Sentry.setContext`/tag
records the health result on any active span.
