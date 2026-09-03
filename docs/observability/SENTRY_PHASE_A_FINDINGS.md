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

19 Vercel crons (`vercel.json`'s `crons` array, counted programmatically —
not hand-typed, see the preamble's docs-rot rule) plus 2 route-handler jobs
that exist under `src/app/api/cron/**` with **no entry in `vercel.json` at
all**: `process-sequences` and `v3/standing-backfill`. Both also have zero
`recordJobRun` references (`grep -c "recordJobRun"` → `0` for each), meaning
neither `background_job_logs` nor any Bridge alert exists for them either —
if these routes are meant to run on a schedule, nothing currently triggers
or watches them; if they're meant to be manually/Inngest-triggered, that's
unconfirmed by anything in `src/app/api/cron/**` itself (not traced further
this pass — worth a direct question to whoever owns those two routes).

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
| `coachhelm-validation` | `15 * * * *` (hourly) | YES | NO | UNKNOWN — not read this pass; name suggests CoachHelm insight validation. |
| `coachhelm-calibration` | `40 3 * * *` (daily) | YES | NO | UNKNOWN — not read; name suggests confidence-calibration model refresh. |
| `coachhelm-safety-net` | `*/30 * * * *` (every 30 min) | YES | NO | UNKNOWN — not read; frequency suggests a fallback/catch-up sweep. |
| `coachhelm-insight-lifecycle` | `0 4 * * *` (daily) | YES | NO | UNKNOWN — not read; likely insight expiry/archival. |
| `coachhelm-roster-sweep` | `0 2 * * *` (daily) | YES | NO | Confirmed reads roster rows and reports per-player outcomes (`{playerId, ok, err}`, `coachhelm-roster-sweep/route.ts:138`) — a silent stop means roster-driven CoachHelm state drifts unnoticed. |
| `event-reminders` | `0 * * * *` (hourly) | YES | NO | Confirmed: calendar event RSVP reminders, including push notifications (`event-reminders/route.ts` imports `sendPushNotification`) — a silent stop means players/coaches stop getting event reminders with no signal anywhere. |
| `task-reminders` | `0 * * * *` (hourly) | YES | NO | Confirmed: task due-date reminders, including push (`task-reminders.ts:756`) — same silent-stop risk as event-reminders. |
| `v3/standing-refresh` | `20 2 * * *` (daily) | YES | NO | UNKNOWN — not read; likely CoachHelm v3 standing/ranking recompute. |
| `v3/genome-nightly` | `40 2 * * *` (daily) | YES | NO | UNKNOWN — not read; CoachHelm "genome" per repo naming conventions (v3 causal/insight engine). |
| `v3/causality-attribute` | `0 3 * * *` (daily) | YES | NO | UNKNOWN — not read. |
| `v3/goal-suggestions-write` | `20 3 * * *` (daily) | YES | NO | UNKNOWN — not read. |
| `v3/goal-suggestions-evaluate` | `20 4 * * *` (daily) | YES | NO | UNKNOWN — not read. |
| `integrity-check` | `0 7 * * *` (daily) | YES | NO | UNKNOWN — not read; name suggests data-integrity verification, which is itself the kind of job whose own silent failure is highest-consequence to miss (a check that stopped checking looks identical to "nothing wrong"). |
| `log-retention` | `30 7 * * *` (daily) | YES (6 refs — heaviest instrumentation of any cron route) | NO | UNKNOWN specifics, but heavy `recordJobRun`/logging usage suggests this route's own author already treated it as high-risk. |
| `admin-digest` | `0 11 * * *` (daily) | YES | NO | Confirmed: builds and sends the daily "Cup of Helm" ops email (`admin-digest/route.ts:17-`) — a silent stop means the owner's one daily digest of shipped PRs, Sentry issues, and deploy freshness simply never arrives, with nothing else surfacing that absence (the digest IS the alerting mechanism for several OTHER signals, per its imports of `fetchSentryIssues`/`fetchTriageQueue`/`fetchDeployFreshness` — so this job stopping silently degrades multiple downstream visibility surfaces at once, not just itself). |
| `refresh-engagement` | `10 */4 * * *` (every 4h) | YES | NO | UNKNOWN — not read. |
| `ingest-gmail-replies` | `*/30 * * * *` (every 30 min) | YES, `JOB_TYPE` constant + the most defensively-engineered route read this pass (self-throttled daily alert on degraded auth state, `:822-873`) | NO | Best-covered of the 19 for the "degraded but still running" case; the pure "never invoked at all" case is still uncovered like every other row. |
| `helm-debug-prune` | `30 4 * * *` (daily) | YES | NO | UNKNOWN — not read; name suggests `helm_debug`/Flight Recorder retention cleanup, meaning a silent stop would eventually degrade the Flight Recorder correlation described in §(g) via unbounded table growth, not an immediate user-facing break. |
| `reliability-triage` | `0 */3 * * *` (every 3h) | YES (6 refs) | NO | UNKNOWN specifics; name and Mission Control context (this session's own memory of the Bridge/reliability system) suggest this feeds the admin reliability dashboard directly — a silent stop would make that dashboard stale without saying so. |
| `process-sequences` | **NOT in `vercel.json`** | NO recordJobRun refs | NO | UNKNOWN whether this route is dead code, manually triggered, or missing its cron registration — flagged as an open question, not resolved this pass. |
| `v3/standing-backfill` | **NOT in `vercel.json`** | NO recordJobRun refs | NO | Same open question as `process-sequences`. |

Inngest functions (separate scheduling system, not Vercel cron):
`src/lib/inngest/functions.ts:57` `weeklyHealthPing`, `:106` `healthPing`,
`:172` `onCoachHelmRoundSubmitted` (event-triggered, not cron-triggered, per
the name). This session's own memory
(`project/helmv3_inngest_credentials_dead`) already establishes both Inngest
API keys are currently REJECTED and rounds fall back — meaning the practical
question for these three functions today may be "do they run at all,"
which `instrumentation.ts:277-294`'s `reportInngestCredentialFault('startup')`
DOES specifically detect and Bridge-report (real code, confirmed, not
speculative) — so the credential-level failure mode is covered even though
each function's own internal error handling was not individually read this
pass.

launchd: no repository-tracked launchd plist was found. `grep -rin "launchd"`
hits were all in `scripts/run-selfheal-repair.mjs`, `scripts/run-bounded.mjs`,
`src/app/admin/self-heal/page.tsx`, `src/lib/admin/selfheal-registry.ts`, and
several `docs/` files describing a self-heal "Repair job" — this is the
self-heal/repair system (a separate mechanism from Sentry, reads
`background_job_logs` per the earlier grep hit list, not a Sentry-integrated
job in what was read this pass). No evidence found of an actual macOS
launchd `.plist` file committed to the repo; the "Repair job" language in
docs appears to refer to this in-app self-heal system, not an OS-level
scheduled task. UNKNOWN with certainty — would need a repo-wide
`find . -iname "*.plist"` (not run this pass) to fully rule out a
committed plist.

---

## (e) Handled-error audit — `src/app/golf/actions`, `src/lib/golf`, `src/lib/coachhelm`, `src/lib/admin`, `src/app/api/cron`, push code

**Methodology, stated so the counts below don't rot into unverifiable prose
(shipping.md §1's rule):** a script swept every `catch` block in these
directories (excluding `__tests__`/`.test.` files) for the presence of any
reporting call within a ~9-line window
(`logServerError|logServerException|logServerEvent|captureGolfActionError|Sentry\.captur|console\.(error|warn)|maybeCaptureRlsDenial|observeActionSoftFailure|formatSafeErrorResponse`),
a bare `throw`, or a `ZodError` branch (validation — correctly silent). The
sweep is a heuristic (window-bounded, regex-based) and is NOT a claim of
exhaustive precision — it surfaced 155 candidates; a subset was individually
opened and read to confirm or refute. **The verified list below is smaller
than 25 because this pass prioritized correctness over hitting a round
number** — several of the highest-signal-looking candidates turned out, on
inspection, to be already correctly covered (a false-positive rate high
enough that padding the list further without individually verifying each one
would itself be the "guessed YES" this audit exists to avoid). The
unverified remainder is exactly the kind of `UNKNOWN, and here is what would
resolve it` list the brief asked for, not a silent gap.

### Classification-bucket counts (from the reviewed subset, not the full 155)

| Bucket | Count (of ~20 individually reviewed) | Note |
|---|---|---|
| EXPECTED CONTROL FLOW | 11 | `ZodError` branches, `formatSafeErrorResponse`-routed catches (confirmed internally calls `logServerException` — `server-action-validator.ts:160-` per its own comment), deliberate degraded-mode admin dashboard sections (`src/lib/admin/data/*.ts`'s `degraded.push(...)` pattern — the admin UI itself renders the degraded state, which is a real signal to the one human who reads it, just not a Sentry issue). |
| RECOVERABLE WARNING | 4 | `admin-digest`'s `fetchShippedYesterday` (deliberately distinguishes "unknown" from "nothing", email is the signal); `deploy-marker.ts`'s fire-and-forget boot marker; two others in the same "must never break the caller" fire-and-forget shape. |
| ACTIONABLE ERROR | 3 | Listed individually below. |
| CRITICAL ERROR | 0 identified in this subset | Does not mean none exist in the unreviewed 135 — see caveat above. |
| Verified-covered false positives (script flagged, read confirmed OK) | ~6 | `foundation/push.ts:132-145`'s bare return (covered by its one caller, `task-reminders.ts:1034,1043`); `ingest-gmail-replies`'s alert-throttle catches (deliberately fail-open, by design, per their own comments); `golf-message-fanout.ts`'s push-failure catch (already calls `logServerError`, `:158`). |

### The 3 verified ACTIONABLE sites

1. **`src/app/golf/actions/round-drafts.ts:487-490` — silent round-draft data loss, zero signal.**
   ```ts
   } else if (draft.notes) {
     try {
       draftData = JSON.parse(draft.notes) as RoundDraftData;
     } catch {
       draftData = null;
     }
   }
   ```
   A legacy round draft stored in the `.notes` fallback column that fails to
   parse is silently treated as if no draft existed — no `logServerError`, no
   Sentry, nothing. Given this repo's own stated sensitivity to round-data
   loss (the "no destructive writes" rule this session's memory records
   repeatedly for GolfHelm), an unrecoverable draft with zero paging signal
   is a real gap, not a style nit.
   **One-line fix:** `catch (parseError) { draftData = null; captureGolfActionError(parseError, { action: 'loadRoundDraft.legacyNotesParse', featureArea: 'round_draft', playerId: player.id }); }`

2. **`src/app/api/health/route.ts:22-25` — health-check failure itself unreported.**
   ```ts
   } catch {
     database = 'error';
     status = 'degraded';
   }
   ```
   The route correctly returns a `degraded` JSON body, but nothing calls
   `logServerError`/Sentry when the DB check itself throws (as opposed to
   returning a Supabase `{error}` shape, which is handled one branch up at
   `:16-18` — also silent, same gap, just via a different code path).
   Whatever (if anything) polls `/api/health` today has to actively parse
   the JSON body to notice; nothing pushes the failure. See §(i) for the
   full health-route finding.
   **One-line fix:** add a `logServerError('health check DB probe failed', {action:'api.health', skipSentry:true}, 'warning')` in both the `error` branch and the `catch` block — `skipSentry:true` because a transient health-check blip alone (as opposed to a sustained one) shouldn't page, but SHOULD be visible in `admin_events` for trend purposes.

3. **`src/lib/coachhelm/v3/chat/agent-tools.ts:240,269,549,573` — tool-build failures return typed envelopes with no logging call in the immediate window.**
   Two near-identical catch shapes (`:240-269` and `:549-573`) return
   `{status:'failed', message}` when a plan/practice-tool cannot be built,
   with a comment explaining the UI consequence ("must never produce a
   Confirm button") but no `logServerError`/Sentry call visible within the
   read window. **UNKNOWN, not CONFIRMED, whether a caller further up the
   stack wraps this** — the surrounding function was not traced beyond the
   immediate catch block given Phase A's time budget. Recording as
   ACTIONABLE-pending-verification rather than either asserting a bug or
   silently dropping it. What would resolve it: read `agent-tools.ts` in
   full and trace every call site of the two functions containing these
   catches.

### Everything else the sweep flagged but this pass could not individually verify

~132 remaining candidates from the 155-item sweep, concentrated in
`src/lib/admin/data/*.ts` (the "degraded"-pattern admin dashboard section
loaders — pattern strongly suggests EXPECTED/RECOVERABLE, not individually
confirmed for every file), `src/app/golf/actions/golf.ts` (a ~9,000-line
file; the ~25 `catch` sites flagged there beyond the ones already resolved
via `formatSafeErrorResponse` were not all individually opened), and
`src/lib/coachhelm/v3/ingest/providers/arccos.ts` (3 catch sites returning
zero-counts on ingest failure — lower urgency per this session's own memory
that Arccos/Garmin/TrackMan ingest adapters are currently stubs, not live).
**What would resolve the remainder:** re-run the same sweep script (its
source is reproducible from the regex/window described above) and budget
individual verification time proportional to blast radius — prioritize
`golf.ts` (highest-traffic file) and the admin data loaders (feed the
Bridge's own health picture — a blind spot there is a blind spot ABOUT
blind spots) before the lower-traffic files.

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
