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
the commander: `mcp__claude_ai_Sentry__*` tools are present in this session's
tool list and `.claude/rules/shipping.md` names the Sentry MCP (org
`helm-xs`) as a working read path — so live verification is technically
reachable from a differently-scoped Phase A run, but this run did not use it,
per the brief's explicit instruction to leave "Live verified?" at NO
throughout and let the commander do that check.

## Shared mechanisms — defined once, cited by shorthand in the table

| ID | Mechanism | Anchor |
|---|---|---|
| **M1** | `withGolfAction` / `captureGolfActionError` — golf server-action wrapper: `Sentry.withScope` tags (`sport`, `feature_area`, `feature`, `action`), start/done breadcrumbs, `scope.setUser`, classify → `maybeCaptureRlsDenial` → `logServerException`, one admin_events/error_logs row per failure (never two — `capturedAsRlsDenial` gates the fallback). No custom span; no metric. | `src/lib/golf/with-golf-action.ts:401-493` (wrapper), `:243-315` (log sequence), `:362-384` (`captureGolfActionError`) |
| **M2** | `withBaseballAction` — baseball's heavier wrapper: resolves AUTH + active-team CONTEXT + CAPABILITY server-side, same Sentry-scope/breadcrumb/`logServerException` shape as M1, plus a **fixed allowlist** of typed control-flow error classes (`BaseballUnauthorizedError`, `BaseballNoActiveTeamError`, `BaseballCapabilityError`, `BaseballDisabledSourceError`, `BaseballDemoReadOnlyError`) that are logged as handled warnings (`skipSentry`) then **re-thrown** so callers can branch. | `src/lib/baseball/with-baseball-action.ts:1-90` (header + imports), full catch/re-throw logic beyond line 90 not re-read in full for this pass — structure confirmed via header doc + `sharedIgnoreErrors` cross-reference below |
| **M3** | `withLiftingAction` — lifting's wrapper: AUTH → ORG-CONTEXT → EDIT-GATE, same Sentry-scope shape, typed control-flow classes (`LiftingUnauthorizedError`, `LiftingNoOrgError`, `LiftingForbiddenError`) logged via `logServerEvent(..., skipSentry: true, ...)` then **re-thrown**. **Unlike M2's classes, none of M3's three class names appear in `sharedIgnoreErrors`** — see the Findings doc §(b)/(c), this is a live duplicate-capture bug, not just a documented pattern. | `src/lib/lifting/with-lifting-action.ts:113-230`, esp. `:195-215` |
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
- **FR**: PARTIAL — only golf round-tracking workflows that explicitly construct a `HelmFlightRecorder` get `sentry_trace_id`/`root_span_id` correlation (`helm-flight-recorder.ts:224-225`); most action files never touch the flight recorder.
- **Mon**: NO (not a scheduled job).
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot**: `withLiftingAction`'s three typed control-flow classes are **not** Sentry-`ignoreErrors`-suppressed the way Baseball's/Golf's equivalents are (M3 note above) — every "not signed in"/"no org"/"forbidden" Lifting Lab action mints a duplicate, alertable Sentry issue on top of the correctly-suppressed Bridge row. See Findings §(b)/(c).

### 6. Handled server action failure (expected/soft failure, `{success:false}` returned)
- **Err**: PARTIAL — M1/M2/M3's classifier (`classifySoftFailure`/allowlist) routes expected failures to `logServerEvent`/`logServerException` with `skipSentry: true` — correctly NOT an Issue — but the catch-block sweep in Findings §(e) found ~15-20 individual catch sites in `src/app/golf/actions/golf.ts` and elsewhere that return a generic `{success:false, error:'Failed to ...'}` **without** going through M1/`formatSafeErrorResponse`/any logger at all (e.g. `golf.ts:5298,5456,5517,5563,...` — see Findings for the verified subset).
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
- **Blind spot**: `/api/health` (row 29-adjacent, see Health/readiness note in Findings §(i)) swallows its own DB-check failure with a bare `catch { database='error'; status='degraded'; }` and **no** `logServerError`/Sentry call (`src/app/api/health/route.ts:22-25`) — a degraded health check is itself invisible to Sentry/Bridge unless something else polls this route and alerts on the JSON body.

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
- **Err**: YES — `src/proxy.ts` (Next 16's renamed `middleware.ts`) calls `Sentry.captureException(error, {...})` directly at two sites (`src/proxy.ts:89,112`), plus a fallback `fetch` to `/api/internal/log-server-error` gated on `INTERNAL_LOG_KEY` (`:119-128`) for the Bridge DB write — the same edge-runtime fallback pattern M4 uses (`instrumentation.ts:452-468`), since Edge routes can't statically pull in `server-error-logger.ts`'s Node-only admin-client dependency.
- **Trc**: PARTIAL — Edge runtime has its own `Sentry.init` (`instrumentation.ts:307-328`) with `tracesSampler`; whether the proxy specifically opens/inherits a trace was not independently traced.
- **BSpan/DBSpan/Metr**: NO/NO/NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: UNKNOWN — not read in enough depth to confirm breadcrumb calls at the two `proxy.ts` capture sites (lines 89 and 112 were located by grep, not read in full context).
- **Replay**: NO (server/edge).
- **Prof**: NO (Edge runtime — `nodeProfilingIntegration` is explicitly Node-only, gated `NEXT_RUNTIME === 'nodejs'` at `instrumentation.ts:218`).
- **User**: UNKNOWN, same reason as Crumb.
- **Tags**: PARTIAL — `sport` auto-tag applies via the shared `scrubPii`/`beforeSend` (Edge `Sentry.init` also sets `beforeSend: scrubPii`, `instrumentation.ts:320`).
- **Rel**: YES.
- **FR**: NO.
- **Mon**: NO.
- **Alrt**: UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: UNKNOWN whether `proxy.ts`'s two capture sites (`:89` vs `:112`) differ in what they cover (e.g. auth-check failure vs. a different failure class) — would need a full read of `src/proxy.ts`, out of scope for this pass; flagging as a specific follow-up rather than guessing.

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
- **Err**: YES — `src/app/api/coachhelm/v3/chat/stream/route.ts` calls `logServerError`/`logServerEvent` at specific gate failures (e.g. `:262-264`, conversation-id-unresolved).
- **Trc**: **NO in practice** — see Findings §(a): `vercelAIIntegration` requires `experimental_telemetry.isEnabled: true` per call, and `streamText({...})` at `chat/stream/route.ts:312` never sets it (confirmed by grep — zero `experimental_telemetry` usage anywhere in `src/`). No AI SDK span is emitted for this call today.
- **BSpan**: PARTIAL — the route has its own hand-built measurement/audit machinery (`measurements`, `seriesAll`, `auditNumericClaims` per the file's imports) that is NOT Sentry-based; it's a separate correctness-auditing system, not observability in the Sentry sense.
- **DBSpan**: YES for whatever Supabase calls the route/its tools make, via `supabase-tracing.ts`.
- **Metr**: NO.
- **Log**: PARTIAL, baseline; token usage/cost is tracked in `golf_coachhelm_llm_calls` (a DB table per the file's own header comment), not a Sentry metric.
- **Crumb**: UNKNOWN — not confirmed whether the route opens its own `Sentry.withScope`/breadcrumbs; not found in the portion read.
- **Replay**: client-side only, for the UI shell around the stream, not the model call itself.
- **Prof**: NO — no active AI SDK span means nothing for the Node profiler to attribute LLM-call time to specifically (general request-handler profiling may still apply if any span exists at all).
- **User**: PARTIAL — `ctx.coach_id` is resolved (per the file's imports/comments) but not confirmed as passed to `scope.setUser`.
- **Tags**: PARTIAL, same uncertainty.
- **Rel**: YES (global).
- **FR**: NO — CoachHelm has no Flight-Recorder-equivalent workflow tracer; that mechanism is golf-round-specific.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: THE core finding of this audit's PII section — see Findings §(a). Prompts to `compose()`/`streamText` interpolate `player_first_name` (`hero-narrative.ts:65`, `round-review.ts:201`) and `schedule-vision.ts:229-240` attaches raw base64 IMAGE data of a student's class schedule screenshot to the `generateObject` `messages` array — none of it currently reaches Sentry only because `experimental_telemetry.isEnabled` is never set; the moment any call site adds that one line (a very plausible future edit — it's the AI SDK's own documented boilerplate), `recordInputs`/`recordOutputs: true` (already configured, `instrumentation.ts:243-246`) activates immediately and starts recording full prompt/output bodies, including that image data, into Sentry.

### 22. CoachHelm tool call
- **Err**: PARTIAL — `agent-tools.ts` catch sites return typed `{status:'failed', message}` envelopes (`src/lib/coachhelm/v3/chat/agent-tools.ts:269,573`) without an accompanying `logServerError`/`Sentry.captureException` in the immediate window read (7-9 line window around each catch) — UNKNOWN whether a caller further up wraps these; not traced beyond the immediate catch block in this pass.
- **Trc**: NO, same `experimental_telemetry` gap as row 21 — tool-call spans, if the AI SDK's tool-calling machinery emits its own OTel spans independent of `vercelAIIntegration`'s opt-in, were not independently verified either way.
- **BSpan/DBSpan/Metr**: NO/PARTIAL(DB calls the tool makes)/NO.
- **Log/Crumb/Replay/Prof**: baseline/UNKNOWN/N/A/NO.
- **User/Tags/Rel**: PARTIAL/PARTIAL/YES, same uncertainty as row 21.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: UNKNOWN in aggregate whether a tool-build failure (`"A plan we cannot build must never produce a Confirm button"`, `agent-tools.ts:240,549`) ever reaches Sentry/Bridge, or is purely a UI-visible `writer.write({type:'data-progress',...})` signal with no server-side telemetry — what would prove it: read `agent-tools.ts` in full and trace every caller of `buildCoachTools`, not attempted in Phase A's budget.

### 23. Background job (generic, non-cron async work)
Covered by rows 9/10 (process-level) when the failure escapes to a process handler, or by whatever wrapper the specific job uses otherwise — no single universal "background job" mechanism exists distinct from the cron-route and Inngest-function rows below. `logProcessErrorToBridge`'s context explicitly tags `source: 'background_job'` (`register-process-error-handlers.ts:57`) confirming this IS the intended umbrella classification for anything that isn't a request-scoped failure.

### 24. Vercel cron
- **Err**: PARTIAL — individual cron routes largely DO call `logServerError`/`logServerEvent` for their own failure paths (verified directly: `admin-digest`, `event-reminders`, `coachhelm-validation`, `helm-debug-prune`, `ingest-gmail-replies` all reference `background_job_logs` and/or `logServer*`); coverage per-route was not exhaustively re-verified for all 19.
- **Trc**: NO structural per-cron trace beyond whatever `Sentry.wrapApiHandlerWithSentryVercelCrons` would provide IF `automaticVercelMonitors` were actually applied — it is not, see Mon below.
- **BSpan/DBSpan/Metr**: NO/YES(via supabase-tracing for whichever queries the job runs)/NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: route-dependent, not structural.
- **Replay**: NO.
- **Prof**: PARTIAL, baseline.
- **User**: N/A (no end-user in a cron context; `sport` still tagged via M4's `deriveSportFromUrl`, which specifically special-cases `/api/cron` paths to `'cron'` rather than falling into `'marketing'`, `instrumentation.ts:94`).
- **Tags**: YES for `sport:'cron'` specifically because of that `deriveSportFromUrl` special case — the file's own comment (`:76-86`) documents this was a REAL production bug once (`event-reminders` mistagged `marketing`) and is now fixed.
- **Rel**: YES.
- **FR**: NO.
- **Mon**: **NO — confirmed dead.** `automaticVercelMonitors: true` is set (`next.config.mjs:454`) but sits in the THIRD argument to `withSentryConfig`, which the installed 10.71.0 runtime (`withSentryConfig(nextConfig, sentryBuildOptions = {})`, exactly two params) never reads — see the SDK verification doc's `withSentryConfig` row. Additionally, grepped `captureCheckIn|withMonitor` across all of `src/` — **zero manual call sites** either. Net: of 19 scheduled Vercel cron jobs (`vercel.json`'s `crons` array, verified count), **none** has ANY Sentry Cron Monitor check-in today — a job that silently stops running (Vercel's own scheduler misfires, or the deployment is paused) produces no Sentry-side "missed check-in" alert, full stop. `background_job_logs` rows are the only cross-invocation signal, and those require someone to be looking (or a job like `ingest-gmail-replies`'s own `alreadyAlertedToday` self-throttled `logServerError` alert — that route built its OWN substitute for cron monitoring, precisely because the real Sentry Cron Monitor feature isn't actually wired).
- **Alrt**: UNKNOWN, but constrained by Mon = NO — no monitor means no "missed check-in" alert class can exist regardless of what alert rules are configured live.
- **Live?**: NO.
- **Blind spot / action**: fix the `withSentryConfig` argument-count bug (Findings §(h)) to re-activate `automaticVercelMonitors`, OR add explicit `Sentry.withMonitor`/`captureCheckIn` calls per cron route as a more targeted fix that doesn't depend on the auto-instrumentation actually supporting App Router route handlers (worth noting: `docs/guides/SENTRY_SETUP_GUIDE.md:225`'s own comment says "Does not yet work with App Router route handlers" for `automaticVercelMonitors` — meaning even fixing the argument bug may not be suffient for THIS repo's all-App-Router cron routes; UNKNOWN without a live test, and worth flagging to the commander as a reason manual `withMonitor` wrapping may be the more reliable Phase B fix regardless of the argument-count bug).

### 25. Inngest job
- **Err**: PARTIAL — `src/lib/inngest/functions.ts` defines three functions (`weeklyHealthPing`, `healthPing`, `onCoachHelmRoundSubmitted`, confirmed via `grep "createFunction" src/lib/inngest/functions.ts`); individual failure-path coverage inside each function body was not read in this pass.
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
- **Err**: PARTIAL — `src/lib/notifications/push.ts`'s `sendPushNotification` (the primary, most-used implementation — callers: `golf-message-fanout.ts`, `dispatch.ts`, `insights.ts`, `announcements.ts` via `sendBulkPushNotification`, `event-reminders` cron, `player-notify.ts`) has its own delivery-failure recording per its test suite's own comments (`src/test/lib/notifications/push.test.ts:30`: "sendPushNotification now records a delivery failure here"), confirming internal handling exists though not read line-by-line. The SEPARATE, narrower `src/lib/coachhelm/v3/foundation/push.ts` implementation (used only by `task-reminders.ts`) returns `{delivered:false, error}` with NO internal Sentry/logServerError call (`foundation/push.ts:132-145`) — but its one caller (`task-reminders.ts:1034,1043`) DOES wrap it with `logServerError`, so this specific path is covered end-to-end despite the library function itself being silent.
- **Trc/BSpan/DBSpan/Metr**: NO/NO/PARTIAL(subscription lookups)/NO.
- **Log**: PARTIAL, baseline.
- **Crumb**: UNKNOWN, not traced into `push.ts`'s internals.
- **Replay**: N/A (server).
- **Prof**: PARTIAL.
- **User**: PARTIAL — the recipient `userId` is available to callers; whether it's set as Sentry scope user was not confirmed.
- **Tags**: UNKNOWN.
- **Rel**: YES.
- **FR**: NO.
- **Mon/Alrt**: NO/UNKNOWN.
- **Live?**: NO.
- **Blind spot / action**: `golf-message-fanout.ts:158` explicitly logs push failures as "(non-fatal)" — correct triage, not a gap. The main open question for Phase B is whether `src/lib/notifications/push.ts`'s internal delivery-failure recording (referenced by its tests) writes to Sentry, `admin_events`, both, or neither — the test file's own comment proves SOMETHING records it but this pass did not open the implementation to confirm which surface. What would prove it: read `src/lib/notifications/push.ts` directly (not done — it was identified but not opened in this pass given time budget).

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
