# INC-2026-08-27 — a failing cron reported healthy for two days

- Feature: `admin_platform` (the observability surfaces); the failing code is
  `coachhelm_ai`'s safety-net path, reached from the calendar reminder cron.
- Status: repairing — visibility repaired and merged-pending; the underlying
  permission fault is NOT fixed.
- Risk: R2 for the visibility repair (observability semantics). The underlying
  permission fault is R3 — it involves a `SECURITY DEFINER` view and an
  RLS/grant decision, so it is prepared and reported only.
- First seen: 2026-08-25 12:02 UTC
- Last seen: 2026-08-27 00:00 UTC (still recurring at time of writing)
- Sentry: https://helm-xs.sentry.io/issues/JAVASCRIPT-NEXTJS-PR — 47 occurrences,
  substatus `escalating`.

## User impact

None observed directly: `users: 0` on the Sentry issue, and event reminders
continued to send. The impact is on the operator, and it is the kind this system
exists to prevent — for two days every Bridge surface reported this cron healthy
while it was throwing on every run.

## What was actually observed

Three sources disagreed, and only one of them was right:

| Source | What it said |
|---|---|
| Sentry | `permission denied for table baseball_players` on `GET /api/cron/event-reminders`, 47 events, escalating |
| `background_job_logs` | `event-reminders` — **72 runs in 3 days, all `completed`** |
| `admin_events` | **zero** rows matching the failure |

## Root cause of the INVISIBILITY (repaired)

`event-reminders` fans its sends out through `Promise.allSettled`, then:

```ts
outcomes.forEach((outcome, idx) => {
  if (fulfilled && value) succeeded.push(recipient);
  else failed += 1;              // the rejection REASON is discarded
});
```

`failed` is a bare counter. The rejection reason was never captured, so:

- nothing threw, so the route returned `200 { success: true }`
- `recordJobRun` treats <400 as success, so the job row said `completed`
- no `logServerError` call was made, so `admin_events` learned nothing
- Sentry saw it ONLY because the Supabase driver instruments itself
  (`mechanism: auto.db.supabase.postgres`, `handled: no`)

A count answers "how many". Only the reason answers "what is wrong", and the
reason was thrown away at the one place it existed.

This is the `.supabase-error-baseline.json` class (1,044 unchecked reads) caught
in production: PostgREST returns failures as VALUES, so nothing throws unless
someone checks.

## Root cause of the FAULT (not repaired — R3)

The stack shows the failing code is not this route's own:

```
app:///.../api/cron/coachhelm-safety-net/route.js  (g)   <- fails here
app:///.../api/cron/event-reminders/route.js
    at Promise.allSettled (index 2)                      <- absorbed here
```

Verified against the production catalog on 2026-08-27: `service_role` **already
holds SELECT** on both `baseball_players` and `baseball_coaches_public`. So this
was never a missing service-role grant.

What those two objects share is that **neither grants `anon`**, while the three
sibling public views (`baseball_teams_public_profile`,
`baseball_team_coach_staff_public`, `organizations_public_profile`) all do. The
strong reading is that this path runs with an anon-scoped client where it should
use the admin client.

**Do not "fix" this by granting `anon`.** `baseball_coaches_public` is one of the
four ERROR-level `security_definer_view` advisories, and granting anon would
expose coach data to unauthenticated callers — trading an observability bug for a
data-exposure one. The repair is to use the correct client at that call site.

## Repair shipped

`src/app/api/cron/event-reminders/route.ts`:

- rejection reasons are captured, deduped and bounded (`MAX_FAILURE_REASONS`)
- distinct causes are written via `logServerError` at `error` severity, so
  `admin_events` — and therefore the Bridge — sees them
- the reasons ride in the response body as a **string**, because
  `recordJobRun`'s `extractOutcomeMetadata` keeps only top-level scalars and
  silently drops arrays; an array would have reproduced the invisibility

## What was deliberately NOT changed

A first attempt returned **500** when every send failed, so the Jobs board would
go red. Two existing tests rejected it and they were right: the route's
documented contract is that an unsent recipient is not marked done and retries
next tick, and with a single recipient `sent === 0` is also what one flaky APNs
push looks like. That change would have turned a self-healing retry into a red
cron.

The bug was never the status code. It was that the cause was invisible.

## Follow-ups

1. **R3** — correct the client used by the `coachhelm-safety-net` path. Owner
   action; do not grant `anon`.
2. ~~Audit the other `Promise.allSettled` sites for the same discarded-reason
   shape.~~ **Started 2026-08-27.** Scanned all 40 non-test `allSettled` call
   sites; 23 never touch `.reason` within the following 1400 characters. Two of
   those are the exact incident shape — the result is not even bound, so a
   rejection leaves no trace anywhere:
   - `src/lib/notifications/golf-message-fanout.ts` (email + push fan-out)
   - `src/lib/coachhelm/v3/qualifying/player-notify.ts` (per-candidate
     email + push)
   Both now route through the new shared helper `src/lib/settled-failures.ts`
   (`allSettledReported` / `reportSettledFailures`), which counts every
   rejection, keeps distinct bounded reasons, and writes each distinct cause via
   `logServerError` so `admin_events` — and therefore the Bridge — sees it. It
   deliberately does not change control flow: these sites chose `allSettled`
   because one failed recipient must not abort the rest, and the bug was never
   the control flow.
   Made shared rather than hand-copied on purpose: the SSRF guard in this repo
   was hand-copied into two files and stayed broken in both.
   **Still open:** the remaining ~21 sites. Most are client components or
   read-side fan-outs where a rejection is visible some other way, but they have
   not been individually cleared. Do not read this item as finished.
3. The four ERROR `security_definer_view` advisories remain open and are the
   context for this fault.

## Update 2026-09-01 — the same class, three more instances, and what remains open

The visibility repair above was one instance of a wider shape: a failure that
exists as a VALUE (or a detached promise) never enters the Bridge pipeline. A
review of the pipeline on 2026-09-01 (`agent/fix-bridge-errors`) closed three
more instances and left the class itself open:

- **Value-shaped RPC failure, client side.** `permission denied for function
  heartbeat` — 15 Sentry events in 7d (2026-08-26..28, Chrome and WKWebView on
  `/golf/dashboard/rounds/*`), reported only by the Supabase driver's
  auto-instrumentation, 0 `admin_events` rows. `src/hooks/use-presence.ts` now
  routes the resolved `error` through `logError` (feature `auth_onboarding`,
  severity `low`). Grants were verified against production via the read-only
  connector: `public.heartbeat()` is SECURITY DEFINER with EXECUTE for
  `authenticated` and `service_role` only — correct — so the fault was a JWT
  that expired between the session check and the call, evaluated as `anon`.
  No migration; the last occurrence predates the `getSession()` guard.
- **Detached promises on the thrown-action path.** `void logServerException(…)`
  then `throw` is dropped on Vercel once the response is sent. Every capture
  class now goes through `scheduleBridgeWrite` (`after()` in a request scope,
  awaited-with-timeout otherwise), and the process-level handlers await under
  a bound and register with the platform's `waitUntil`.
- **Errors this pipeline could not even represent.** A MISSING Inngest signing
  key produced an SDK `console.error` and nothing else; it is now a
  `provider_inngest_missing_credential` row on `integrations` in production.

**Still open — do not read the above as closing the class:**

1. The `.supabase-error-baseline.json` class (1,044 unchecked reads returning
   failures as values) is untouched beyond the one heartbeat call site.
2. Follow-up 2's ~21 remaining `Promise.allSettled` sites are not individually
   cleared.
3. R3 — the client used by the `coachhelm-safety-net` path — remains an owner
   action. Do not grant `anon`.
