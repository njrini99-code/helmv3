---
paths:
  - "supabase/migrations/**"
  - "**/*.sql"
  - "src/lib/supabase/**"
  - "scripts/db/**"
---
<!-- markdownlint-disable MD022 MD012 -->
# Database rules
Loads automatically when you touch SQL, migrations, or Supabase client code.
Includes the review checklist for a migration/policy PR (last section).

## Where the truth is
- **Columns**: `memory/context/golfhelm-database.md`, the `AUTOGEN:columns`
  block at the bottom, generated from `src/lib/types/database.ts`. The
  narrative above that block is stale — do not read column names off it.
- **Purposes / relationships**: `memory/glossary.md`.
- **Live check**: use any connected Supabase MCP or authenticated CLI query
  against `information_schema.columns`. Prefer the project-scoped server when
  connected; an account-wide or other connected fallback is valid when its
  target and role are verified.

Table names are sport-prefixed: `golf_*`, `baseball_*`, `helm_lifting_*`. An
unprefixed name (`players`, `rounds`, `teams`) does not exist, and neither
does a `lift_*` table — Lift Lab tables are `helm_lifting_*`. The few
cross-sport tables (`users`, `organizations`, `audit_log`) are the allowlist
in `.coderabbit/ast-grep/no-bare-table-names.yml`.

For RLS, auth/session handling, client-library/SSR integration, Edge
Functions, or a security audit, use the relevant connected Supabase guidance
and current code/live truth rather than memory. Plugin skill names are
convenient when available, not a prerequisite.

## Migrations are additive
One shared production database serves Golf, Baseball and Lift Lab, no
staging copy. No hook or permission rule blocks destructive SQL
(`docs/CONTROL_PLANE_ENFORCEMENT.md`): a `DROP`, `TRUNCATE`, WHERE-less
`DELETE`, or `DROP COLUMN` against production runs as typed. Rehearse those
(and RLS, grants, type changes, backfills) on the local Docker stack first, and
check the target and statement before sending them.

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
`npm run db:types` regenerates `src/lib/types/database.ts`. CI's
`check:types-drift` compares it with production (it warns instead of failing
when `SUPABASE_ACCESS_TOKEN` is absent). Run `node scripts/regen-docs.mjs`
afterwards to refresh the columns doc. For client/query work, load the
`helm-supabase` skill.

## Review checklist (migration or policy PR)

`supabase/schemas/**` is the declarative source of truth for current shape
(Database Plan D2); edit it, then `supabase db diff -f <name>` to generate
the matching migration — see `docs/operations/DECLARATIVE_SCHEMA.md`.

This is a multi-tenant college-athletics SaaS holding minors' academic +
athletic PII. **Database safety IS product safety** — a cross-tenant leak
is the worst-case, business-ending failure. Patterns + required tests:
`docs/v3-rls-template.md`. Schema: `memory/context/{golfhelm,baseballhelm}-database.md`.

### Always check on a migration / policy PR

- **RLS on every table** — `CREATE TABLE` ships with `ENABLE ROW LEVEL
  SECURITY` + at least one `CREATE POLICY` in the same migration.
- **No cross-team `USING (true)` on PII tables** — a SELECT policy that
  returns every row to any authenticated user (e.g. on `baseball_players`,
  `golf_*` player/roster tables) is a cross-tenant PII exposure. Read
  access must gate through the canonical helpers (`is_team_coach`,
  `is_team_player`, `is_baseball_team_staff`, `current_player_id`,
  `can_view_baseball_player`, …).
- **Forward-only migrations** — never edit a migration with timestamp
  prefix <= `20260527120000`. Fix replay failures with a new migration.
- **Service-role stays server-only** — no service-role logic outside
  `src/lib/supabase/admin*` / `src/app/api/**/admin/**`.
- **SECURITY DEFINER hygiene** — every `SECURITY DEFINER` function pins
  `SET search_path = ''` (or `'public'` per existing convention).
- **Indexes** — every FK column and every column used in an RLS predicate
  has an index. Enum additions ship in a separate migration BEFORE the
  migration that uses them (Postgres 55P04). One purpose per migration.
- **No destructive writes / idempotent imports** — no DELETE-then-INSERT
  in save/submit/sync SQL; importers update/merge, never duplicate, and
  preserve source/timestamp/confidence.
- **Verify + rollback** — a data/DDL migration carries `-- ROLLBACK:` and
  `-- VERIFY:` blocks (`npm run check:migration-headers`); `IF [NOT] EXISTS` guards; `DO $$…$$`
  around renames. A migration file being present does NOT mean it's
  applied in prod — verify against `information_schema`.

### Block if

- a new table lacks RLS or a policy; a policy allows cross-team access or
  is a bare `USING (true)` on PII;
- a migration edits historical (baseline) migrations instead of adding a
  forward one;
- service-role capability leaks outside admin/server-only paths;
- a destructive delete/insert can lose user data;
- a new FK or RLS-predicate column lacks an index;
- a `SECURITY DEFINER` function omits `search_path`.

### Suggest (non-blocking) enhancements

- A missing positive/negative/cross-team/transfer RLS test for a new
  policy (`docs/v3-rls-template.md` testing section).
- An index that a new RLS predicate or hot query will need.
- Capturing source/timestamp/confidence columns on a new import target so
  later automation and dedup are possible.
