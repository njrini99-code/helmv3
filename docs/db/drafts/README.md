# SQL drafts — NOT migrations, NOT applied

Everything here is **reference SQL**. It sits deliberately **outside**
`supabase/migrations/` so `supabase db push` can never pick it up and run it.

## Why this directory exists

Both files below were written during the 2026-08-19 audit and existed **only**
in `/private/tmp/claude-501/.../scratchpad/`. That path is an ephemeral agent
cache — the startup-context audit of the same date flags it as reapable and
warns it must never be treated as durable storage. The work would have vanished
with no trace in git.

A disk sweep found them by looking for the general case of a confirmed defect:
*a file the project depends on that exists in exactly one place, and that place
is not the repository.*

## Contents

### `baseball-stat-facts-forward-fix.draft.sql`

A forward fix creating `baseball_stat_facts` and
`baseball_import_field_mappings` — two of the thirteen tables that
`20260624000080_baseball_elite_stat_event_model.sql` claims to create and which
**were never created in production**.

Its header records the verification. The other eleven do exist live, under a
repair-migration stamp with a different DDL shape. A live
`information_schema.tables` search for `%stat_fact%`, `%field_mapping%` and
`%import_mapping%` returned zero rows, so this is a real absence rather than a
rename.

Deliberately narrow in scope: the source migration defines RLS policies through
a shared loop over ten tables, eight of which already exist live under different
DDL. Re-running that loop would DROP and recreate live policies. This draft
avoids that path.

**Status: NOT APPLIED. Owner review required before it becomes a migration.**

### `rls-smoke-test.draft.sql`

A transactional RLS smoke harness (`begin; … on commit drop;`) asserting
role-scoped visibility via a temporary results table. Read-only in effect, since
it rolls back — but it is a test fixture, not schema, so it does not belong in
`migrations/` either.

## Promoting a draft

1. Owner reviews and approves.
2. Copy into `supabase/migrations/<version>_<name>.sql`. Never move —
   leave the draft here.
3. Add the `-- VERIFIED:` prod-state query and `-- ROLLBACK:` note that the
   database rules require.
4. Lint it before committing:

   ```bash
   uvx sqlfluff lint --dialect postgres --rules core <file>
   ```

   The SQL ratchet is a hard gate inside `Review Gate`. A new migration that
   adds violations turns main red. That happened on 2026-08-19, which is
   why this step is written down.
