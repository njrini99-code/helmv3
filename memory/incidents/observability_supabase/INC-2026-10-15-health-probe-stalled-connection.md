# INC-2026-10-15: /api/health read one stalled connection as a degraded database

- Feature: `observability_supabase`
- Surface: `/api/health` readiness probe, `/admin/errors/5725d96a`
- Status: FIXED on branch `agent/health-20261015-0054` (136a75dbc); awaiting merge and deploy.
- Risk: R1. Route-handler logic only. No schema, RLS, grant or data change.
- Signal: `admin_events` warning `[api.health] Health check degraded: readiness query failed` (5725d96a). Auto-resolved 2026-10-13 07:31Z (rule A, 86c43bd8e), then 5 rows on 2026-10-14 14:09Z–21:48Z, all `failureKind: timeout`, `queryMs` ≈ 2,510 against the 2,500 ms budget.

## What was wrong

Every failing probe ran on a warm instance (`instanceUptimeMs` 15–72 min, `createClientMs` 0–9 ms), so it was not a cold start. Supabase's edge logs for the same minutes show the failing request either never reached PostgREST (15:10:53Z, 19:06:31Z, 21:48:00Z: no `/rest/v1/users?select=id&limit=1` request in the window) or reached it about 4 s late and got a 200 (18:01:52Z start, 18:01:56.6Z edge log). `db_health_samples` showed an idle database throughout (0.3% connections, no lock waits). The stall is the instance's connection to Supabase (Sentry also showed `read ECONNRESET` / `socket hang up`, -1A2/-1A3, the same day), not the database. A single 2.5 s read reported it as "database degraded".

## Fix

`src/app/api/health/route.ts`: a read that times out gets one more attempt on a fresh request. Two timeouts in a row still return 503 and log the degraded row, which now records `attempts`. A PostgREST error is not retried (the database answered).

Regression tests: `src/app/api/health/route.test.ts` ("one retry on a timeout", 3 cases; fail on ecd16beea). Replay: `replay/manifests/health-probe-stalled-connection-2026-10-15.yml`.

## Not fixed here

Why an instance's socket to Supabase stalls (keep-alive reuse after idle, or Vercel egress) is not proven. If 5725d96a fires again with `attempts: 2`, that is two stalls in a row and worth a Vercel runtime-log pull for the request.
