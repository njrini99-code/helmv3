<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Sentry coverage matrix — current state (Phase A)

## How this table was measured

Read at commit `44f4ce183` (branch `main`), from the canonical checkout
`/Users/ricknini/Downloads/helmv3` (source of truth) with installed package
types read from that checkout's `node_modules/@sentry/*`. No writes were made
to that checkout. This file was written into the worktree
`/Users/ricknini/worktrees/helmv3/sentry-max-observability` per the audit's
read/write split.

Every cell is one of:

- **YES (anchor)** — file:line evidence the mechanism runs today.
- **PARTIAL (anchor; gap)** — it runs, but misses something named explicitly.
- **NO** — nothing found after a targeted search; the search itself is
  described in the row/column note when non-obvious.
- **UNKNOWN (what would prove it)** — could not be determined by reading code
  alone; states the check that would resolve it (almost always: query Sentry
  live, or check a Vercel env var this agent cannot read).

**"Live verified?" is NO for every row.** This agent has no Sentry access
(per the task boundary) and made no live query. One caveat worth surfacing to
the commander: `mcp__7524981b-0003-40de-9f86-c5275420784a__*` tools (the
account connector's UUID spelling — the display name `mcp__claude_ai_Sentry__*`
this note originally cited does not exist in any current session's tool
inventory; see `config/mcp-connector-ids.json` for when the rotation was
observed) are present in this session's tool list and
`.claude/rules/shipping.md` names the Sentry MCP (org `helm-xs`) as a working
read path — so live verification is technically reachable from a
differently-scoped Phase A run, but this run did not use it,
per the brief's explicit instruction to leave "Live verified?" at NO
throughout and let the commander do that check.

## Shared mechanisms — defined once, cited by shorthand in the table

| ID | Mechanism | Anchor |
|---|---|---|
| **M1** | `withGolfAction` / `captureGolfActionError` — golf server-action wrapper: `Sentry.withScope` tags (`sport`, `feature_area`, `feature`, `action`), start/done breadcrumbs, `scope.setUser`, classify → `maybeCaptureRlsDenial` → `logServerException`, one admin_events/error_logs row per failure (never two — `capturedAsRlsDenial` gates the fallback). No custom span. ~~No metric.~~ **UPDATED 2026-09-03 (Deliverable 6, Phase C):** now calls `recordWorkflow` (`helm.workflow.*`, `feature:'golf_action'`, dimensioned by `sport`+`action` only — never a per-call identity dimension) on every success/expected-error/unexpected-error exit, at the same three points the wrapper already branches on. | `src/lib/golf/with-golf-action.ts:401-493` (wrapper), `:243-315` (log sequence), `:362-384` (`captureGolfActionError`); metric calls at the success return, the expected-control-flow-error branch, and the unexpected-error branch inside the wrapper's own `try`/`catch` |
| **M2** | `withBaseballAction` — baseball's heavier wrapper: resolves AUTH + active-team CONTEXT + CAPABILITY server-side, same Sentry-scope/breadcrumb/`logServerException` shape as M1, plus a **fixed allowlist** of typed control-flow error classes (`BaseballUnauthorizedError`, `BaseballNoActiveTeamError`, `BaseballCapabilityError`, `BaseballDisabledSourceError`, `BaseballDemoReadOnlyError`) that are logged as handled warnings (`skipSentry`) then **re-thrown** so callers can branch. **UPDATED 2026-09-03 (Deliverable 6, Phase C):** same `recordWorkflow` addition as M1 (`feature:'baseball_action'`), with `outcome` set to the SPECIFIC error class name (e.g. `'BaseballNoActiveTeamError'`) rather than a flat string, so an expected/control-flow outcome reads distinctly from a genuinely unexpected one. | `src/lib/baseball/with-baseball-action.ts:1-90` (header + imports), full catch/re-throw logic beyond line 90 not re-read in full for this pass — structure confirmed via header doc + `sharedIgnoreErrors` cross-reference below |
| **M3** | `withLiftingAction` — lifting's wrapper: AUTH → ORG-CONTEXT → EDIT-GATE, same Sentry-scope shape, typed control-flow classes (`LiftingUnauthorizedError`, `LiftingNoOrgError`, `LiftingForbiddenError`) logged via `logServerEvent(..., skipSentry: true, ...)` then **re-thrown**. **Unlike M2's classes, none of M3's three class names appear in `sharedIgnoreErrors`** — see the Findings doc §(b)/(c), this is a live duplicate-capture bug, not just a documented pattern (fixed in Deliverable 2 — see that entry in `memory/ledgers/changes/observability_sentry.md`). **UPDATED 2026-09-03 (Deliverable 6, Phase C):** same `recordWorkflow` addition as M1/M2 (`feature:'lifting_action'`, expected-error outcomes carry the specific class name). | `src/lib/lifting/with-lifting-action.ts:113-230`, esp. `:195-215` |
| **M4** | `onRequestError` (Next's instrumentation hook) — catches anything that escapes a server action/route/RSC boundary uncaught by M1-M3. **Unconditionally** calls `Sentry.captureRequestError(error, request, errorContext)` first, THEN (in a separate `try`) decides via `shouldSkipBridgeWrite` whether to ALSO write the Bridge (`logServerException`) — skipped when `isNextControlFlowDigest`, when `isAlreadyBridgeLogged(error)` (the `__helmBridgeLogged` marker M1-M3/error-logging.ts set), or when the error's `.name` is in `bridgeSkipErrorNames` (derived from the Baseball/`PlayerAccessError` subset of `sharedIgnoreErrors`). The Sentry capture at the top is unconditional and does **not** consult any of those three skip conditions — see Findings §(b). | `src/instrumentation.ts:405-473`, skip logic `:338-361` |

Other named building blocks referenced below: **`spans.ts`** = `src/lib/observability/spans.ts` (`roundStage`, golf round-tracking business spans, `op: 'golf.workflow'`/`'golf.round.stage'`); **`supabase-tracing.ts`** = `src/lib/observability/supabase-tracing.ts` (`withSupabaseTracing`, wraps every Supabase client factory, `sendOperationData: false` always); **`helm-flight-recorder.ts`** = `src/lib/observability/helm-flight-recorder.ts` (opt-in-in-prod workflow tracer, writes `helm_debug_*` RPCs, carries `sentry_trace_id`/`root_span_id`); **`redact-pii.ts`** = `src/lib/observability/redact-pii.ts` (`beforeSend`-time email masking, applied in both `instrumentation.ts` and `instrumentation-client.ts`); **`register-process-error-handlers.ts`** = process-level `unhandledRejection`/`uncaughtException` handlers.

---

## The matrix

Columns: **Err** (Errors) · **Trc** (Trace) · **BSpan** (Business span) · **DBSpan** · **Metr** (Metric) · **Log** (Structured log) · **Crumb** (Breadcrumb) · **Replay** · **Prof** (Profile) · **User** (User context) · **Tags** (Feature/sport/action tags) · **Rel** (Release) · **FR** (Flight Recorder correlation) · **Mon** (Monitor) · **Alrt** (Alert) · **Live?** · **Blind spot / action**

### 1. Browser uncaught error
- **Err**: YES — `window.addEventListener('error', ...)` → `logError` → `Sentry.captureException` (`src/lib/error-logging.ts:658-678`, `:398-420`).
- **Trc**: YES — `browserTracingIntegration()` active session trace (`src/instrumentation-client.ts:78`).
- **BSpan/DBSpan**: NO (client-side, no server span reachable from here).
- **Metr**: NO — no `Sentry.metrics.*` call site exists anywhere in `src/`.
- **Log**: PARTIAL — `consoleLoggingIntegration` forwards any accompanying `console.*` (`instrumentation-client.ts:82`), but the error itself isn't independently pushed to the Logs stream, only Issues.
- **Crumb**: YES — Sentry's default browser breadcrumbs (clicks/nav/fetch) are on by default (integration list doesn't disable them).
- **Replay**: YES — `replaysOnErrorSampleRate: 1.0` (`instrumentation-client.ts:69`), captures 100% of sessions containing an error, in prod (`!isDev` gate on the integration, `:74`).
- **Prof**: NO — no browser profiling integration configured (`browserProfilingIntegration` exists in the SDK per the verification doc but is not added to `instrumentation-client.ts`'s `integrations` array).
- **User**: PARTIAL — only set when `enrichErrorContext`/caller supplies `userId`/`userEmail`; the global window `error` handler path (`error-logging.ts:658-678`) passes only `component`/`action`/`filename`/`lineno`/`colno`, no user identity, so `Sentry.withScope`'s `scope.setUser` is never called for this specific path (contrast with `RouteErrorBoundary`, which can pass more).
- **Tags**: YES — `sport` auto-tagged from `window.location.pathname` in `beforeSend` (`instrumentation-client.ts:152-160`).
- **Rel**: YES — `release` set at `Sentry.init` (`instrumentation-client.ts:48`) from `NEXT_PUBLIC_SENTRY_RELEASE`/`VERCEL_GIT_COMMIT_SHA`.
- **FR**: NO — Flight Recorder is server-only (`import 'server-only'`, `helm-flight-recorder.ts:1`); a browser-only error has no trace to correlate to.
- **Mon**: NO (not a scheduled-job class).
- **Alrt**: UNKNOWN — depends on live Sentry alert-rule config; not verifiable by reading code.
- **Live?**: NO.
- **Blind spot**: dedup risk — `markBridgeLogged(error)` runs at the very top of `logError` (`error-logging.ts:343`), but `console.error`s that happen **before** `logError` is called on the same error object race that marker; see Findings §(b) for the concrete `global-error.tsx` instance.

### 2. React render error (error boundary)
- **Err**: YES — every route's `error.tsx` renders `RouteErrorBoundary`/`CompactRouteErrorBoundary`, which call `logError` (`src/components/errors/RouteErrorBoundary.tsx:177,388`); root fallback is `global-error.tsx:16-21`.
- **Trc**: YES — same `browserTracingIntegration` session trace as row 1.
- **BSpan/DBSpan**: NO.
- **Metr**: NO.
- **Log**: PARTIAL — same as row 1; additionally `global-error.tsx:15` fires an explicit `console.error` that is itself captured as a **separate** Log-stream entry AND (see Blind spot) a separate Issue.
- **Crumb**: YES — default browser breadcrumbs + any explicit ones set upstream.
- **Replay**: YES — same `replaysOnErrorSampleRate: 1.0`.
- **Prof**: NO.
- **User**: PARTIAL — depends on what context the specific `error.tsx`/boundary passes to `logError`; `~162` `error.tsx` files exist (`find src/app -iname error.tsx | wc -l`), not individually audited for context completeness in Phase A.
- **Tags**: YES — `sport` auto-tag (URL-path based) same as row 1; `component`/`route`/`action` passed explicitly per boundary (e.g. `"src/app/golf/(dashboard)/error.tsx:16-20"`).
- **Rel**: YES.
- **FR**: NO (render-time, not a server workflow).
- **Mon**: NO.
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot**: **`global-error.tsx:15-16` double-captures.** `console.error('Global error boundary caught:', error)` fires BEFORE `logError(error, ...)` on the line right after it. `captureConsoleIntegration({levels:['error']})` (`instrumentation-client.ts:86`) captures that `console.error` synchronously, at a point where `markBridgeLogged` (called inside `logError`, one line later) has not yet run — so `isAlreadyBridgeLogged` is `false` at capture time and the dedup check in `instrumentation-client.ts:117-119` cannot suppress it. Net: every hit of the app's last-resort, most-critical error boundary mints **two** Sentry issues, not one. `RouteErrorBoundary.tsx` (the ~162-boundary common path) does not have this ordering bug — it calls `logError` with no preceding explicit `console.error` (verified: `grep -n "console.error\|logError(" src/components/errors/RouteErrorBoundary.tsx` shows only the two `logError` calls, no `console.error`). Fix: drop or reorder `global-error.tsx:15`'s `console.error` to after `markBridgeLogged` has run (or just delete it — `logError` already dev-logs via `console.group`).

### 3. Unhandled browser promise rejection
- **Err**: YES — `window.addEventListener('unhandledrejection', ...)` → `logError` (`error-logging.ts:633-656`).
- **Trc/BSpan/DBSpan/Metr**: same as row 1 (NO/NO/NO/NO).
- **Log**: PARTIAL, same reasoning as row 1.
- **Crumb/Replay**: YES, same as row 1.
- **Prof**: NO.
- **User**: PARTIAL — same gap as row 1 (this handler also passes no `userId`/`userEmail`).
- **Tags**: YES, `errorKind` additionally set when `classifyGlobalErrorKind` recognizes chunk-load/hydration (`error-logging.ts:645-654`).
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: stale-server-action rejections are intentionally NOT reported (soft-reload instead, `error-logging.ts:640-643`) — correct behavior, not a gap, noted so it isn't mistaken for one.

### 4. Handled browser error (caught, not thrown further)
- **Err**: PARTIAL — only if the catching code explicitly calls `logError`/`Sentry.captureException`; no structural guarantee every client-side `catch` does. Not exhaustively auditable client-side within Phase A's directory scope (client components were not in the handled-error-audit directory list).
- **Trc/BSpan/DBSpan/Metr**: NO/NO/NO/NO (same as row 1 baseline).
- **Log**: PARTIAL, same as row 1.
- **Crumb/Replay**: YES if `logError` is actually called; otherwise NO — an uncalled path leaves no trace at all, not even a breadcrumb, since breadcrumbs are Sentry-side and nothing was sent.
- **Prof**: NO.
- **User**: PARTIAL, depends on caller-supplied context.
- **Tags/Rel**: same as row 1 when `logError` runs.
- **FR/Mon**: NO.
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: UNKNOWN in aggregate — client-side handled-catch coverage was out of Phase A's audited directory list (`src/app/golf/actions`, `src/lib/golf`, `src/lib/coachhelm`, `src/lib/admin`, `src/app/api/cron`, push code — all server-side). What would prove it: the same catch-block sweep methodology used for the server-side audit (Findings §(e)), re-run over `src/components/**` and `src/hooks/**`.

### 5. Server action error (unexpected/CRITICAL)
- **Err**: YES — M1 (golf), M2 (baseball), M3 (lifting) all route unexpected throws through `logServerException` → `Sentry.captureException` inside `Sentry.withScope` (`server-error-logger.ts:594-596`).
- **Trc**: YES — the action runs inside Next's own Sentry server-action instrumentation (`Sentry.withServerActionInstrumentation`, confirmed exported in the SDK verification doc; Next's App Router wires this automatically for `'use server'` files — not independently re-verified as wired in this repo's specific build output, since that happens inside Next's own generated glue, not source `src/` can grep).
- **BSpan**: PARTIAL — only for the golf round-tracking surface via `spans.ts`'s `roundStage` (`op: 'golf.workflow'`/`'golf.round.stage'`); most other action files have no equivalent stage-level span.
- **DBSpan**: YES — every Supabase client is wrapped by `supabase-tracing.ts`'s `withSupabaseTracing`, so every query/RPC issued during the action becomes a `db` span; `sendOperationData: false` always (`supabase-tracing.ts:118`), so span **description** carries the operation shape (e.g. `insert(...) from(golf_shots)`) but not filter values or mutation bodies.
- **Metr**: NO.
- **Log**: PARTIAL — `Sentry.logger.*` exists and is enabled (`enableLogs: true`) but has zero call sites; `console.*` forwarding via `consoleLoggingIntegration` is the only thing reaching the Logs stream today.
- **Crumb**: YES — `start <name>`/`done <name>` breadcrumbs from M1/M3 (`with-golf-action.ts:415-420,459`; `with-lifting-action.ts:125-130,193`); M2 presumed equivalent (header doc says "with user + breadcrumbs", not independently re-read line-by-line for this pass — **UNKNOWN** the exact breadcrumb text, low-stakes gap).
- **Replay**: NO (server-side; Replay is a browser-only integration).
- **Prof**: PARTIAL — Node profiling integration is configured (`nodeProfilingIntegration()`, `instrumentation.ts:219-226`, `profileSessionSampleRate: isDev?0:0.3`), but only wraps whatever spans exist — for actions with no custom span, only the auto Sentry request-scope span (if any) gets profiled.
- **User**: YES — `scope.setUser` in M1 (`with-golf-action.ts:428-430`) and M3 (`:139`) when identity is available; M2 presumed same pattern per header.
- **Tags**: YES — `sport`, `feature_area`/`feature`, `action` set by M1/M2/M3.
- **Rel**: YES.
- **FR**: PARTIAL — only golf round-tracking workflows that explicitly construct a `HelmFlightRecorder` get `sentry_trace_id`/`root_span_id` correlation (`helm-flight-recorder.ts:224-225`); most action files never touch the flight recorder. **UPDATED 2026-09-03 (Deliverable 6):** those same workflows now ALSO get the inverse direction — `attachHelmTrace(traceId)` (`correlation.ts`) writes Helm's own trace id onto the active Sentry scope/span at `createHelmFlightRecorder`'s construction, so a Sentry-side search can find every event tagged with a given Helm trace id, not just the DB-side `trace_runs` row correlating back to Sentry's. Still gated on flight-recorder construction — the PARTIAL verdict itself is unchanged, only the correlation now runs both ways at the same gate.
- **Mon**: NO (not a scheduled job).
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot**: `withLiftingAction`'s three typed control-flow classes are **not** Sentry-`ignoreErrors`-suppressed the way Baseball's/Golf's equivalents are (M3 note above) — every "not signed in"/"no org"/"forbidden" Lifting Lab action mints a duplicate, alertable Sentry issue on top of the correctly-suppressed Bridge row. See Findings §(b)/(c).

### 6. Handled server action failure (expected/soft failure, `{success:false}` returned)
- **Err**: PARTIAL, narrowed 2026-09-03 (Sentry coverage-gaps pass) — M1/M2/M3's classifier (`classifySoftFailure`/allowlist) routes expected failures to `logServerEvent`/`logServerException` with `skipSentry: true` — correctly NOT an Issue — and the catch-block sweep in Findings §(e) found ~15-20 individual catch sites in `src/app/golf/actions/golf.ts` and elsewhere returning a generic `{success:false, error:'Failed to ...'}` with no logger at all. **Closed this pass, on the calendar/round critical paths (Findings §(e) ranked items #1-3):** `updateGolfEventImpl`'s and `deleteGolfEventImpl`'s outer catches (previously ZodError-only / fully bare with no error binding) now call `logServerException`; the `Failed to update/cancel/delete event` bare-error branches now call `logServerError`; `updateShotImpl`'s `putt_details`/`approach_miss_details` swallow-everything catches (Findings #1, CRITICAL — a real write failure returned `success:true` identically to "table doesn't exist") now check the resolved `{error}` and only stay silent on `42P01` (undefined_table), logging everything else. **Still open** (lower severity per Findings' own ranking, or reads not writes): items #4-6, #10, #13-16, #18-20 in Findings §(e)'s ranked list, and the systemic `formatSafeErrorResponse` action-name-threading fix (item #17).
- **Trc/BSpan/DBSpan**: same as row 5 when the action does route through a wrapper; NO for the un-wrapped catch sites.
- **Metr**: NO.
- **Log**: PARTIAL, same as row 5.
- **Crumb**: YES when wrapped (M1/M2/M3's `done <name>` breadcrumb still fires on the success path even if the RETURNED value signals failure, since `observeActionSoftFailure` inspects the resolved value rather than a throw) — NO for a bare early-return inside an already-entered try that never reaches the wrapper's own catch.
- **Replay**: NO (server-side).
- **Prof**: PARTIAL, same as row 5.
- **User**: PARTIAL, same as row 5.
- **Tags**: PARTIAL, same as row 5.
- **Rel**: YES when wrapped.
- **FR**: PARTIAL, same as row 5.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: `formatSafeErrorResponse` (`src/lib/validation/server-action-validator.ts:139-`) is the actual funnel that makes most of `golf.ts`'s bare `catch (error) { return formatSafeErrorResponse(error); }` sites SAFE (it internally calls `logServerException` for unknown errors — confirmed by reading the function). The genuinely-silent subset is specifically the catches that build their own literal `{success:false, error:'...'}` WITHOUT calling `formatSafeErrorResponse` or any wrapper — see Findings §(e) for the verified list.

### 7. API route failure
- **Err**: YES — same M4 (`onRequestError`) safety net as any escaping error, PLUS explicit `logServerError`/`logServerException` calls inside individual route handlers (e.g. `src/app/api/coachhelm/v3/chat/stream/route.ts:262-264`).
- **Trc**: YES — `Sentry.wrapRouteHandlerWithSentry` exists in the SDK (confirmed in the verification doc's runtime export list) and App Router route handlers are auto-instrumented by Next+Sentry's build-time wrapping; not independently re-verified against generated build output.
- **BSpan**: PARTIAL — only where a route explicitly starts one (none of the routes read in Phase A did).
- **DBSpan**: YES, via `supabase-tracing.ts` same as row 5.
- **Metr/Log**: NO/PARTIAL, same as row 5.
- **Crumb**: PARTIAL — only present when the route handler explicitly opens a `Sentry.withScope`/breadcrumb; not structural for every route the way M1-M3 make it structural for wrapped actions.
- **Replay**: NO.
- **Prof**: PARTIAL, same as row 5.
- **User**: PARTIAL, route-dependent.
- **Tags**: PARTIAL, route-dependent (M4's fallback `deriveSportFromUrl` tags `sport` even when the route sets nothing itself — `instrumentation.ts:87-104,196-198` — so this one column is structurally guaranteed at the M4 layer even for un-instrumented routes).
- **Rel**: YES.
- **FR**: NO (route handlers don't construct a flight recorder in anything read).
- **Mon**: NO.
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot**: **CLOSED by Phase C Deliverable 4, re-verified 2026-09-03.** `/api/health` was rewritten: bounded Supabase query (`.abortSignal(AbortSignal.timeout(2500))`), honest HTTP status (200 only when `status:'healthy'`, else 503), and a 60-second-throttled `logServerError` on the degraded branch (never logged every poll, so a monitoring service hitting this route frequently can't turn a real outage into a self-inflicted log storm). Every real consumer of the response shape (`scripts/warm-edge.ts`, `StaleDeploymentRecoveryScript.tsx`, `layout.tsx`'s `x-deployment-id` meta tag) was updated in the same change.

### 8. RSC (React Server Component) failure
- **Err**: YES — M4's `mapRouteTypeToSource` maps Next's `'render'` routeType to `'server_component'` (`instrumentation.ts:382-384`), so any RSC render failure that escapes to `onRequestError` is captured the same as any other route.
- **Trc**: PARTIAL — Next+Sentry auto-instruments RSC rendering at the framework level; not independently verified against build output.
- **BSpan/DBSpan/Metr**: NO/YES(via supabase-tracing if the RSC queries data directly)/NO.
- **Log**: PARTIAL, same baseline.
- **Crumb**: NO structural breadcrumb for RSC specifically (no wrapper equivalent to M1-M3 for server components).
- **Replay**: NO.
- **Prof**: PARTIAL, same baseline.
- **User**: NO structural guarantee — M4's `scrubPii`/tagging runs on the EVENT, not on setting `scope.setUser`, and RSC failures have no wrapper to call `setUser` before the throw.
- **Tags**: YES — `sport` auto-tag via M4's URL-based fallback, same mechanism as row 7.
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: no per-RSC-page classification beyond M4's generic fallback; a slow or repeatedly-failing specific page has no dedicated span/breadcrumb trail the way a golf round action does via `spans.ts`.

### 9. Node process rejection (`unhandledRejection`)
- **Err**: YES, but see Blind spot — **double-captured**. `register-process-error-handlers.ts:77` calls `Sentry.captureException(error)` directly, THEN `logProcessErrorToBridge` (`:78-82`) → `logServerException(error, {action:'process.unhandledRejection', source:'background_job', handled:false, ...}, 'error')` with **no `skipSentry: true`** — and `logServerException` unconditionally calls `Sentry.captureException` again inside `captureSentryTrace` (`server-error-logger.ts:595`) whenever `!enriched.skipSentry`. Net: **two Sentry issues per process-level unhandled rejection**, every time.
- **Trc**: NO — no request scope exists at this point (`vercel-wait-until.ts`'s doc comment: "the process-level handlers... have none").
- **BSpan/DBSpan**: NO/NO.
- **Metr**: NO.
- **Log**: PARTIAL, baseline `consoleLoggingIntegration` only if a `console.*` also fires.
- **Crumb**: NO structural breadcrumb for this path.
- **Replay**: NO (server).
- **Prof**: NO (no active span to attribute profile samples to at this call site).
- **User**: NO — no identity available in a process-level handler.
- **Tags**: PARTIAL — only the `action`/`source`/`handled` fields `logServerException` sets as Sentry scope tags via `captureSentryTrace`; no `sport` tag (falls to M4's `beforeSend` URL-based fallback only if the event has a `request.url`, which a process-level capture does not — so `sport` likely resolves to `'unattributed'` via `deriveSportFromUrl(undefined)` → `'unattributed'`, `instrumentation.ts:90`).
- **Rel**: YES (global `Sentry.init` setting).
- **FR**: NO.
- **Mon**: NO.
- **Alrt**: UNKNOWN, but the double-capture means any alert THRESHOLD tuned against Sentry issue COUNT for this class is silently 2x actual incident count.
- **Live?**: NO.
- **Blind spot**: pass `skipSentry: true` to the `logServerException` call inside `logProcessErrorToBridge` (`register-process-error-handlers.ts:55-58`), since the direct `Sentry.captureException` calls at `:77` and `:87` already cover the Sentry side — the Bridge write should be DB-only for this path. Same fix applies to row 10 below (`handleUncaughtException`, symmetric bug at `:86-89`).

### 10. Node uncaught exception
Same structure and same double-capture bug as row 9 — `register-process-error-handlers.ts:86-89` (`handleUncaughtException`) is byte-for-byte the same pattern as `handleUnhandledRejection`. All column values and the Blind spot are identical to row 9.

### 11. Middleware/proxy failure
**Crumb/User UNKNOWNs resolved by a full read 2026-09-03 (Sentry coverage-gaps pass) — the file is only 154 lines; reading it in full took less effort than the two prior passes' grep-only spot checks.**
- **Err**: YES — `src/proxy.ts` (Next 16's renamed `middleware.ts`) calls `Sentry.captureException(error, {...})` directly at two sites (`src/proxy.ts:89,112`), plus a fallback `fetch` to `/api/internal/log-server-error` gated on `INTERNAL_LOG_KEY` (`:119-128`) for the Bridge DB write — the same edge-runtime fallback pattern M4 uses (`instrumentation.ts:452-468`), since Edge routes can't statically pull in `server-error-logger.ts`'s Node-only admin-client dependency.
- **Trc**: PARTIAL — Edge runtime has its own `Sentry.init` (`instrumentation.ts:307-328`) with `tracesSampler`; whether the proxy specifically opens/inherits a trace was not independently traced.
- **BSpan/DBSpan/Metr**: NO/NO/NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: NO (was UNKNOWN) — confirmed by full read: neither capture site calls `Sentry.addBreadcrumb`; only Sentry's own default Edge integrations apply. **Not treated as a gap to close**: this file runs on every request before any auth resolution, so there is no request-specific state worth breadcrumbing beyond what the exception's own stack/message already carries — adding one would be a cosmetic change, not new signal.
- **Replay**: NO (server/edge).
- **Prof**: NO (Edge runtime — `nodeProfilingIntegration` is explicitly Node-only, gated `NEXT_RUNTIME === 'nodejs'` at `instrumentation.ts:218`).
- **User**: N/A (was UNKNOWN) — confirmed by full read: NEITHER capture site has a resolved user identity available. The `:89` site fires when `updateSession` throws BEFORE `auth.getUser()` (a config error); the `:112` site fires when `updateSession` itself failed to establish a session. There is no identity to attach at either point — this is a structural property of the failure modes, not a missing `scope.setUser` call.
- **Tags**: PARTIAL — `sport` auto-tag applies via the shared `scrubPii`/`beforeSend` (Edge `Sentry.init` also sets `beforeSend: scrubPii`, `instrumentation.ts:320`).
- **Rel**: YES.
- **FR**: NO.
- **Mon**: NO.
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: **RESOLVED — the two sites are deliberately different failure classes, confirmed by full read, not UNKNOWN.** `:89` is `isConfigError` (missing/placeholder Supabase env vars) — FAILS CLOSED, `level:'fatal'`, `tags:{middleware_failure:'config'}`, returns a 500 rather than silently disabling every route's session validation. `:112` is a genuinely transient session-update failure (excluding the separately-classified, expected "stale refresh token" case at `:104-105`, which correctly stays a `console.warn` with no Sentry call at all) — FAILS OPEN, `level:'warning'`, `tags:{middleware_failure:'transient'}`, request continues with no session so a temporary Supabase/GoTrue blip doesn't lock out every signed-in user. Both are well-reasoned, already-shipped design, not gaps.

### 12. Supabase query
- **Err**: PARTIAL — a thrown/rejected query surfaces through whatever wraps the call site (M1/M2/M3 for actions; ad hoc elsewhere); a RESOLVED `{error}` shape (the common PostgREST failure mode) is only captured if the caller explicitly checks `.error` and reports it — no structural guarantee.
- **Trc**: NO — not applicable at the query level beyond DBSpan below.
- **BSpan**: NO.
- **DBSpan**: YES — `withSupabaseTracing` wraps every one of the "five factories" the file's own header enumerates (browser, SSR, service-role, proxy/edge, rate-limiter) via `Sentry.instrumentSupabaseClient(client, {sendOperationData:false})` (`supabase-tracing.ts:115-126`), guarded by `isInstrumentableSupabaseClient` so a mocked test double is never patched.
- **Metr**: NO.
- **Log**: NO structural.
- **Crumb**: PARTIAL — Sentry's Supabase integration itself may add breadcrumbs per its own defaults; not independently confirmed from the `.d.ts` (would need the integration's runtime behavior, not just its type signature).
- **Replay**: N/A (server).
- **Prof**: PARTIAL, same baseline as row 5.
- **User**: N/A at this layer (set by the enclosing action wrapper, if any).
- **Tags**: N/A at this layer.
- **Rel**: YES (global).
- **FR**: PARTIAL — `spans.ts`'s `roundStage`/`describeDbErrorForSpan` attach the Postgres `code`/`error_type` (not message/details/hint — deliberately, per that file's own comment, `spans.ts:70-87`) onto the SPAN when a golf round-tracking call uses `roundStage`; most other Supabase call sites get only the generic DB span from `withSupabaseTracing`, no code-level attribute enrichment.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: span DESCRIPTION never carries filter values or mutation bodies (`sendOperationData: false`, verified as the deliberate, audited privacy choice — see `supabase-tracing.ts:25-51`'s own header, cross-checked against the SDK verification doc's `supabaseIntegration`/`instrumentSupabaseClient` row). This is a correct privacy choice, not a gap — noted so it is not later "fixed" into a leak.

### 13. Supabase RPC
Same as row 12 — `instrumentSupabaseClient` wraps RPC calls identically to query builders (per the SDK's own `SupabaseClientInstance`/`PostgRESTQueryBuilder` types, which don't distinguish). `roundStage` (`spans.ts:164-223`) is specifically built around RPC-shaped responses (`save_partial_round_atomic`-style `{data:{success,error},error}`), so golf's RPC-heavy round-save path has the BEST DBSpan+FR coverage of any row in this table; other sports' RPCs get only the generic DBSpan.

### 14. Postgres SQLSTATE / error code
- **Err**: YES — `fingerprintByPostgresCode` (`instrumentation.ts:158-177`) re-groups any event carrying a recognizable `PGRSTnnn`/5-char SQLSTATE code onto `pg:<code>` as a secondary fingerprint axis, applied in `beforeSend` (`:212`) so it runs on EVERY event, not just ones explicitly tagged.
- **Trc/BSpan**: N/A at this granularity.
- **DBSpan**: YES — `describeDbErrorForSpan` (`spans.ts:80-87`) attaches `error_code`/`error_type` to the span when used via `roundStage`.
- **Metr**: NO — no counter tracks "how often does 42501 fire" as a `Sentry.metrics.count` (would require adding one; the mechanism to do so exists per the SDK doc, unused).
- **Log/Crumb/Replay/Prof**: baseline, no code-specific enrichment beyond the fingerprint/tag.
- **User**: N/A at this layer.
- **Tags**: YES — `pg_code` tag set in `fingerprintByPostgresCode`'s output (`instrumentation.ts:172`) AND separately `errorCode`/`pg_error_code` tag set by `server-error-logger.ts`'s `captureSentryTrace` (`:559`) when the caller passes `context.errorCode`.
- **Rel**: YES (global).
- **FR**: PARTIAL, same as rows 12/13.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: none identified — this is one of the more deliberately-engineered rows in the codebase (the fingerprinting function's own comment cites a real production case: "one Inngest key mismatch occupies four fingerprints").
- **Sibling rule (added 2026-09-06)**: `fingerprintSupabaseKeyError` in `instrumentation.ts`, wired into the same `beforeSend` pipeline immediately before `fingerprintByPostgresCode`. On 2026-09-06 21:27-21:43 UTC the owner disabled Supabase legacy API keys while Vercel still held one, and "Legacy API keys are disabled" / "Invalid API key" fired from at least four unrelated call paths (`POST /golf/login`, `recordDeployMarker`, the presence heartbeat RPC, a `bridge_write_failed` follow-on), each landing as its own issue. The rule matches either message anywhere in `event.exception.values[].value` or `event.message` (including wrapped, e.g. the heartbeat's `msg=...` form), case-insensitively, and sets fingerprint `['{{ default }}', 'supabase:legacy-keys-disabled']` (tag `supabase_key_error: legacy_disabled`) or `['{{ default }}', 'supabase:invalid-api-key']` (tag `supabase_key_error: invalid`) — never overriding an existing deliberate fingerprint. Unit tests: `src/test/observability/instrumentation-fingerprint.test.ts`. The permanent fix (rotating Vercel's key) is the owner's; this only keeps every occurrence of the same root cause in one issue while it's live.

### 15. Authentication failure
- **Err**: PARTIAL — Supabase auth errors are NOT blanket-suppressed (the `instrumentation.ts:45-49` comment explicitly documents a past regression where `'AuthApiError'` was over-broadly ignored and was narrowed to just refresh-token-expiry noise); genuine auth failures (wrong password, locked account, expired invite) DO reach Sentry as intended. M1/M2/M3's own AUTH-resolution throws (`LiftingUnauthorizedError` etc.) are the SEPARATE control-flow class covered in row 5/6's Blind spot.
- **Trc/BSpan/DBSpan**: NO/NO/PARTIAL (auth calls also go through `withSupabaseTracing`, and per that file's own header the auth half is checked to carry no email/password/token onto spans — `supabase-tracing.ts:47-51`).
- **Metr**: NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: PARTIAL, wrapper-dependent.
- **Replay**: session-dependent, same as row 1 if client-side.
- **Prof**: PARTIAL.
- **User**: PARTIAL — deliberately, an unauthenticated failure by definition often has no resolvable user identity yet.
- **Tags**: PARTIAL.
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: PII — `redact-pii.ts`'s own header names `src/app/baseball/actions/auth.ts:320,471` as sending `{email, ip}` together in metadata on a login/signup failure ("the pair identifies a person and where they were") — `maskEmails` reduces this to `n***@domain` before it leaves the process (confirmed the masking function exists and is wired into both `beforeSend` hooks), so the CURRENT state is mitigated, not open; flagged here only because it's the authentication row's most PII-relevant fact and belongs in this table for completeness, not because it's unaddressed.

### 16. Golf round create
- **Err**: YES via M1.
- **Trc**: YES via `roundStage` spans (`spans.ts:164-223`), `op: 'golf.round.stage'`.
- **BSpan**: YES — this is `spans.ts`'s primary purpose; stage names like `resolve_player`, `prepare_shots_payload` are application-phase spans distinct from the auto DB spans (per the file's own header, `spans.ts:89-100`).
- **DBSpan**: YES.
- **Metr**: NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: YES via M1.
- **Replay**: NO (server).
- **Prof**: PARTIAL, baseline.
- **User**: YES via M1.
- **Tags**: YES — `sport:'golf'`, `feature: FEATURE_ROUND_TRACKING` (`spans.ts:45,183`).
- **Rel**: YES.
- **FR**: PARTIAL — only when the caller explicitly constructs a `HelmFlightRecorder`; not confirmed as universally wired into every round-create call site (would need to read `src/app/golf/actions/golf.ts`'s round-create function specifically, not done in this pass).
- **Mon**: NO.
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot**: none newly identified beyond FR's partial wiring above; this is one of the best-covered rows in the table.

### 17. Golf round autosave
- **Err**: YES via M1/`spans.ts`.
- **Trc**: YES — `roundStage`'s `classifyAutosaveOutcome` (`spans.ts:147-162`) is purpose-built for autosave's `{data:{success,error},error}` RPC shape, classifying `busy`/`conflict` as expected outcomes (not errors) on the SPAN's `result` attribute — the most granular per-outcome tagging in the whole table.
- **BSpan**: YES.
- **DBSpan**: YES.
- **Metr**: NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: YES via M1 if the autosave path is itself wrapped in `withGolfAction`; UNKNOWN without re-reading the specific autosave call site (not done this pass).
- **Replay**: NO.
- **Prof**: PARTIAL.
- **User**: YES if wrapped.
- **Tags**: YES, same as row 16.
- **Rel**: YES.
- **FR**: PARTIAL, same caveat as row 16.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: none newly identified; `unknown_commit` (`spans.ts:117-123`) is a DELIBERATELY conservative outcome for an abort/timeout raced against a commit that may have already succeeded server-side — correctly never guessed, which is the right call for data-integrity but means this specific ambiguous case has no way to become MORE precise without a change to what the RPC itself returns.

### 18. Shot persistence
Same coverage shape as row 17 (`roundStage`'s outcome taxonomy — `RoundStageOutcome` type, `spans.ts:125-133` — is shared across autosave and shot-tracking submit paths per the type's own doc comment: "wherever this vocabulary is used (autosave, submit, and — once wired — the Golf Tracer)"). The "once wired — the Golf Tracer" phrase is itself a flagged gap: it states the vocabulary is NOT YET applied everywhere it's meant to be, in the codebase's own words, not this audit's inference.

### 19. Baseball actions
- **Err**: YES via M2.
- **Trc/BSpan**: PARTIAL — no `spans.ts`-equivalent business-span helper exists under `src/lib/baseball/`; not found in the directories read this pass (would need a `find src/lib/baseball -iname "*span*"` sweep, not done).
- **DBSpan**: YES via `supabase-tracing.ts` (sport-agnostic).
- **Metr**: NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: YES via M2 (per its header doc).
- **Replay**: NO.
- **Prof**: PARTIAL.
- **User**: YES via M2.
- **Tags**: YES — `sport:'baseball'` + `feature`/`action` via M2.
- **Rel**: YES.
- **FR**: NO — `HelmFlightRecorder`/`golf-round-flight-workflow.ts` are explicitly golf-round-shaped (`GolfRoundWorkflow` type, `golf-round-flight-workflow.ts` filename itself) with no baseball equivalent found.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: no business-span layer for baseball comparable to golf's `spans.ts` — UNKNOWN whether that's a real gap or simply unneeded (would need to know whether any baseball workflow has round/save-multi-stage complexity comparable to a golf round; not assessed).

### 20. Lifting actions
- **Err**: YES via M3, WITH the duplicate-capture bug described in M3's own row and Findings §(b)/(c) for the three typed control-flow classes.
- **Trc/BSpan**: NO equivalent business-span helper found under `src/lib/lifting/`.
- **DBSpan**: YES, sport-agnostic.
- **Metr**: NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: YES via M3.
- **Replay**: NO.
- **Prof**: PARTIAL.
- **User**: YES via M3.
- **Tags**: YES — `sport:'lifting'` + `feature` via M3.
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot**: the M3 duplicate-capture bug (see M3 row) is THE finding for this row — every routine "not signed in"/"no org"/"forbidden" Lifting action currently pages exactly the way the codebase's own `sharedIgnoreErrors` comment (`instrumentation.ts:51-70`) says it deliberately does NOT want for the equivalent Baseball/Golf classes.

### 21. CoachHelm request (chat turn)
**RE-VERIFIED 2026-09-03 (Sentry coverage-gaps pass) — Phase C Deliverable 5 closed the Trc/Metr gap this row originally found; the matrix cells below were stale (still described the pre-Deliverable-5 code). The finding stands as history; the verdicts are corrected.**
- **Err**: YES — `src/app/api/coachhelm/v3/chat/stream/route.ts` calls `logServerError`/`logServerEvent` at specific gate failures (e.g. `:262-264`, conversation-id-unresolved).
- **Trc**: YES (was NO) — `streamText({...})` now sets `experimental_telemetry: { isEnabled: true, functionId: 'coachhelm.chat', recordInputs: false, recordOutputs: false }` (`chat/stream/route.ts:400`), and the global `vercelAIIntegration` default was flipped to match (`instrumentation.ts`). `Sentry.setConversationId(convId)` also wired (`:324`).
- **BSpan**: PARTIAL — the route has its own hand-built measurement/audit machinery (`measurements`, `seriesAll`, `auditNumericClaims` per the file's imports) that is NOT Sentry-based; it's a separate correctness-auditing system, not observability in the Sentry sense.
- **DBSpan**: YES for whatever Supabase calls the route/its tools make, via `supabase-tracing.ts`.
- **Metr**: YES (was NO) — `recordAi()` (`metrics.ts`) called on both success and failure paths (`chat/stream/route.ts:136,534`).
- **Log**: PARTIAL, baseline; token usage/cost is tracked in `golf_coachhelm_llm_calls` (a DB table per the file's own header comment), not a Sentry metric.
- **Crumb**: UNKNOWN — not confirmed whether the route opens its own `Sentry.withScope`/breadcrumbs; not found in the portion read.
- **Replay**: client-side only, for the UI shell around the stream, not the model call itself.
- **Prof**: PARTIAL (was NO) — an AI SDK span is now emitted (`experimental_telemetry.isEnabled`), so the Node profiler has something to attribute LLM-call time to when a session is sampled for profiling.
- **User**: PARTIAL — `ctx.coach_id` is resolved (per the file's imports/comments) but not confirmed as passed to `scope.setUser`.
- **Tags**: PARTIAL, same uncertainty.
- **Rel**: YES (global).
- **FR**: NO — CoachHelm has no Flight-Recorder-equivalent workflow tracer; that mechanism is golf-round-specific.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: **RESOLVED 2026-09-03 — the PII risk this row's original finding warned about did not materialize.** The moment `experimental_telemetry.isEnabled` was actually turned on (Deliverable 5, same change), the same commit explicitly set `recordInputs: false, recordOutputs: false` per-call AND flipped the global `vercelAIIntegration({recordInputs:false, recordOutputs:false})` default in `instrumentation.ts` — closing the exact "one line away from recording every prompt/output body" gap this row originally flagged, in the same change that opened the gap. Re-verified by reading both files directly, not by trusting the ledger. `hero-narrative.ts`/`round-review.ts`/`schedule-vision.ts`'s prompt interpolation is unchanged (still names/schedule-image content in the prompt), but none of it reaches Sentry because both flags are explicitly false at every call site.

### 22. CoachHelm tool call
**CLOSED 2026-09-03 (Sentry coverage-gaps pass).** All five sites Findings §(e) named (`agent-tools.ts:163,240,269,549,573`) now call `logServerError` — the `guarded()` read-tool wrapper (takes `toolName`/`ctx` params so it can log which tool and which coach), both `proposeGated`/`executeGated` catches, and their `create_recurring_practice`-specific twins. Severity `'warning'`, `skipSentry: true` when the caught error is an expected control-flow class (`CoachContextError`/`ActionPlanError`/`PracticePlanError`) so an ordinary "could not build that plan" never pages, `skipSentry: false` (reaches Sentry as an Issue) for anything else. `userId: ctx.coach_id` passed for Sentry user context — not a metric/log-field dimension, the same `scope.setUser` mechanism M1/M3 already use. Test: `agent-tools.confirm-gate.test.ts` still passes; no new dedicated test added for this specific change (the existing suite doesn't exercise a thrown-plan-build-error path) — tracked as a NOT VERIFIED gap in the closing PR, not silently skipped.
- **Err**: YES (was PARTIAL) — see above.
- **Trc**: NO, same `experimental_telemetry` gap as row 21 — tool-call spans, if the AI SDK's tool-calling machinery emits its own OTel spans independent of `vercelAIIntegration`'s opt-in, were not independently verified either way. Not closed this pass (out of scope — row 21's fix was at the `streamText` call, not the tool layer).
- **BSpan/DBSpan/Metr**: NO/PARTIAL(DB calls the tool makes)/NO. Metr not added — `agent-tools.ts`'s failures are already covered by `logServerError`'s Bridge row + Sentry Issue; a `Metr` dimension here would need a new cardinality-safe "tool name" vocabulary decision this pass did not make.
- **Log/Crumb/Replay/Prof**: baseline/UNKNOWN/N/A/NO.
- **User/Tags/Rel**: YES (was PARTIAL, via the new `logServerError` calls)/PARTIAL/YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.

### 23. Background job (generic, non-cron async work)
Covered by rows 9/10 (process-level) when the failure escapes to a process handler, or by whatever wrapper the specific job uses otherwise — no single universal "background job" mechanism exists distinct from the cron-route and Inngest-function rows below. `logProcessErrorToBridge`'s context explicitly tags `source: 'background_job'` (`register-process-error-handlers.ts:57`) confirming this IS the intended umbrella classification for anything that isn't a request-scoped failure.

### 24. Vercel cron
- **Err**: PARTIAL — individual cron routes largely DO call `logServerError`/`logServerEvent` for their own failure paths (verified directly: `admin-digest`, `event-reminders`, `coachhelm-validation`, `helm-debug-prune`, `ingest-gmail-replies` all reference `background_job_logs` and/or `logServer*`); coverage per-route was not exhaustively re-verified for all 19.
- **Trc**: NO structural per-cron trace via `automaticVercelMonitors` (deliberately still `false` — see Mon below), but this is now moot for the missed-check-in class Mon covers.
- **BSpan/DBSpan/Metr**: NO/YES(via supabase-tracing for whichever queries the job runs)/NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: route-dependent, not structural.
- **Replay**: NO.
- **Prof**: PARTIAL, baseline.
- **User**: N/A (no end-user in a cron context; `sport` still tagged via M4's `deriveSportFromUrl`, which specifically special-cases `/api/cron` paths to `'cron'` rather than falling into `'marketing'`, `instrumentation.ts:94`).
- **Tags**: YES for `sport:'cron'` specifically because of that `deriveSportFromUrl` special case — the file's own comment (`:76-86`) documents this was a REAL production bug once (`event-reminders` mistagged `marketing`) and is now fixed.
- **Rel**: YES.
- **FR**: NO.
- **Mon**: **YES (was NO) — CLOSED by Phase C Deliverable 3, re-verified 2026-09-03.** `src/lib/observability/cron-monitors.ts` (`shouldEmitCronCheckIns`, `resolveCronMonitorSlug`, `resolveCronMonitorConfig` — never returns undefined, unregistered jobs get a conservative fallback config, `startCronCheckIn`/`finishCronCheckIn`, all fail-open) is wired into `recordJobRun` (`src/lib/admin/job-log.ts`) at all 3 exit paths (success, resolved 4xx/5xx Response, thrown error) and into Inngest's `withBridgeLogging`. `CronRegistryEntry.schedule` is contract-tested byte-exact against `vercel.json` so a monitor's expected cadence can never silently drift from what Vercel actually runs. `automaticVercelMonitors` was deliberately left `false` (not re-activated) after re-reading the installed SDK's build-time source showed it would inject a SECOND, independent Cron Monitor mechanism alongside the manual check-ins — see `docs/observability/SENTRY_CRON_MONITORS.md`'s decision record. This also resolves the `ingest-gmail-replies` self-built substitute noted below: the real mechanism now exists, the ad hoc one is no longer the only signal (not removed this pass — a fail-soft self-throttle isn't harmful to also keep).
- **Alrt**: UNKNOWN, re-checked 2026-09-06 now that the read-only Sentry MCP is an allowed tool (`mcp__7524981b-0003-40de-9f86-c5275420784a__*` — the UUID spelling; see the note below this table's header about the rotated display name). `find_organizations` confirmed org `helm-xs` is reachable. `get_sentry_resource` was then tried against the detector/workflow ids `docs/operations/SENTRY_MONITORS.md` records (e.g. detector `7702315`, workflow `3937972`), both as `resourceType: "detector"` / `"workflow"` and as a direct organization URL (`https://helm-xs.sentry.io/organizations/helm-xs/detectors/`) — both attempts returned `Input validation error: resourceType: Invalid input` and `Could not determine resource type from URL`, respectively. The tool's own error message names its full supported set: issues, events, traces, agent conversations, profiles, replays, monitors (cron check-ins, a different object from alert detectors), and releases — detectors and workflows are not among them. So this pass could reach the Sentry org but could NOT enumerate alert-rule/workflow config through the five sanctioned read tools; confirming live routing still requires the Sentry web dashboard or a differently-scoped API path, same conclusion as the prior pass, now with the actual attempted calls on record instead of "not checked."
- **Live?**: NO.
- **Blind spot / action**: none remaining for the missed-check-in class. The `withSentryConfig` App-Router-support caveat (`docs/guides/SENTRY_SETUP_GUIDE.md:225`) is moot — Deliverable 3's approach was manual `captureCheckIn`-style check-ins via `cron-monitors.ts`, not `automaticVercelMonitors`, specifically because that auto-instrumentation's App Router support was in doubt. The 19-registered/5-orphan route count (Findings §(d)) is unchanged by this fix; the 2 genuine undocumented orphans (`v3/ingest-sync`, `v3/weekly-coach-email`) still have no `vercel.json` entry and therefore no monitor either — OWNER ACTION (or a follow-up PR) to decide whether they should be scheduled at all before wiring a monitor for a job that never runs on a schedule.

### 25. Inngest job
- **Err**: YES, confirmed by follow-up read (Findings §(d)) — all three functions (`weeklyHealthPing` id `weekly-health-ping`, `healthPing` id `inngest-health-probe`, `onCoachHelmRoundSubmitted` id `coachhelm-round-submitted`; `functions.ts:57,106,172`) register an `onFailure` handler (`:62,110,182`) that calls `logServerException(..., 'error')` — per-run failure IS reported. What is NOT covered (same asymmetry as row 24): a run that never happens at all.
- **Trc**: UNKNOWN — Inngest has its own step/run tracing (its dashboard), separate from Sentry; whether Sentry additionally instruments Inngest function bodies was not checked (no Inngest-specific Sentry integration found in the SDK verification sweep — Inngest is not one of the auto-instrumented libraries in the server export list, e.g. no `inngestIntegration` export exists).
- **BSpan/DBSpan/Metr**: NO/PARTIAL(if the function queries Supabase)/NO.
- **Log/Crumb/Replay/Prof**: baseline/UNKNOWN/N/A/PARTIAL.
- **User/Tags/Rel**: UNKNOWN/UNKNOWN/YES.
- **FR**: NO.
- **Mon**: NO (Sentry Cron Monitors don't apply to Inngest's own event/cron-triggered functions the way they would to a Vercel-cron route — Inngest has its own scheduling visibility, not audited here).
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: `project/helmv3_inngest_credentials_dead` (this session's own memory) already establishes both Inngest keys are currently REJECTED and rounds fall back — worth cross-referencing in Phase B, since it means this row's real-world relevance may currently be "jobs aren't running at all," a state `instrumentation.ts:277-294`'s `reportInngestCredentialFault('startup')` DOES specifically detect and Bridge-report (confirmed: that call is real code, not speculative) — so the CREDENTIAL failure mode is covered even though per-job-body error handling wasn't individually audited.

### 26. Push notification
**Err CLOSED further 2026-09-03 (Sentry coverage-gaps pass), on top of Phase C Deliverable 6's `recordPush`/`helmLog` wiring.**
- **Err**: YES (was PARTIAL) — `push.ts`'s token-read failure and total-rejection paths already called `logServerError`. This pass closed the remaining three console.error-only sites Findings §(d) named: the per-device `invoke`-failure branch now also calls `logServerEvent` (warning, `skipSentry:true` — high-volume/expected, kept off the Issues stream, still a Bridge row), the per-token thrown-exception catch now calls `logServerException` (warning), and the outermost function catch now calls `logServerException` (error — the most severe failure class in this function). The separate, narrower `src/lib/coachhelm/v3/foundation/push.ts` (used only by `task-reminders.ts`) is unchanged — still silent at its own layer but covered end-to-end by its one caller wrapping it in `logServerError`, same as originally found.
- **Trc/BSpan/DBSpan**: NO/NO/PARTIAL(subscription lookups).
- **Metr**: YES (was NO) — Phase C Deliverable 6 added `recordPush()` (`metrics.ts`) at every attempted-delivery outcome branch (opted-out, no-devices, token-read-failed, no-device-accepted, success, exception); verified live via `src/test/notifications/push-observability.test.ts`.
- **Log**: YES (was PARTIAL) — same Deliverable 6 change added one `helmLog` line per outcome branch (`push.send_finished`/`push.send_skipped`), which reaches the Sentry Logs stream (`enableLogs: true`), not just the console-forwarding baseline.
- **Crumb**: UNKNOWN, not traced into `push.ts`'s internals. Not closed this pass.
- **Replay**: N/A (server).
- **Prof**: PARTIAL.
- **User**: PARTIAL — the recipient `userId` is now passed as a `logServerError`/`logServerEvent`/`logServerException` context field at every site this pass touched (→ Sentry `scope.setUser` via `server-error-logger.ts`'s existing mechanism), but whether the SUCCESS path also sets it was not separately confirmed.
- **Tags**: UNKNOWN.
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: Test coverage for this pass's three new call sites: the per-device invoke-failure branch has full test coverage (4 existing `push.test.ts` cases updated to assert on it, still green). The per-token exception catch and the outermost catch do NOT have dedicated new tests — `push.test.ts`'s fixture doesn't have a clean way to force `functions.invoke` to throw per-token vs. resolve with an error, or to force an exception ahead of the token loop, without deeper fixture work this pass didn't do. Tracked as NOT VERIFIED, not silently skipped. Separately, and unrelated to this pass: `push.ts:266-276`'s own comment (dated 2026-08-26) still confirms the `send-fcm-push` Edge Function Android tokens route through **is not deployed in production** — tracked as `RISK-041` in `docs/qa/helm-bug-risk-register.md`, unchanged, OWNER ACTION (deploy the edge function).

### 27. Outbound external API call (third-party fetch)
- **Err**: PARTIAL — highly call-site-dependent; `admin-digest`'s `fetchShippedYesterday` (`src/app/api/cron/admin-digest/route.ts:30-53`) is a well-designed example (distinguishes `undefined`="couldn't ask" from `[]`="asked, nothing found", per its own comment, and fails soft with no Sentry call — a DELIBERATE choice since the daily digest email itself is the human-facing signal). `provider-fault.ts` (`src/lib/admin/provider-fault.ts`) exists specifically to classify third-party/provider faults (`vercel_ai_gateway` pattern match at `:108` confirmed) — this is the closest thing to a structural mechanism for this row, though its own alerting path was not traced end-to-end.
- **Trc**: NO structural (each outbound fetch is not automatically spanned unless the caller wraps it — `httpIntegration`/`httpServerIntegration` exist server-side per the SDK doc but were not confirmed as added to either `integrations: [...]` array; likely relying on Sentry's own default integration set, unverified).
- **BSpan/DBSpan/Metr**: NO/NO/NO.
- **Log/Crumb/Replay/Prof**: baseline/UNKNOWN/N/A/PARTIAL.
- **User/Tags/Rel**: N/A/PARTIAL(via `provider-fault.ts` classification tags, if wired to Sentry — not confirmed)/YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: UNKNOWN in aggregate — this is the least structurally-covered row in the table, since "outbound external API call" spans dozens of call sites (GitHub API, Gmail API, AI Gateway, push providers, Resend) each with its own ad hoc handling rather than one shared wrapper the way M1-M4 cover server actions. What would prove it: an inventory of every `fetch(` call site outside the audited action/cron files, not attempted — explicitly out of Phase A's budget, flagged as the single highest-value target for a Phase B structural fix (a shared `fetchExternal()` wrapper analogous to M1-M4).

### 28. Deployment/release
- **Err**: N/A (not an error-class row).
- **Trc**: N/A.
- **BSpan/DBSpan/Metr**: NO/NO/NO.
- **Log**: NO.
- **Crumb**: N/A.
- **Replay**: N/A.
- **Prof**: N/A.
- **User**: N/A.
- **Tags**: YES — `sha`/`ref`/`author` on the `admin_events` row (`deploy-marker.ts:35-39`).
- **Rel**: YES — this IS the release-correlation mechanism: `recordDeployMarker()` (`deploy-marker.ts:12-53`) writes one `admin_events` row per production SHA, detected at server boot from Vercel system env, deduplicated by SHA, fire-and-forget (`catch {}` at `:51-53`, explicitly "Never fail boot for a marker").
- **FR**: NO.
- **Mon**: NO.
- **Alrt**: N/A.
- **Live?**: NO.
- **Blind spot / action**: this marker is `admin_events`-only — it does NOT call `Sentry.captureCheckIn`/create a Sentry Release marker beyond what `withSentryConfig`'s build-time `release: {name, setCommits, deploy}` config (`next.config.mjs:415-434`) already does at BUILD time (separately, and correctly — that's the actual Sentry Release object). The two mechanisms are complementary, not duplicative, but nothing CORRELATES the `admin_events` deploy-marker row to the Sentry Release by anything other than matching the same `sha` string by eye; no automated cross-link. Also: this marker fires only `if (process.env.VERCEL_ENV !== 'production' || !sha) return;` — i.e., it is production-only by design, so Preview deploys get no `admin_events` marker at all (correct scope, noted for completeness).

### 29. UI interaction latency
- **Err**: N/A.
- **Trc**: YES — `browserTracingIntegration()` (`instrumentation-client.ts:78`) is Sentry's standard mechanism for this exact class (page loads, navigations, and interaction spans it auto-instruments).
- **BSpan/DBSpan**: NO/NO (client-side, no DB access from here).
- **Metr**: NO.
- **Log**: NO.
- **Crumb**: YES (default browser breadcrumbs).
- **Replay**: YES — same `replaysSessionSampleRate: isDev?0:0.1` (`:70`) captures a general 10% sample regardless of error, which is the mechanism that actually lets a human WATCH a slow interaction, not just see a number.
- **Prof**: NO (no browser profiling integration configured, per the SDK verification doc's note that `browserProfilingIntegration` exists but isn't added).
- **User**: PARTIAL, session-dependent.
- **Tags**: YES, `sport` auto-tag.
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: `tracesSampleRate: isDev?0.1:0.2` (`instrumentation-client.ts:63`) means 80% of production page-load/interaction traces are simply never sampled — a real, deliberate cost/coverage tradeoff (documented rationale in `instrumentation.ts`'s server-side `makeTracesSampler` comment, which explains the SAME tradeoff for the server half, `:107-125`), not a bug, but worth naming explicitly since it means most individual slow-interaction reports will have NO trace to actually diagnose them, only the aggregate performance dashboard the 20% sample feeds.
