---
paths:
  - "supabase/migrations/**"
  - "**/*.sql"
  - "src/lib/supabase/**"
  - "scripts/db/**"
---

# Database rules

Loads automatically when you touch SQL, migrations, or Supabase client code.

## Where the truth is

- **Columns**: `memory/context/golfhelm-database.md`, the `AUTOGEN:columns` block
  at the bottom. Generated from `src/lib/types/database.ts`; covers all 266
  tables. The narrative above that block is stale — do not read column names off it.
- **Purposes / relationships**: `memory/glossary.md`.
- **Live check**: `mcp__claude_ai_Supabase__execute_sql` against
  `information_schema.columns`. Free and always right — prefer it over guessing.

Table names are sport-prefixed: `golf_*`, `baseball_*`, `lift_*`. An unprefixed
name (`players`, `rounds`, `teams`) does not exist.

## Load the Supabase skill for real Supabase work

For RLS policies, auth/session handling, client-library or SSR integration, Edge
Functions, or a security audit, invoke `supabase:supabase` (and
`supabase:supabase-postgres-best-practices` for query/schema performance) rather
than working from memory. They carry the current official guidance; this file
only carries what is specific to *this* database.

Use the plugin-namespaced names. Older unnamespaced `supabase` /
`supabase-postgres-best-practices` copies were stale (v0.1.0 vs v0.1.2) and have
been retired.

## Migrations are additive

One shared production database serves Golf, Baseball and Lift Lab. `DROP TABLE`,
`TRUNCATE`, and unqualified `DELETE FROM` are blocked by a PreToolUse hook on
both the file-write and MCP paths. That is deliberate — if a destructive change
is genuinely needed, the owner does it by hand where the blast radius is visible.

## Grants: anon is the unauthenticated role

Never `GRANT ... TO anon` or `TO PUBLIC`. Anyone holding the publishable key is
`anon`. This has reached production before.

`SECURITY DEFINER` runs with the owner's rights and bypasses RLS, and Postgres
grants `EXECUTE` to `PUBLIC` by default — so a definer function without a
matching revoke is callable by anon. Always pair them:

```sql
REVOKE EXECUTE ON FUNCTION fn(args) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn(args) TO authenticated;
```

Recreating a materialized view re-grants to anon. Re-`REVOKE` after, and verify
against `pg_class.relacl` rather than assuming.

## The two silent-wrong-answer traps

**PostgREST caps every request at 1,000 rows.** `.limit(2000)` does not raise the
cap — it returns 1,000 and looks complete. Aggregates over rounds, shots or holes
must paginate via `fetchAllRows` / `fetchAllRowsResult`. A "short page" test
against a threshold above 1,000 can never fire.

**PostgREST filters travel in the URL.** An `.in('id', ids)` list costs ~39 bytes
per uuid and the edge rejects the request past ~22.8 KB — 585 ids — with a bare
`400 Bad Request` that looks like a query error. Chunk id lists at 200.

## Applied ≠ recorded

`schema_migrations` has been wrong in this project: migrations recorded as
applied that never ran. Before depending on a column or policy existing, check
`information_schema` / `pg_policies` directly. `npm run db:drift:check` exists
for the broader comparison.

## After a schema change

`npm run db:types` regenerates `src/lib/types/database.ts`; CI fails if it drifts
(`db:types:check`). Running it also refreshes the columns doc on the next
`node scripts/regen-docs.mjs`.
