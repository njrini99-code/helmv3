# Datadog Configuration

## What we use Datadog for

**Only browser RUM (Real User Monitoring) and browser logs.**

- Initialization: `src/lib/datadog/index.ts` (lazy-loaded after page idle)
- Provider wiring: `src/components/providers/DatadogProvider.tsx`
- Required env vars (production only; no-op in dev):
  - `NEXT_PUBLIC_DD_APPLICATION_ID`
  - `NEXT_PUBLIC_DD_CLIENT_TOKEN`
  - `DD_SITE` (optional, defaults to `datadoghq.com`)
  - `DD_SERVICE` (optional, defaults to `helm-sports-labs`)
  - `DD_ENV` (optional, defaults to `development`)

Server-side observability is handled by **Sentry**, not Datadog.
See `src/lib/server-error-logger.ts` and `instrumentation.ts`.

## What we do NOT use Datadog for

- ~~PostgreSQL monitoring via DD Agent~~. Supabase query performance is
  visible through the Supabase Dashboard → Reports → Query Performance, and
  slow-query incidents are surfaced via Sentry server-side.
- ~~Application tracing~~. Sentry Performance handles tracing.
- ~~Log ingestion from the Node.js runtime~~. Vercel → Sentry Breadcrumbs
  + `admin_events` table covers this.

## Removed: legacy postgres.d/ config

A prior commit included `setup-datadog-user.sql` and `postgres.d/conf.yaml`
for the DD Agent's PostgreSQL integration. These were:

1. Pointing at a stale Supabase project ID (`cwkrcnbgjvahchzzzetw`).
   Current project is `qmnssrrolpinvwjjnufo`.
2. Including a real password committed to the repo.
3. Never actually deployed — the DD Agent isn't running against Supabase.

Deleted to avoid confusion and password leakage. If you want DD postgres
monitoring back, provision via Datadog → Integrations → PostgreSQL and
store credentials in the DD Agent config, not in this repo.
