# Vercel Admin Deploys Runbook

`/admin/deploys` reads Vercel deployment + web-insights data server-side
via `src/lib/admin/vercel-api.ts`. This doc covers required env vars,
failure modes, and the preview-pending-status runbook for CI (#390/#388).

## Required env vars

```bash
VERCEL_API_TOKEN=...     # Vercel account/team token, scope: read access to deployments
VERCEL_PROJECT_ID=...    # from .vercel/project.json after `vercel link`
VERCEL_TEAM_ID=...       # optional — only needed if the project is under a team
```

Get a token at **Vercel → Account Settings → Tokens**. `VERCEL_PROJECT_ID`
and `VERCEL_TEAM_ID` come from `.vercel/project.json` once the repo is
linked (`vercel link`), or from the Vercel dashboard project settings URL.

Set these in Vercel's own env var UI for **Production** — `/admin/deploys`
only needs to work when someone is actually looking at the production admin
panel. There is intentionally no requirement to set these in Preview;
missing them there renders a clear "not configured" panel rather than a
half-broken one (see below).

## Failure modes and what they render as

`fetchVercelDeployments()` and `fetchVercelWebInsights()` both return the
shared `AdminFetchResult` envelope (`ok` / `unconfigured` / `error`) and
never throw:

| Condition | Result | `/admin/deploys` renders |
|---|---|---|
| `VERCEL_API_TOKEN` or `VERCEL_PROJECT_ID` missing | `{ status: 'unconfigured' }` | `PanelNoData` — "Deployments API not configured", tells you which env vars to set |
| Token present, wrong scope / expired (401/403) | `{ status: 'error', error: '...403' }` | `PanelStale` with the error message |
| Token/project fine but web-insights endpoint 401/403 | `{ status: 'error', error: 'Vercel web insights fetch failed: 403' }` (fixed 2026-07-03 — previously this silently rendered "0 visitors", indistinguishable from genuinely quiet traffic) | `PanelNoData` — "Web insights unavailable" |
| Everything configured and healthy | `{ status: 'ok', data: [...] }` | Live deployment table / visitor stats |
| No Vercel API configured at all, but the app is actually deployed | `CurrentBuildCard` still renders from `VERCEL_GIT_COMMIT_*` build-time env vars (no API call needed) | Shows the current build's commit/branch even with zero Vercel API config |

## Deploy markers on incident reports

When Vercel is configured, error/incident detail pages can cross-reference
a deploy marker (was there a deploy near this error's timestamp?). When
Vercel isn't configured, this simply doesn't appear — it is not a required
field for the error report to render.

## CI/preview pending-status runbook (#390, #388)

Separate from the admin panel above: PRs can show a pending or failing
Vercel Preview / CircleCI Lighthouse check. See
`docs/operations/CI_CHECKS_AND_PREVIEW_RUNBOOK.md` for:

- Expected wait windows for Vercel preview builds.
- Exact rerun commands for CodeRabbit / Playwright / CircleCI.
- How to tell an inherited-`main` failure from a PR-caused one.
- The CircleCI Lighthouse-vs-Vercel-preview-readiness fix.

## Related

- `src/lib/admin/vercel-api.ts` — the client.
- `src/app/admin/deploys/page.tsx` — the page.
- `docs/operations/SENTRY_ADMIN_READ_API.md` — the equivalent doc for the
  Sentry side of `/admin/errors`.
