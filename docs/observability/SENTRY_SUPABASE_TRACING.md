<!-- markdownlint-disable MD013 -->
# Sentry + Supabase tracing

How a Helm request is observed end to end, what is actually wired today, and
what is still a design rather than a system.

Anchor SHA for the "current" claims below: run
`git rev-list --count 0aa66e5bd..HEAD -- 'src/**'` to see how far the code has
moved since this was written.

---

## 1. Three different things that are easy to confuse

These complement each other. None replaces another, and knowing which one is
broken is usually the whole debugging problem.

| Mechanism | What it does | Where it lives |
| --- | --- | --- |
| **Sentry Supabase integration** | Turns supabase-js calls into semantic `db` spans and captures their errors | `src/lib/observability/supabase-tracing.ts` |
| **W3C trace propagation** | Carries ONE trace id across the Helm → Supabase network boundary | `propagateTraceparent` in both `instrumentation*.ts`, `tracePropagation` on each client |
| **Supabase → Sentry Log Drain** | Copies Supabase *platform* logs into Sentry Logs | **Not enabled.** Paid. See §7 |

The first gives you spans. The second gives you a join key. The third gives you
Supabase's own logs next to them.

---

## 2. What is wired today

### Runtimes and where propagation comes from

Sentry only registers a global OpenTelemetry propagator on **two** of the three
runtimes. This single fact drives the whole design:

| Runtime | Sentry OTel propagator | So propagation comes from | supabase-js `tracePropagation` |
| --- | --- | --- | --- |
| Node (server actions, RSC, routes) | Yes — `@sentry/node` `sdk/initOtel.js` | Sentry propagator, read by supabase-js | **Enabled** |
| Middleware/proxy (`src/proxy.ts`) — runs as Node.js on Vercel, confirmed via live runtime logs, not the legacy Edge runtime | Yes — `@sentry/node` `sdk/initOtel.js` | Sentry propagator, read by supabase-js | **Enabled — confirmed same runtime as everything else, see below** |
| Browser | **No** — `@sentry/browser` 10.68.0 contains zero OpenTelemetry references | Sentry's own fetch/XHR instrumentation | **Deliberately off** |

### RESOLVED: does the middleware/proxy runtime share instrumentation.ts's tracing setup on Vercel?

Verified against a real preview deploy (dpl_CDDDPVjnxECMEQrLnHPaeQv2rYTX,
2026-08-25), not inferred. Vercel's runtime logs for actual requests through
`src/proxy.ts` (`GET /golf/login`, the `/api/inngest` preflight) both show
source `serverless-middleware` — Vercel's own log source enum distinguishes
this from `edge-middleware`. Cross-checked twice with different `source`
filters on the query, same result both times.

This matches Vercel's current platform behavior for Next.js Proxy/Middleware:
it runs on the Node.js/Fluid Compute runtime, not the legacy V8-isolate Edge
Runtime, unless a route explicitly opts into `runtime = 'edge'` (this repo's
`src/proxy.ts` does not). That resolves the concern this section used to raise
speculatively: there is no separate Edge isolate for `import
'@supabase/supabase-js/tracing'` to fail to reach — middleware requests run in
the same Node.js instrumentation graph as everything else, registered via
`instrumentation.ts`'s unconditional top-level import.

No crash, no runtime error, and no `console.warn` about a missing tracing
runtime appeared in the logs for either request. `get_runtime_errors` over the
same window returned zero errors.

**Still not directly observed in this pass:** the `traceparent` header on an
actual outbound Supabase request from middleware, and a matching `trace_id` in
a Supabase API Gateway log line — that needs a real authenticated
round-tracking flow (login, add shots, autosave, submit), which needs a real
test account and browser session neither available in this environment. The
runtime-log evidence above answers the *architecture* question (do these two
things share a runtime); it does not replace the end-to-end trace-id match in
§17 of the original brief, which remains the one live check still owed.

## 3. Privacy rules

**Payloads never reach Sentry.** `sendOperationData: false` is passed explicitly
at the single call site in `supabase-tracing.ts`. Verified in
`@sentry/core/build/cjs/integrations/supabase.js` that it gates four separate
paths:

| Path | With the flag false |
| --- | --- |
| span attribute `db.query` | withheld |
| span attribute `db.body` | withheld |
| breadcrumb `data.{query,body}` | withheld |
| `scope.setContext('supabase', …)` on error | withheld |

The span description degrades to `insert(...) from(golf_shots)` and `[redacted]`
in place of filter values — the shape of the operation without its contents.

It is passed **explicitly rather than left to default**, because the default
resolves to `client.getDataCollectionOptions().databaseQueryData` — a *global*
Sentry setting that could otherwise switch payload capture on for the whole app
from somewhere else entirely.

**Auth calls carry no identity.** `instrumentAuthOperation` names spans from
`operation.name` alone (`auth signInWithPassword`, `auth (admin) createUser`)
and never reads `argumentsList`. That is why the service-role client is safe to
instrument.

**Trace headers do not leak to third parties.** supabase-js only tags
`*.supabase.co`, `*.supabase.in`, and `localhost`. Sentry's browser targets are
`[/^\//, <supabase origin>]` — same-origin plus Supabase, nothing else.

**Everything still passes through `redactEventPii`.** Unchanged.

### One behavioural consequence to expect

Instrumenting auth means failed `signInWithPassword` / `signUp` / `verifyOtp`
calls now auto-capture as Sentry exceptions with `mechanism.handled: false`.
Routine wrong-password events will appear that did not before. This is
consistent with the existing deliberate choice in `sharedIgnoreErrors` to keep
real `AuthApiError`s visible (only refresh-token expiry is suppressed), but it
is a volume change worth watching for a day.

---

## 4. Where the trace id actually reaches

Verified against Supabase's current documentation, not assumed:

| Surface | Carries `trace_id`? |
| --- | --- |
| API Gateway logs (PostgREST, Auth, Storage, Realtime) | **Yes** |
| Edge Function logs | **Yes** |
| **Postgres logs** | **No** |

That last row is the gap. Postgres logs are where `submit_round_atomic`'s
internals live, and no amount of client configuration puts a trace id in them.
Closing it requires the design in §9 — it is not something that was left
switched off.

---

## 5. If a round fails — where to look in Sentry

1. **Issues** → filter `sport:golf` and `feature:round_tracking`.
   Both tags are already applied by the existing Bridge pipeline.
2. Open the issue → the **Trace** section links to the full distributed trace.
3. In the trace, expect this shape:
   - the Next.js server-action transaction
   - `db` spans with origin `auto.db.supabase` — one per query/RPC
   - the RPC span, named `insert(...) from(submit_round_atomic)`
     (POST without a `Prefer: resolution=` header classifies as `insert`;
     the "table" is the function name — this is expected, not a bug)

   **If the RPC span is missing but the `.from()` spans above it are present**,
   that is a known, deterministic gap — not evidence the install is broken.
   Sentry patches `PostgrestFilterBuilder.prototype.then` (which is what an RPC
   call uses too) the FIRST time any `.from(...).select()`-style call runs in
   the process. `submitGolfRoundComprehensiveImpl` does call `.from()` before
   its RPC calls, but those calls sit inside conditional branches (existing
   round lookups, qualifier checks) — so on a cold instance whose very first
   Supabase call is the RPC itself, that one request's RPC span is genuinely
   absent while every later request in the same warm instance gets one. Treat
   "some RPC spans, not all" as this lazy-patch behavior, not intermittent
   breakage.
4. **Span attributes** to read: `db.table`, `db.operation`, `db.system`,
   `db.url`, `db.sdk`. There will be no `db.query` or `db.body` — by design.
5. **Replay**: on a browser-origin issue, the Replay is linked from the issue
   page. DOM text stays masked (`maskAllText: true`, unchanged).
6. **Profile**: attached to the server trace when sampled
   (`profileSessionSampleRate` 0.3 prod, `profileLifecycle: 'trace'`).
7. **Release**: the issue's release is `NEXT_PUBLIC_SENTRY_RELEASE` /
   `VERCEL_GIT_COMMIT_SHA`.
8. **Copy the trace id** — that is what you take to Supabase.

## 6. …and where to look in Supabase

1. Dashboard → **Logs** → **Logs Explorer**
   (`/dashboard/project/_/logs-explorer`).
2. Query the API Gateway (edge) logs for the trace id from Sentry.
3. For an Edge Function failure, the Edge Function logs carry the same id.
4. **Postgres logs will not have it.** Pivot on the timestamp window and the
   round id instead.

Reality check: the exact field name and shape for `trace_id` in the Logs
Explorer has **not** been verified against this project's live logs, because
that requires a real deployed request. Treat the queries as a starting point
and confirm the field name on the first live trace (§11).

---

## 7. Supabase → Sentry Log Drain (PAID — needs your approval)

Not enabled. Current, verified pricing:

| Item | Cost |
| --- | --- |
| Plan requirement | **Pro, Team, or Enterprise** (not Free) |
| Per drain | **$0.0822/hour ≈ $60/month** |
| Events | **$0.20 per 1M events** |
| Egress | billed on top |
| **Spend Cap** | **Log Drains are NOT covered by the Spend Cap** |

Separately, Logs Ingest/Query metering is rolling out (5 GB ingest and 1,000 GB
query included; $0.50/GB and $0.002/GB over). Billing enforcement is not yet
live per Supabase's own notice.

**Operator checklist, when you decide to enable it:**

1. Confirm the org plan is Pro or above.
2. Sentry → project settings → copy the **DSN**.
3. Supabase Dashboard → **Project Settings → Log Drains → Add Log Drain →
   Sentry**.
4. Paste the DSN. Save.
5. Verify in Sentry → **Explore → Logs** (`sentry.io/explore/logs/`).
6. Budget check after 24h on the org usage page.

**Caveat that changes what you can expect:** Supabase states that ingesting its
logs as Sentry **errors is not supported** — they arrive as Sentry **Logs**
only. Log-drain data therefore cannot raise Sentry Issues or alerts that key off
issues; alerting on it must be built on Logs.

**Rollback:** delete the drain in the same screen. Billing is per-hour in
arrears and stops at removal.

---

## 8. Sampling strategy

Currently unchanged at 0.2 prod / 0.1 dev, deliberately — your instruction was
not to raise global sampling without approval, and a `tracesSampler` that keys
off transaction names is exactly the "fragile matching logic" you warned
against.

Two safe options, in preference order:

1. **Env-gated debug mode** (recommended). A `SENTRY_TRACES_SAMPLE_RATE`
   override read at init, raised temporarily while reproducing, then removed.
   No code path guesses at which request is important.
2. **`tracesSampler`** keyed on an explicit signal the round-submit path sets
   itself, rather than on a parsed transaction name.

Neither is implemented. Cost note: traces are the dominant cost lever here;
profiling is already gated at 0.3 and replay at 0.1 with 1.0 on error.

---

## 9. Postgres function-stage observability (DESIGN ONLY — not built)

The gap from §4: Sentry can show that `submit_round_atomic` failed and how long
it took, but not which internal stage it reached.

**The constraint that rules out the obvious answer:** a trace table written
inside the same transaction rolls back with the transaction. On the failure you
most want to explain, the evidence deletes itself. Any design must survive
rollback.

Options, with the rollback property called out:

| Mechanism | Survives rollback? | Notes |
| --- | --- | --- |
| `RAISE LOG` from PL/pgSQL | **Yes** — goes to the Postgres log, not a table | Lands in Postgres logs, which carry **no trace_id** (§4) |
| Table insert in the same txn | **No** | Useless for the failing case |
| `pg_background` / autonomous txn | Yes | Extra extension, more moving parts |
| Return warnings in the RPC result | Yes on success paths | Already used for detail-insert warnings |

Leading candidate: `RAISE LOG` with a structured payload including an explicit
correlation id, plus a `WHEN OTHERS` handler that logs `failure_stage`,
`SQLSTATE`, and elapsed time before re-raising.

**Correlation id, not trace id.** Whether PostgREST exposes the incoming
`traceparent` to a function (via `current_setting('request.headers')`) is
**unverified** — it must be tested read-only before anything depends on it. If
it is not available, pass an explicit app-generated correlation id as an RPC
argument. Either way it is observability-only and must never be trusted for
authorization.

**Nothing here has been applied to the production RPC**, per your instruction.

---

## 10. pgAudit (NOT enabled — procedure only)

Do not enable broadly. If temporarily needed: scope to `function, write` (never
`all`), verify experimentally which role's settings capture writes inside a
`SECURITY DEFINER` RPC (the `authenticator` role governs API traffic, but
DEFINER internals may not follow it — this is untested), never log parameters,
and reset immediately after. Impact: significant log volume, which now meters
against Logs Ingest.

---

## 11. Verification status — read this before trusting anything above

| Claim | Status |
| --- | --- |
| APIs exist and are exported | **Verified** against installed packages |
| `sendOperationData: false` suppresses query/body | **Verified** by reading the SDK source |
| Guard skips plain-object mocks | **Verified** by test |
| typecheck / full unit suite (1180 files, 10,962 tests) / production build | **Verified green** |
| `roundStage()` wired into the real submit + autosave paths, canonical outcome taxonomy | **Verified** — 20 tests lock the taxonomy; see §10 below |
| `trace_id` correlation into Golf Tracer / admin_events | **Verified** — `server-error-logger.ts` captures `Sentry.getActiveSpan()?.spanContext().traceId`, defensively; full suite confirms it doesn't break the 21 tests that mock `@sentry/nextjs` |
| Preview deploy succeeds on Vercel, app boots, real pages render | **Verified** — `dpl_CDDDPVjnxECMEQrLnHPaeQv2rYTX`, `GET /golf/login` → 200, correct title, zero runtime errors in `get_runtime_errors` |
| Middleware/proxy runs on the same Node.js runtime as everything else (not a separate Edge isolate) | **Verified** — live runtime logs, source `serverless-middleware`, not `edge-middleware` |
| Spans appear in a real Sentry trace | **NOT verified** — needs an authenticated round-submit click-through, which needs a real test account + browser session not available in this pass |
| `trace_id` appears in a real Supabase API log | **NOT verified** — same reason |
| Replay ↔ trace linkage | **NOT verified** — same reason |
| Profiling attaches in the Vercel runtime | **NOT verified** |
| Breadcrumbs for shot entry (§3 of the census brief) | **NOT implemented** — deferred; see the session report |

The live half that's left (§34/§35 of the original brief and §17's mandatory
check: one controlled, AUTHENTICATED round submission in the preview, then
matching the Sentry trace id to a Supabase API log line) still needs a real
test account and a browser session — the preview itself is up and verified
reachable, error-free, and running the right runtime; what's left is clicking
through it as a real user.
