# Supabase database runbooks

Ordered diagnostic procedures for the two database failures that account for
most of Helm's actionable Postgres errors. Brief §68.

Each step names the exact command or query to run. Work them in order: the
order encodes which answers make later steps unnecessary, and skipping ahead
to the interesting-looking step is how a permission problem gets diagnosed as
a plan problem.

Two conventions used throughout:

- Read paths go through `helm_debug` definer-rights functions, because the
  `helm_debug` schema is not exposed through PostgREST and is revoked from
  `public`, `anon` and `authenticated`. There is no direct table read.
- Production is a single shared database serving live users, with no staging
  copy. Every step below is read-only unless it says otherwise.

## 42501 — insufficient privilege

The caller was refused before any row was touched. The single most important
question comes first, because it decides whether there is a defect at all.

### 1. Is this denial EXPECTED

Not every 42501 is a bug. A player attempting a coach-only action produces
one, and that is row-level security working. Check how the classifier already
labelled it before doing anything else.

```bash
npx vitest run src/lib/observability/supabase/__tests__/classify.test.ts
```

The discriminating rule lives in `src/lib/observability/supabase/classify.ts`.
An `expected` classification ends the runbook: record the classification and
stop. An `unexpected` one continues.

### 2. Is the target an RPC or a relation

The envelope carries this already. Read the grouped errors for the
fingerprint:

```text
Bridge -> Database -> Errors, grouped by fingerprint
RPC:      helm_debug_read_db_error_events, field `rpc`
Relation: helm_debug_read_db_error_events, field `relation`
```

The fingerprint's fourth segment is the object. An RPC and a relation fail
for different reasons and steps 3 to 7 differ accordingly.

### 3. For a function: is it invoker-rights or definer-rights

```sql
select p.proname,
       p.prosecdef as is_definer_rights,
       pg_get_userbyid(p.proowner) as owner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = '<function name>';
```

An invoker-rights function runs with the caller's privileges, so the caller
needs rights on every object the function touches. A definer-rights function
runs as its owner, so the caller needs only EXECUTE — and the owner needs the
rest. A function that was invoker-rights and is now definer-rights, or the
reverse, is a common cause of a denial that appeared without any policy
change.

### 4. For a definer-rights function: is `search_path` pinned

```sql
select p.proname, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = '<function name>';
```

`proconfig` must contain a `search_path=` entry. A definer-rights function
without a fixed `search_path` resolves object names against the caller's
path, which is both a denial source and a security defect. Fix it in a
migration, not in place.

### 5. Does the role hold USAGE on the schema

```sql
select has_schema_privilege('authenticated', 'public', 'USAGE') as authenticated_usage,
       has_schema_privilege('anon', 'public', 'USAGE') as anon_usage,
       has_schema_privilege('service_role', 'public', 'USAGE') as service_role_usage;
```

Without schema USAGE, every object inside it is unreachable regardless of
table or function grants. This is the check most often skipped.

### 6. Does the role hold EXECUTE, or the table privilege

```sql
-- function
select has_function_privilege('authenticated', '<function name>(<arg types>)', 'EXECUTE');

-- relation
select has_table_privilege('authenticated', '<relation>', 'SELECT') as can_select,
       has_table_privilege('authenticated', '<relation>', 'INSERT') as can_insert,
       has_table_privilege('authenticated', '<relation>', 'UPDATE') as can_update;
```

Recreating a view or a materialized view re-grants `anon`. If this step finds
a grant that should not exist, REVOKE it and verify — do not leave it because
it makes the error go away.

### 7. Is there a row-level-security policy that admits this caller

```sql
select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) as using_expr
  from pg_policy
 where polrelid = '<relation>'::regclass;

select relname, relrowsecurity, relforcerowsecurity
  from pg_class where oid = '<relation>'::regclass;
```

RLS enabled with no matching policy denies everything, and looks identical to
a missing grant from the client's side. Distinguish them with steps 5 and 6
before concluding.

### 8. Did a release or migration change this

```bash
npm run db:drift:check
npm run db:ledger-drift
git log --oneline -20 -- supabase/migrations
```

Correlate the first occurrence timestamp on the error fingerprint against the
release. A denial that starts at a deploy boundary is a migration or a
call-site change, not a policy that drifted on its own.

### 9. Reproduce as the role, on a LOCAL stack

```bash
npx supabase start
npx supabase db reset   # local only; denied against production by policy
```

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<a local test user id>","role":"authenticated"}';
-- run the statement here
rollback;
```

Reproduce locally before changing anything in production. `set local role`
inside a transaction that always rolls back is the safe way to see what the
caller sees.

### What NOT to do

Do not grant `anon` to make a denial stop. INC-2026-08-27 records exactly
this temptation: the failing path touched two objects that deliberately
withhold `anon`, and granting it would have traded an observability bug for a
data-exposure one. The repair was to use the correct client at the call site.

## 57014 — query canceled (statement timeout)

The statement did not finish inside its budget. It may have spent that budget
working, or waiting. Those are different faults with different repairs, and
step 3 is where they separate.

### 1. Which timeout fired, and what is the role's budget

```sql
select rolname, rolconfig
  from pg_roles
 where rolname in ('authenticated', 'anon', 'service_role', 'authenticator');

show statement_timeout;
```

The measured `service_role` budget for this project is recorded in
`docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md`. A client-side
abort is not a 57014 — if the SQLSTATE is absent, you are looking at a
transport timeout and belong in the commit-outcome model
(`src/lib/observability/supabase/commit-outcome.ts`) instead.

### 2. Is this new, or has it always happened

```text
Bridge -> Database -> Errors: first_seen / last_seen on the fingerprint
Bridge -> Database -> Query Performance: the class's delta history
```

A fingerprint whose first occurrence is hours old behaves differently from
one that has fired weekly for a month. Establish which before hypothesizing.

### 3. Was the time spent WAITING or WORKING

This is the step the whole runbook exists for.

```sql
select bl.pid as blocked_pid,
       bl.wait_event_type,
       bl.wait_event,
       now() - bl.query_start as blocked_for,
       kl.pid as blocking_pid,
       now() - kl.state_change as blocker_state_age,
       kl.state as blocker_state
  from pg_stat_activity bl
  join pg_locks bard on bard.pid = bl.pid and not bard.granted
  join pg_locks kl_lock
       on kl_lock.locktype = bard.locktype
      and kl_lock.database is not distinct from bard.database
      and kl_lock.relation is not distinct from bard.relation
      and kl_lock.transactionid is not distinct from bard.transactionid
      and kl_lock.granted
  join pg_stat_activity kl on kl.pid = kl_lock.pid
 where bl.datname = current_database();
```

The recorded history is also available without a live session:

```text
helm_debug_read_db_lock_incidents  (Bridge -> Database -> Locks & Transactions)
```

A statement that spent its budget blocked has nothing wrong with its plan.
Stop here and work the blocker: an idle-in-transaction session, a long
migration, a competing bulk write. Only if the time was spent WORKING do
steps 4 and 5 apply.

### 4. Did the query's shape regress

```text
Bridge -> Database -> Query Performance: mean, max, calls, rows per call,
cache hit ratio, temp blocks — per safe query class, per window
```

Use `explainQueryClass` in
`src/lib/observability/supabase/query-explainer.ts` to turn that shape into
ordered hypotheses. Note what it can and cannot tell you: pg_stat_statements
carries `calls`, `total_exec_time`, `min`, `max`, `mean` and `stddev`, and no
distribution at all. There is no p95 here and one must never be derived from
mean and stddev — see `layered-performance.ts`.

### 5. Did a release change the shape

```bash
git log --oneline -20
npm run db:drift:check
```

Compare the statement's delta history either side of the deploy boundary, and
check the request layer at the same time. "Request p95 regressed AND the
database regressed" and "the request is slow while the database is stable"
are different findings; `evaluateLayeredPerformance` returns them separately
and returns `request_unknown` rather than guessing when one layer is blind.

### 6. Did a retry duplicate the work, or leave an unknown commit

A timeout is not proof that nothing was written. The statement may have
committed and the response been lost.

```text
src/lib/observability/supabase/commit-outcome.ts
  TRANSPORT_TIMEOUT | DURABLE_FAILURE | DURABLE_SUCCESS_AFTER_TIMEOUT | UNKNOWN_COMMIT
```

Resolve an `UNKNOWN_COMMIT` by reading back, never by assuming. A client
timeout is not rollback evidence, and a retry issued on that assumption is
how one slow request becomes two rows.

### RAISING THE STATEMENT TIMEOUT IS NEVER THE FIX

Not for any 57014, in any environment, under any deadline.

The timeout is not the fault. It is the mechanism that stopped a runaway
statement from holding a connection, a lock and a snapshot for as long as it
liked. Raising it does not make the query fast — it makes the same query
occupy the instance for longer, holds its locks longer, blocks more of the
callers behind it, and converts one slow endpoint into a connection-pool
exhaustion that takes down endpoints with no relationship to the original
query. On this project the pool is small (`max_connections` is recorded in
the measured-truth document), so that conversion happens quickly.

It also destroys the signal. A statement that used to fail loudly at a known
boundary now succeeds sometimes, at a latency nobody is alerting on, and the
regression stops being visible until a user reports it.

The fix is always one of: repair the blocker (step 3), repair the plan or the
index (step 4), reduce the work the statement is asked to do, or move it off
the request path. If none of those is possible before a deadline, degrade the
feature deliberately and record why — do not widen the budget quietly.

## Where these runbooks are referenced

- `src/lib/observability/supabase/query-explainer.ts` sends a
  timeout-reaching statement to the 57014 lock step before the plan step.
- `docs/observability/SUPABASE_OPERATING_MODEL.md` covers the state model
  these runbooks are entered from.
