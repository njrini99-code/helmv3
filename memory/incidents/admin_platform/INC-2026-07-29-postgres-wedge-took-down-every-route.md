# INC-2026-07-29 — a wedged Postgres took the whole site down through an unguarded fallback

- Feature: `admin_platform`
- Also affects: `auth_onboarding_join`
- Status: CLOSED — repair present in this repo; verified 2026-09-05 that
  `getUserResilient` (`src/lib/auth/resilient-get-user.ts`) wraps its
  `getSession()` call rather than calling it unguarded, and that
  `scripts/lib/retrying-fetch.ts` exists.
- Risk: R2 — site-wide availability
- First seen: 2026-07-29T04:10:00Z (Postgres wedge); site-wide errors from
  ~04:16Z
- Source: auto-memory notes `supabase-522-site-outage-2026-07-29.md` and
  `supabase-db-wedged-control-plane-lies.md`, both dated 2026-07-29

## Symptom

`helmsportslabs.com` served errors on every route — marketing pages and the
login page included — for roughly 9 hours, and CI went red repo-wide at the
same time.

## Root cause (two symptoms, one trigger)

The production Supabase project's Postgres wedged hard at 04:10:00Z and
served zero queries for 9.4 hours. The project's own control-plane status
(`GET /v1/projects/{ref}`) reported `ACTIVE_HEALTHY` throughout, and
Supabase's public status page showed all-clear — the control plane can be
wrong about the data plane. The per-service `/health` endpoint
(`?services=db&services=rest&services=auth&services=realtime`) told the
truth: `db: UNHEALTHY "Failed to connect to database"` while `rest`/`auth`
answered fine, because Kong serves `/auth/v1/health` and `/rest/v1/` without
touching the database. The fastest single tell was a 9.4-hour gap in
Postgres's own logs (checkpoints normally run every ~5 minutes, so the gap
alone is the diagnosis).

Two separate defects turned that project-level wedge into a site-wide and a
CI-wide outage:

1. **Middleware auth fallback.** `getUserResilient` exists so a degraded auth
   server never logs every user out. Its last step called
   `supabase.auth.getSession()` unguarded — and `getSession()` attempts a
   token *refresh* when the access token has expired, i.e. a network call to
   the auth server already known to be unreachable. Middleware runs in front
   of every request, so the fallback's own final step threw the exact error
   the fallback existed to absorb, turning a degraded backend into a 500 on
   every route.
2. **Unguarded CI seed.** `Seed BaseballHelm CI accounts` →
   `scripts/seed-baseball-demo.ts` → `createUser` had no retry. A single
   transient 5xx/522 during the wedge killed the BaseballHelm smoke job,
   which feeds one of `main`'s required aggregate checks — a ten-second blip
   was enough to freeze every merge, and the aggregate stayed red after the
   database recovered.

## Repair

- `getUserResilient` now treats an unreadable session as no session
  (deny-only — never a security relaxation) instead of letting the refresh
  attempt throw past the guard. Present at
  `src/lib/auth/resilient-get-user.ts`.
- The seed client now goes through `scripts/lib/retrying-fetch.ts`, a
  `global.fetch` wrapper that retries 5xx and Cloudflare 52x responses (never
  4xx) — present in this repo.
- Restarting the Supabase project via the Management API
  (`POST /v1/projects/{ref}/restart`) is the fix for the underlying wedge
  itself; it flipped `db` from UNHEALTHY to ACTIVE_HEALTHY in about 3
  minutes in this incident. Root cause of the wedge itself was never
  established — Postgres's own logs stopped cleanly at 04:10 with no error,
  no OOM, no deadlock line.

## Diagnostic worth keeping

To tell "network blip" from "origin/DB saturated" from "Postgres specifically
wedged", probe a static endpoint and a DB-backed endpoint together: both
failing means origin/DB saturation; only the DB-backed one failing means
Postgres; neither failing means it isn't this at all. If it recurs, capture
`pg_stat_activity` before restarting — a restart destroys the evidence.

## Regression

Any degraded-auth or degraded-database fallback path must be proven not to
make its own recovery-attempt network call under the exact failure it is
meant to absorb — the mechanism this incident revealed is general, not
specific to `getSession()`. Any script that seeds or provisions accounts for
a required CI check must retry transient upstream failures rather than
failing the whole check on one blip.
