# Local database

## Commands

```bash
npm run db:local          # start (or reuse) the local Supabase stack, replay migrations + seeds
npm run db:local -- --reset     # force a fresh replay even if the stack is already up
npm run db:local -- --no-seed   # replay migrations only, skip seed files
npm run db:local:stop     # stop the stack
```

`npm run db:local` never prints a key, token, or connection string — only
the env var NAMES to set in `.env.local`. Copy the actual VALUES from
`./node_modules/.bin/supabase status` yourself.

## What the seed contains, and what it excludes

Three seed files load, in order (`supabase/config.toml`'s `[db.seed]`):

1. **`supabase/seed/v3-seed.sql`** — the hand-maintained local-dev fixture
   (team/roster shape). Documents its own auth.users dependency.
2. **`supabase/seed/local-only-extensions.sql`** — enables `plpgsql_check`
   and `pg_net` LOCAL-ONLY. Never applied to production; see
   `supabase/config.toml`'s extension-parity comment for why each
   production extension does or doesn't need this file.
3. **`supabase/seed/prod-sample-seed.sql`** — a GENERATED, redacted sample
   of real production rows (see below). Ships as an empty placeholder until
   the first `npm run db:seed:refresh`.

**Excludes, always**: `auth.users` (GoTrue rows can't be built from raw
SQL — see `v3-seed.sql`'s own header for the local user path), the whole
of any table (every query in the sample is row-capped), and any
unredacted PII.

## Refreshing the production sample

```bash
npm run db:seed:refresh                       # default: 200 rows/table
npm run db:seed:refresh -- --limit 50
npm run db:seed:refresh -- --tables golf_teams,golf_coaches
npm run db:seed:refresh -- --dry-run          # print instead of writing
```

Requires the repo-local CLI to be logged in and linked to production with
read access (`supabase login` / `supabase link`) — it reads through
`supabase db query --linked` (SELECT + LIMIT only, via the Management API
with the CLI's own token), never the MCP `execute_sql` tool. It redacts
every email, phone, and name-shaped column in
`scripts/db/seed-from-prod.mjs`'s `ALLOWLIST` before writing anything to
disk, then re-scans its own output and refuses to write if an `@` survives
outside the `seed.example` redaction domain.

## pgTAP and function linting

```bash
npm run test:rls           # pgTAP against the running local stack
npm run db:lint:functions  # plpgsql_check over every function in public
```

`db:lint:functions` fails on any `error:` finding; `warning:`s are printed,
not fatal. Trigger functions are checked against a real attached relation
(resolved via `pg_trigger`) — one with no attached trigger anywhere is
skipped and named, not silently dropped.

## Doctor checks

`npm run repo:doctor` includes `db-local.*`:
`db-local.docker-reachable`, `db-local.postgres-major-matches` (compares
the running stack's Postgres major version against
`supabase/config.toml`), and `db-local.seed-freshness` (WARNs, doesn't
fail, when `prod-sample-seed.sql` is over 30 days old). All three degrade
to `LOCAL_ONLY`/`WARN` rather than a manufactured `FAIL` when Docker or the
stack isn't up — same convention as `db-observability.*`.
