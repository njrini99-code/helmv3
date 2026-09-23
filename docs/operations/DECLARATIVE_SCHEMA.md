# Declarative schema (Database Plan D2)

`supabase/schemas/**` is the human-edited source of truth for the current
database shape; `supabase/migrations/**` is the applied history (never
hand-edited, never squashed — see `supabase/migrations/HELD.md`). This is
the flow that keeps them consistent.

## Directory layout and apply order

`[db.migrations] schema_paths` in `supabase/config.toml` lists every file
explicitly, in dependency order (comment header there explains why each
step is where it is — this order was found by applying it to a real fresh
Postgres via `supabase db diff -f` until it stopped erroring):

extensions → schemas/types → tables (shared, then golf/baseball/lifting/
helm_debug/archive) → constraints → functions → triggers → views → indexes
→ policies → comments → grants.

`archive/` covers two real production schemas, `archive` and `graveyard`
(retired baseball lift-tracking tables and one golf snapshot table) —
discovered only because the first cut's diff wasn't empty. `shared/
01_extensions.sql` exists because `supabase db dump` never emits `CREATE
EXTENSION`, but the shadow database cannot build without it; it lists only
the extensions this repo's own DDL references, not every extension enabled
in production. `supabase/roles.sql` creates `helm_repair_ro`, a cluster
role referenced by policies/grants that exists in production but was never
captured by any migration — a local-dev-only fix for a real "applied but
not recorded" gap.

## Making a schema change

1. Edit the relevant file(s) under `supabase/schemas/**`.
2. `supabase db diff -f <name>` — this builds the desired end state from
   schema files and diffs it against your local dev db (built from
   `supabase/migrations/**`), writing the delta as a new migration.
3. Review the generated migration like any other SQL change (see
   `.claude/rules/database-review.md`), especially for a lock/rewrite on a
   large table — Squawk (below) catches the common cases but not intent.
4. Write or run the matching pgTAP test under `supabase/tests/rls/` if the
   change touches RLS.
5. Open the PR with both the schema-file diff and the generated migration.

## The exemption header

Some migrations cannot be expressed as a schema-file diff: data backfills,
`cron.schedule(...)` calls (cron jobs are rows in `cron.job`, not DDL —
they will never show up in a diff), or a grant on an object created
dynamically. Mark the migration's first non-blank line:

```sql
-- DECLARATIVE: exempt <reason>
```

Both schema-drift scripts below skip a migration carrying this header.

## Reconciling a hand-applied hotfix

If a change went into production directly (SQL console, MCP `execute_sql`)
instead of through a migration: `supabase db dump --linked --schema
<affected-schema>`, diff the relevant `supabase/schemas/**` file against
that dump by hand, commit the schema-file update together with a migration
that reproduces the same DDL, and note the reconciliation in the PR.

## CI gates

- `scripts/db/check-new-migrations-in-schema.sh <base-sha>` (wired into the
  `supabase` CI job, blocking): every migration file *added in the PR*
  must have its created/altered objects reflected under
  `supabase/schemas/**`, or carry the exemption header. Scoped to the PR
  diff, not full history — see the next paragraph for why.
- `scripts/db/check-declarative-schema-drift.sh` (manual/local only, not
  wired into required CI): the thorough version — replays every migration,
  then diffs the result against the schema files, and should be empty.
  Today it is **not** empty: `supabase/migrations/**`, replayed end to
  end, produces a different end state than production itself (see
  `docs/operations/2026-08-26-migration-history-drift.md` and
  `docs/operations/SUPABASE_DRIFT_GUARD.md` — pre-existing, not introduced
  by D2). The schema files describe production, verified by an
  object-for-object match (tables, policies, functions, triggers, indexes,
  views all counted equal) after applying them fresh; wiring the full
  replay comparison as a required gate has to wait for that drift to be
  reconciled, or every PR fails on history this PR didn't create.
- Squawk (`.github/workflows/ci.yml`, `supabase` job) lints only the
  migration files a PR adds — pinned `squawk-cli@1.5.1`, blocking, checks
  for exclusive locks, missing `CONCURRENTLY`, and unsafe type changes. The
  weekly CircleCI `squawk-migrations` job stays as a full-history advisory
  sweep (`.circleci/README.md`).

## `supabase db diff --linked` is not a schema-file check

Its own `--help` says so: "Declarative files under supabase/schemas are
not part of this baseline." It compares migrations-replay against the
live/linked database, useful for production-drift investigation, but it
never reads `schema_paths`. Don't use it to validate a schema-file edit —
use `db diff -f` (no `--linked`) instead.
