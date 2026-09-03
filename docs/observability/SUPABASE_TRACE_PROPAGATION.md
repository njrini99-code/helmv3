<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# W3C trace propagation — certification (Phase 2 Track C, brief §14)

Two different claims, kept separate on purpose:

1. **Static architecture** — is everything wired the way
   `docs/observability/SENTRY_SUPABASE_TRACING.md` describes? Fully
   automatable, checked by `scripts/db-observability-trace-cert.mjs`.
2. **Live proof** — does a real Sentry trace id actually reach a real
   Supabase request log line? NOT automatable by design (brief §14/§32:
   "no continuous ingestion") — a one-time, owner-triggered, manual
   procedure.

Claim 1 being green is a precondition for claim 2 meaning anything. It is
not a substitute for it.

## 1. Static certification (automated)

```bash
node scripts/db-observability-trace-cert.mjs         # human report
node scripts/db-observability-trace-cert.mjs --json    # machine report
```

Checks (verified 2026-09-03, PASS 5/5 at that time — re-run before trusting
this table if the underlying files have since changed):

| # | Item | What it verifies |
| --- | --- | --- |
| 1 | `supabase_tracing_runtime_imported` | `@supabase/supabase-js/tracing` imported by both `src/instrumentation.ts` and `src/instrumentation-client.ts` |
| 2 | `trace_propagation_enabled_on_clients` | `tracePropagation:` configured on all four Supabase client factories (`admin.ts`, `client.ts`, `server.ts`, `middleware.ts`) |
| 3 | `sentry_propagate_traceparent` | `propagateTraceparent: true` on both the Node and Edge runtime `Sentry.init()` calls in `instrumentation.ts` |
| 4 | `browser_trace_propagation_targets_include_supabase_host` | `sentry-client-options.ts` derives the Supabase origin from `NEXT_PUBLIC_SUPABASE_URL` and spreads it into `tracePropagationTargets` |
| 5 | `edge_function_cors_allows_trace_headers` | Every BROWSER-INVOKED Edge Function's `Access-Control-Allow-Headers` includes `sentry-trace`, `baggage`, `traceparent` |

**Item 5's scoping, stated explicitly**: all three current Edge Functions
(`personalize-email`, `send-apns-push`, `send-fcm-push`) omit the three trace
headers from their CORS allow-list. Verified none is invoked from an
instrumented BROWSER client — `send-apns-push`/`send-fcm-push` are called
only from `src/lib/notifications/push.ts`, which carries an explicit
`'server-only'` directive; no call site for `personalize-email` exists
anywhere in `src/`. CORS trace-header propagation only matters for a request
that crosses the browser-CORS boundary, so item 5 is PASS for the CURRENT
inventory, with the real per-function header gap recorded in the script's
`--json` evidence output — visible and actionable the moment any of these
three (or a new function) becomes browser-invoked. This script does not, and
should not, edit `supabase/functions/*` to "fix" a gap that affects nothing
today.

## 2. Live proof — MANUAL PROCEDURE

**live-proof: NOT VERIFIED**

This exact bold line, at the START of a line, is what
`scripts/repo-doctor/checks/db-observability.mjs`'s `traceparent-live-proof`
check greps for (`/^\*\*live-proof:\s*VERIFIED\*\*/im`) — deliberately
anchored to line-start so a sentence merely DISCUSSING this marker (like
this paragraph) can never itself flip the result. When the owner completes
the procedure below, remove the word "NOT" from the bold line above (plus
filling in the evidence table underneath) and the doctor check will pick it
up on the next run. Until then it correctly reports `LOCAL_ONLY`
with this exact reason.

### Procedure

1. Deploy (or use an existing) Vercel preview build.
2. Trigger a real, authenticated request that reaches Supabase through a
   traced client path — the round-tracking flow
   (`docs/observability/SENTRY_SUPABASE_TRACING.md` §5's own worked example:
   sign in, add a shot, autosave, submit) is the best-covered one because it
   already carries `sport:golf feature:round_tracking` Sentry tags.
3. In Sentry: **Issues** (or a manually-opened trace if nothing errored) ->
   open the trace -> copy the trace id from the trace header or the `db`
   span's `trace_id`.
4. In Supabase: **Dashboard -> Logs -> Logs Explorer**
   (`/dashboard/project/_/logs-explorer`) -> query the API Gateway (edge)
   logs for that same id, within the request's timestamp window. The exact
   field name for `trace_id` in this project's live Logs Explorer output has
   **not** been confirmed — confirm it on this first live run rather than
   assuming a name from the general docs.
5. Confirm the id matches. Record the match (trace id, timestamp, which
   field it appeared under) as the evidence below.
6. Edit the bold marker line at the top of §2 — remove "NOT" so it reads
   "live-proof: VERIFIED" — and re-run `npm run repo:doctor` to confirm the
   `traceparent-live-proof` sub-check picks it up.

**Postgres logs will not carry the trace id** (confirmed in
`SENTRY_SUPABASE_TRACING.md` §4 — PostgREST/Auth/Storage/Realtime API
Gateway logs and Edge Function logs do; Postgres logs do not). If the
workflow under test reaches a Postgres RPC failure specifically, pivot on
timestamp + entity id inside Postgres logs instead, per that doc's §6.

### Evidence (fill in once run)

| Field | Value |
| --- | --- |
| Date run | _(not yet run)_ |
| Preview deployment | _(not yet run)_ |
| Sentry trace id | _(not yet run)_ |
| Supabase log field carrying it | _(not yet run)_ |
| Result | NOT VERIFIED |

## 3. Relationship to the doctor key

`scripts/repo-doctor/checks/db-observability.mjs`'s `TRACEPARENT_CERTIFIED`
key reads §1 (spawns the cert script and parses its `--json` output) — it
does NOT read §2. The separate `traceparent-live-proof` check (always
`Status.LOCAL_ONLY`, informational, never affects `repo:doctor`'s exit code)
reads whether this file's `live-proof:` line says `VERIFIED`. Splitting them
means a green `TRACEPARENT_CERTIFIED` never gets mistaken for "someone
actually watched a real trace id land in a real Supabase log" — that claim
can only ever come from a human who did §2's procedure.
