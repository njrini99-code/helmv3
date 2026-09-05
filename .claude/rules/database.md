---
paths:
  - "supabase/migrations/**"
  - "**/*.sql"
  - "src/lib/supabase/**"
  - "scripts/db/**"
verified: 2026-08-20-mechanical  # paths + table names machine-checked this date (docs:path-drift / docs:schema-drift); PROSE not re-read against code
---

# Database rules

Loads automatically when you touch SQL, migrations, or Supabase client code.

## Where the truth is

- **Columns**: `memory/context/golfhelm-database.md`, the `AUTOGEN:columns` block
  at the bottom. Generated from `src/lib/types/database.ts`; covers every
  table in that file (the count lives in the block, not here). The narrative
  above that block is stale — do not read column names off it.
- **Purposes / relationships**: `memory/glossary.md`.
- **Live check**: `mcp__claude_ai_Supabase__execute_sql` against
  `information_schema.columns`. Free and always right — prefer it over guessing.

Table names are sport-prefixed: `golf_*`, `baseball_*`, `helm_lifting_*`. An
unprefixed name (`players`, `rounds`, `teams`) does not exist — and neither
does a `lift_*` table: this line said `lift_*` until 2026-09-01 while
`src/lib/types/database.ts` held dozens of `helm_lifting_` tables and zero
`lift_` ones. The few cross-sport tables (`users`, `organizations`,
`audit_log`) are the allowlist in `.coderabbit/ast-grep/no-bare-table-names.yml`.

## Load the Supabase skill for real Supabase work

For RLS policies, auth/session handling, client-library or SSR integration, Edge
Functions, or a security audit, invoke `supabase:supabase` (and
`supabase:supabase-postgres-best-practices` for query/schema performance) rather
than working from memory. They carry the current official guidance; this file
only carries what is specific to *this* database.

Use the plugin-namespaced names. This sentence used to name a version gap
("v0.1.0 vs v0.1.2") as the reason the older, unnamespaced `supabase` /
`supabase-postgres-best-practices` copies were "retired" — a version number
in prose rots (shipping.md §1), and by 2026-09-05 it already had: the
namespaced plugin skill had moved well past either number. Verified instead
of asserted: `.claude/skills/supabase` and `.claude/skills/
supabase-postgres-best-practices` are DANGLING symlinks in this repo (they
point at `.agents/skills/...`, which does not exist here — the same dangling
class AGENTS.md's tools audit found under `~/.claude/skills`), so they were
never a live alternative to retire *from* — they simply do not resolve. The
plugin-namespaced skills are the ones that load.

## Migrations are additive

One shared production database serves Golf, Baseball and Lift Lab, and there is
no staging copy.

**Destructive SQL is UNENFORCED. Treat it that way.** `DROP TABLE`, `TRUNCATE`
and unqualified `DELETE FROM` are stopped by nothing on either the file-write
path or the MCP `execute_sql` path. `guard-sql.sh` was deleted 2026-08-27 and
had been unwired before that. `docs/CONTROL_PLANE_ENFORCEMENT.md` resolves this
claim against live configuration on every regeneration — read it there rather
than trusting this paragraph.

This line used to say the opposite: that those statements were "blocked by a
PreToolUse hook on both the file-write and MCP paths". That was false on both
paths, and the only PreToolUse hook in the repo says in its own header that it
"does not look at branch names, file names, features or prompts — it compares
two absolute paths."

**The false version escaped this repo, once.** `~/.claude/settings.json`'s
autoMode environment block repeated it as *"DROP TABLE / TRUNCATE / unqualified
DELETE are blocked by a PreToolUse hook **per repo docs**"* — sourced from
here, and for a while informing permission decisions across every project on
the machine. That file is user-global and outside this project's mutation
boundary, so it was never corrected from here. Whether the sentence is present
NOW is not something this paragraph can know: `npm run control-plane:verify`
measures it on every run (`user-global/no-stale-hook-claim`), and on
2026-09-01 that check read PASS — the copy had been fixed on the owner's side.
(This paragraph said "User-global copy: still stale" until then, which had
become its own stale claim.)

What actually protects the database is that a destructive change is the owner's
to make by hand, where the blast radius is visible. That is a convention, not a
mechanism, and the difference is the whole point of this section.

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

---

# Database review checklist

This is a multi-tenant college-athletics SaaS holding minors' academic +
athletic PII. **Database safety IS product safety** — a cross-tenant leak is the
worst-case, business-ending failure. Patterns + required tests:
`docs/v3-rls-template.md`. Schema: `memory/context/{golfhelm,baseballhelm}-database.md`.

## Always check on a migration / policy PR
- **RLS on every table** — `CREATE TABLE` ships with `ENABLE ROW LEVEL SECURITY`
  + at least one `CREATE POLICY` in the same migration.
- **No cross-team `USING (true)` on PII tables** — a SELECT policy that returns
  every row to any authenticated user (e.g. on `baseball_players`,
  `golf_*` player/roster tables) is a cross-tenant PII exposure. Read access must
  gate through the canonical helpers (`is_team_coach`, `is_team_player`,
  `is_baseball_team_staff`, `current_player_id`, `can_view_baseball_player`, …).
- **Forward-only migrations** — never edit a migration with timestamp prefix
  <= `20260527120000`. Fix replay failures with a new migration.
- **Service-role stays server-only** — no service-role logic outside
  `src/lib/supabase/admin*` / `src/app/api/**/admin/**`.
- **SECURITY DEFINER hygiene** — every `SECURITY DEFINER` function pins
  `SET search_path = ''` (or `'public'` per existing convention).
- **Indexes** — every FK column and every column used in an RLS predicate has an
  index. Enum additions ship in a separate migration BEFORE the migration that
  uses them (Postgres 55P04). One purpose per migration.
- **No destructive writes / idempotent imports** — no DELETE-then-INSERT in
  save/submit/sync SQL; importers update/merge, never duplicate, and preserve
  source/timestamp/confidence.
- **Verified + rollback** — migrations carry a `-- VERIFIED:` prod-state query
  and a `-- ROLLBACK:` note; `IF [NOT] EXISTS` guards; `DO $$…$$` around renames.
  Remember: a migration file being present does NOT mean it's applied in prod
  (verify against `information_schema`, not the migration history).

## Block if
- a new table lacks RLS or a policy; a policy allows cross-team access or is a
  bare `USING (true)` on PII;
- a migration edits historical (baseline) migrations instead of adding a forward
  one;
- service-role capability leaks outside admin/server-only paths;
- a destructive delete/insert can lose user data;
- a new FK or RLS-predicate column lacks an index;
- a `SECURITY DEFINER` function omits `search_path`.

## Suggest (non-blocking) enhancements
- A missing positive/negative/cross-team/transfer RLS test for a new policy
  (`docs/v3-rls-template.md` testing section).
- An index that a new RLS predicate or hot query will need.
- Capturing source/timestamp/confidence columns on a new import target so later
  automation and dedup are possible.

---
*Promoted 2026-08-18 from the per-directory database review-rules file, orphaned when the
external review bots were dropped 2026-07-20. The golf/baseball/coachhelm
siblings were promoted on 2026-08-09; this one was missed and sat unread for
nine days while the file it cascaded onto no longer existed.*
