# Feature: Admin Platform

## Status

- active

## Current State

Admin Platform is the internal operations and monitoring surface for Helm/GolfHelm. It includes the main admin dashboard, data quality/tracer views, platform health, BI-style reporting, user/team activity, audit/security views, and a CRM/admin outreach subsystem.

This area is high criticality because it often uses broader access patterns, operational data, and admin/server-only helpers.

## Primary Entry Points

### Routes

- `src/app/admin/**` (Helm Bridge)
- `src/app/golf/admin/**`
- `src/app/golf/admin/crm/**`

### Components

- `src/app/admin/_components/**` (Helm Bridge shell and controls)
- `src/app/golf/admin/components/**`
- `src/app/golf/admin/crm/components/**`

### Actions And Services

- `src/app/golf/actions/admin-data.ts`
- `src/app/golf/actions/admin-people-data.ts`
- `src/app/golf/actions/admin-system-data.ts`
- `src/app/golf/actions/admin-tracer-data.ts`
- `src/app/golf/actions/admin-bi-data.ts`
- `src/app/golf/actions/admin/**`
- `src/app/golf/actions/crm-*.ts`
- `src/app/golf/actions/resend-activity.ts`
- `src/lib/supabase/admin*`
- `src/lib/cron/**`

## Core Data

- Platform user, organization, membership, team, coach, player, round, event, insight, and audit data.
- CRM tables for coaches, events, sequences, suppressions, email tracking, replies, and timeline activity.
- Health/audit data from application logs, auth, error tracking, and operational tables.

## Business Rules

- Admin access must remain explicit and server-side; service-role behavior must not leak into client bundles.
- Helm Bridge uses the authenticated GolfHelm session. Its shell must expose a
  usable sign-out control on both the desktop rail and the mobile More sheet;
  sign-out clears the active-team selection before revoking that session.
- Admin dashboards can read broad platform state, but mutations still need authorization and auditability.
- CRM automation/suppression behavior must respect opt-out and reply-stop logic.
- Operational charts should not be treated as source of truth if rollups are stale.
- Cron/admin endpoints must use configured secrets and auth checks.
- **Incident resolution has exactly one write path.** Every resolve — a single
  row, a whole fingerprint, or a bulk selection — goes through the user-scoped
  `resolve_admin_event` RPC and busts `BRIDGE_INCIDENT_CACHE_TAG`. The RPC
  gates on `is_super_admin()` reading `auth.uid()`, so it must be called with
  the user-scoped client; a service-role client makes `auth.uid()` NULL and the
  RPC Forbids. Service-role access is read-only on this path.
- **An in-app RCA analysis is not an incident.** `analyzeErrorFingerprint`
  stores its verdict as an `admin_events` row with `event_type='rca_analysis'`
  under the analyzed fingerprint. Every incident query must exclude that event
  type, or an analysis is counted as an occurrence of the thing it analyzes
  (inflating occurrence counts and moving last-seen).
- **Client-reported error context is redacted before it is stored**, not only
  before it reaches Sentry. URL query strings and fragments can carry
  magic-link tokens, OTPs, and OAuth codes.

## UI Contract

- Admin surfaces should be dense, scannable, and operational rather than marketing-style.
- Health, errors, data freshness, and needs-attention states should be visible without hunting.
- The Overview answers "is anything on fire" above the fold: banner, briefing,
  severity mix, then the triage queue. Posture KPIs live in a disclosure below
  it, not above it. Each KPI carries its own source note — the provenance is
  per-tile, not a separate panel.
- An error's detail page shows what was actually captured — Postgres error code
  and hint, request id, runtime, handled/unhandled, source file, and the flight
  trace link when one exists — each copyable on its own. A field with no value
  renders an em-dash; nothing is invented to fill the grid.
- Feature health renders through one component wherever it appears (Overview
  rollup, Health grid, per-app pages). Status thresholds, two-window hysteresis,
  and knownGaps annotations belong to the data layer, never to a view.
- CRM screens need clear pipeline, task, suppression, reply, sequence, and timeline states.
- Loading/error states should avoid blank admin pages; operational users need partial data when available.
- The desktop rail and mobile More sheet expose the same sign-out outcome, with
  an in-place pending state and a visible retryable error if session revocation
  fails.

## Known Risk Areas

- Admin actions are more likely to use broad permissions; review for service-role and RLS bypass carefully.
- CRM email/reply/suppression logic can have compliance impact.
- Rollup dashboards can appear live while backed by stale data.
- Observability code must avoid PII and secret leakage.

## Tests To Prefer

- `src/test/lib/cron/auth.test.ts`
- `src/test/api/cron/shared-auth.test.ts`
- Typecheck/build for admin UI changes.
- Targeted smoke/browser checks for admin dashboards when changing route-level code.

## Related Docs

- `docs/ADMIN_DASHBOARD_UPGRADE_PLAN.md`
- `docs/BI_DASHBOARD_ARCHITECTURE.md`
- `docs/OBSERVABILITY.md`
- `docs/SECURITY_AUDIT.md`
