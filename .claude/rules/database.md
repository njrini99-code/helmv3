<!-- markdownlint-disable MD022 MD012 -->
---
paths:
  - "supabase/migrations/**"
  - "**/*.sql"
  - "src/lib/supabase/**"
  - "scripts/db/**"
---

# Database rules
Loads automatically when you touch SQL, migrations, or Supabase client code.
Review checklist for a migration/policy PR: `.claude/rules/database-review.md`.

## Where the truth is
- **Columns**: `memory/context/golfhelm-database.md`, the `AUTOGEN:columns`
  block at the bottom, generated from `src/lib/types/database.ts`. The
  narrative above that block is stale — do not read column names off it.
- **Purposes / relationships**: `memory/glossary.md`.
- **Live check**: the account-wide Supabase connector's `execute_sql`
  against `information_schema.columns` — free and always right.

Table names are sport-prefixed: `golf_*`, `baseball_*`, `helm_lifting_*`. An
unprefixed name (`players`, `rounds`, `teams`) does not exist, and neither
does a `lift_*` table — Lift Lab tables are `helm_lifting_*`. The few
cross-sport tables (`users`, `organizations`, `audit_log`) are the allowlist
in `.coderabbit/ast-grep/no-bare-table-names.yml`.

For RLS, auth/session handling, client-library/SSR integration, Edge
Functions, or a security audit, invoke `supabase:supabase` (and
`supabase:supabase-postgres-best-practices` for query/schema performance)
rather than working from memory — use the plugin-namespaced skill names.

## Migrations are additive
One shared production database serves Golf, Baseball and Lift Lab, no
staging copy. `guard-sql.mjs` (`PreToolUse`) refuses `DROP TABLE`/`SCHEMA`,
`TRUNCATE`, a WHERE-less `DELETE FROM`, and `ALTER ... DROP COLUMN`
reaching a Supabase MCP `execute_sql`/`apply_migration` call or a Bash
`psql`/`supabase db` command — text matching, not a parser: a runtime-built
statement it can't see whole may slip past, and `GRANT`/`ALTER ROLE`/
`DROP FUNCTION` are deliberately out of scope.
`docs/CONTROL_PLANE_ENFORCEMENT.md` and `npm run control-plane:verify`
(`user-global/no-stale-hook-claim`, reading `~/.claude/settings.json`'s
autoMode block) are the live authority on drift. Beyond the hook, a
destructive change is still the owner's to make by hand — a convention,
not a mechanism.

## Grants: anon is the unauthenticated role
Never `GRANT ... TO anon` or `TO PUBLIC` — anyone holding the publishable
key is `anon`, and this has reached production before. `SECURITY DEFINER`
bypasses RLS and Postgres grants `EXECUTE` to `PUBLIC` by default, so pair
every definer function with a matching revoke:

```sql
REVOKE EXECUTE ON FUNCTION fn(args) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn(args) TO authenticated;
```

Recreating a materialized view re-grants to anon — re-`REVOKE` after and
verify against `pg_class.relacl` rather than assuming.

## The two silent-wrong-answer traps
**PostgREST caps every request at 1,000 rows.** `.limit(2000)` does not
raise the cap — it returns 1,000 and looks complete. Paginate via
`fetchAllRows`/`fetchAllRowsResult` for anything over rounds, shots, or holes.

**PostgREST filters travel in the URL.** An `.in('id', ids)` list costs
~39 bytes per uuid and the edge rejects the request past ~22.8 KB (~585
ids) with a bare `400 Bad Request` that looks like a query error. Chunk id
lists at 200.

## Applied ≠ recorded
`schema_migrations` has been wrong in this project: migrations recorded as
applied that never ran. Check `information_schema`/`pg_policies` directly
before depending on a column or policy existing. `npm run db:drift:check`
is the broader comparison.

## After a schema change
`npm run db:types` regenerates `src/lib/types/database.ts`; CI fails if it
drifts (`db:types:check`), and running it refreshes the columns doc on the
next `node scripts/regen-docs.mjs`.
