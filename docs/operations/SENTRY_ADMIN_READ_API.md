# Sentry Admin Read API

Helm Bridge's `/admin/errors` page reads Sentry issues server-side via
`src/lib/admin/sentry-api.ts`. This doc covers the required token, why it's
separate from the CI sourcemap-upload token, and what each failure mode
looks like in the admin UI.

## Required env var: `SENTRY_READ_TOKEN`

Set in Vercel (Production **and** Preview) and locally in `.env.local`:

```bash
SENTRY_READ_TOKEN=sntrys_...
SENTRY_ORG=<your-org-slug>
SENTRY_PROJECT=<your-project-slug>
```

Create the token at **Sentry → Settings → Auth Tokens → Create New Token**,
scoped to:

- `org:read`
- `project:read`
- `event:read`

**Do not reuse the CI sourcemap-upload token** (`SENTRY_AUTH_TOKEN`, used by
`@sentry/nextjs`'s build-time sourcemap upload). That token is typically
scoped to `project:releases` / sourcemap upload only and does **not**
include `event:read` — using it for the admin read panel will 403/404 on
every issue-list call.

## Fallback behavior (and why it's still safe)

`sentry-api.ts`'s `config()` resolves the token as:

```ts
const token = process.env.SENTRY_READ_TOKEN || process.env.SENTRY_AUTH_TOKEN;
```

If `SENTRY_READ_TOKEN` isn't set yet, it falls back to `SENTRY_AUTH_TOKEN`
rather than immediately failing — this keeps the admin panel partially
useful during initial setup. But because the CI token usually lacks
`event:read`, calls will typically 403/404 until `SENTRY_READ_TOKEN` is
provisioned with the correct scopes above.

**This fallback is fail-soft by design**, not a crash risk: every Sentry
API call in `sentry-api.ts` is wrapped so a missing token, an HTTP error, or
a thrown exception all resolve to a normal `AdminFetchResult` —
`{ status: 'unconfigured' }` or `{ status: 'error' }` — never an unhandled
throw that would break page render. `/admin/errors` and `/admin/deploys`
render a `PanelNoData` / `PanelStale` panel for either state instead of
crashing.

## What each state looks like

| Condition | `sentry-api.ts` return | Admin UI |
|---|---|---|
| `SENTRY_READ_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` all unset, no `SENTRY_AUTH_TOKEN` fallback either | `{ status: 'unconfigured' }` | "Sentry not configured" panel |
| Token present but wrong scope (403) | `{ status: 'error', error: 'Sentry issues fetch failed: 403' }` | Stale/error panel, page still renders |
| Token present but org/project slug wrong (404) | `{ status: 'error', error: '...404' }` | Stale/error panel |
| Correctly scoped `SENTRY_READ_TOKEN` | `{ status: 'ok', data: [...] }` | Live issue list |

## Known gap (tracked, not yet fixed)

There is currently no runtime/UI indicator distinguishing "using the
`SENTRY_AUTH_TOKEN` fallback" from "using the dedicated `SENTRY_READ_TOKEN`"
— both look identical until a call actually fails. If Sentry panels are
unexpectedly stale/erroring, check `SENTRY_READ_TOKEN` is set and scoped
correctly *before* assuming the integration itself is broken.

## Related

- `src/lib/admin/sentry-api.ts` — the client.
- `src/lib/admin/data/errors.ts`, `src/lib/admin/data/triage.ts` — how
  Sentry issues merge with `admin_events`/`error_logs` into the unified
  triage queue.
- `docs/operations/VERCEL_ADMIN_DEPLOYS_RUNBOOK.md` — the equivalent doc
  for the Vercel side of `/admin/deploys`.
