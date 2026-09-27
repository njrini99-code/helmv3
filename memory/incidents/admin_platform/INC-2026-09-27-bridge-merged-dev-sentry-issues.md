# INC-2026-09-27: the Bridge incident feed merged development Sentry issues

- Feature: `admin_platform`
- Surface: `fetchIncidentFeed` (Bridge triage queue, Active groups, Overview KPIs)
- Status: FIXED in 7538f032e on branch agent/health-20260927-0347; not merged yet
- Risk: R1. Read path only (a Sentry API query parameter). No schema, RLS, grant, auth or billing change.
- Signal: Sentry JAVASCRIPT-NEXTJS-120, -121, -122, -123 (`BAND_INK is not defined`, 2 events each, 2026-09-27 02:27 UTC) and earlier 11Y/11Z (`RootSummary.tsx` module not found). All `environment=development`, url `http://localhost:3218/...`. Not an admin_events fingerprint.

## What was wrong

`fetchIncidentFeed` (`src/lib/admin/data/incident-feed.ts`) merges a
filter-scoped Sentry query into the Bridge's incident feed. That query sent no
`environment` parameter, so issues raised by a local `next dev` session
mid-edit (tagged `development` by `resolveServerEnvironment`) appeared on the
Bridge next to production incidents. The reliability collector already scopes
to `['production']` (`src/lib/reliability/sources.ts`); the feed did not.

## Fix

- The merged query now passes `environment: ['production']`
  (`MERGED_SENTRY_ENVIRONMENTS`).
- Not changed: the raw org-wide `sentry` pull that backs the Errors tab's
  deliberately unscoped "Sentry unresolved (org-wide)" panel. If the scoped
  query fails, the existing fallback to that raw pull still applies.

## Proof

- `src/lib/admin/data/__tests__/incident-feed.sentry-environment.test.ts`
  fails on origin/main 53a2f02fe (`expected undefined to deeply equal
  [ 'production' ]`) and passes with the fix.
- Replay: `replay/manifests/bridge-sentry-production-scope-2026-09-27.yml`.

## Verify in production

After deploy: the Bridge triage queue shows no Sentry issue whose environment
is not `production` (for example JAVASCRIPT-NEXTJS-123 drops off).
