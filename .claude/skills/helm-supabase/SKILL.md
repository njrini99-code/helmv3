---
name: helm-supabase
description: Traps and tooling for any Supabase/Postgres work in this repo — key precedence, the 1,000-row PostgREST cap, the .in() URL-length limit, applied-vs-recorded migrations, and connected database access. Triggers on src/lib/supabase/**, supabase/**, scripts/db/**, and any file calling createClient.
---

# helm-supabase

## Key precedence (`src/lib/supabase/keys.mjs`)
New-format keys are checked FIRST, legacy JWTs are the fallback: publishable
key before anon key, secret key before service-role key. Never read
`process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
directly — call the exported resolver. Edge Runtime and the browser bundle
only see the literal `process.env.X` member expressions a bundler's static
scan found, so don't refactor a lookup into a helper that takes the var name
as a string parameter.

## The 1,000-row cap
PostgREST caps every request at 1,000 rows. `.limit(2000)` does not raise the
cap — it silently returns 1,000 and looks complete. Use `fetchAllRows` /
`fetchAllRowsResult` (`src/lib/supabase/fetch-all-rows.ts`) for anything that
can exceed that over rounds, shots, holes, or events. If you destructure the
wrapper's result, bind `error` — `helm/no-unchecked-paginated-read` flags a
bare `{ data }` destructure because a FAILED read and an EMPTY table look
identical downstream.

## The `.in()` chunk rule
PostgREST filters travel in the URL. `.in('id', ids)` costs ~39 bytes per
uuid; past ~585 ids (~22.8 KB) the edge returns a bare `400 Bad Request` that
reads like a query error, not a size limit. Chunk with `chunkIds`
(`src/lib/supabase/chunk-ids.ts`, `ID_CHUNK_SIZE = 200`) and loop/merge.
`helm/no-unchunked-in-filter` (ratchet: `npm run audit:supabase-chunks`)
flags an unwrapped identifier or array literal handed to `.in()`.

## Applied ≠ recorded
`schema_migrations` has been wrong before — migrations recorded as applied
that never ran. Never trust a migration file's existence; verify the objects
it claims directly:

```sql
select column_name from information_schema.columns where table_name = '<table>';
select policyname from pg_policies where tablename = '<table>';
select proname from pg_proc where proname = '<function>';
```

## Every Supabase call: read `error`
`supabase-js` resolves database errors as `{ data: null, error }` — it does
not throw. A bare `const { data } = await supabase.from(...)` turns a FAILED
read into an EMPTY one, and the UI states that emptiness as fact.
`helm/no-unchecked-supabase-error` (ratchet: `npm run audit:supabase-errors`)
flags this shape, including a whole-result binding whose `.error` is never
read anywhere in scope. Bind `error`; deciding what to do with it (throw,
log, degrade) is your call — the rule only requires you not overlook it.
Run both ratchets together: `npm run lint:supabase:ratchet`.

## Supabase MCP and database access
Use any connected Supabase MCP or authenticated repo-local CLI available to
the session. The project-scoped `mcp__supabase__*` server is the preferred Helm
path; an account-wide or other connected Supabase fallback is valid when its
current target and role are verified. Read the live operation set and current
connector result rather than inferring capability from an old namespace or
a stale authority snapshot. Read-only inspection may use `execute_sql` when
that operation is exposed. The `guard-sql` hook still blocks its destructive
statement classes, as it does for every connected MCP path.

## Advisor output is large — filter by class
A `get_advisors` pull returns every security/performance finding at once.
Filter by advisor class (e.g. `security` vs `performance`) before reading —
don't dump the whole payload into context. `scripts/db/advisor-ratchet.mjs`
already does this per class for the drift-alert baseline
(`supabase-advisor-baseline.json`).

## When to invoke deeper guidance
Use a connected Supabase skill when it is available for RLS, auth/session
handling, client-library or SSR integration, Edge Functions, and query/schema
performance. Otherwise inspect current code and live database truth directly;
a missing skill connection is not a policy ban.

## Migration review
For a shared or production migration, review the SQL and target with
`.claude/rules/database-review.md` before applying. Local-only work can follow
the task's normal verification. A reviewer agent is optional and risk-based;
already-given task authorization does not need to be requested again.

## Applying a migration
Use the reviewed, task-authorized write-capable Supabase MCP or
`npm run db:apply`, after confirming the target and SQL. A connected fallback
is valid when it exposes the needed capability. Do not ask the user to repeat
permission already granted for this task. `guard-sql` continues to block its
destructive statement classes; read-only `execute_sql` remains valid for
diagnostics.
