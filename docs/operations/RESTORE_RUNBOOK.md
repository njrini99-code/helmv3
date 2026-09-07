# Restore runbook (Database Plan D7)

This is a runbook for an OWNER-RUN quarterly rehearsal. No step here is
executed by an agent, and nothing in this PR performs any restore, PITR
check, or production action — this document is preparation only.

## 1. Confirm PITR is on

Dashboard path: **Project Settings -> Database -> Backups -> Point in Time
Recovery**. Confirm:

- PITR is enabled (not just daily/nightly logical backups).
- The retention window shown (days) meets the recovery objective — record
  the number here after checking rather than assuming it matches whatever
  plan tier was purchased at signup; tiers and windows have changed.
- The oldest available recovery point shown is at least as old as the
  retention window claims (a gap here means backups did not actually start
  when billing did).

## 2. Restore to a SCRATCH project — never in place

Dashboard path: **Backups -> Point in Time Recovery -> Restore**, or
`supabase projects create` + the restore API if scripting this. Always
target a **new, throwaway project** — never restore over the production
project, and never restore over any project with real user traffic.

1. Pick a recovery timestamp (UTC) at least 10 minutes in the past, to
   guarantee WAL for that point has shipped.
2. Start the restore. Record the start time.
3. Wait for the dashboard to report the new project READY. Record the
   finish time — this is the number the timing sheet (§4) exists to
   collect; restore duration is a function of database size and changes
   release to release.
4. Grab the new project's connection string and anon/service-role keys —
   these are DIFFERENT from production's and expire when the scratch
   project is torn down.

## 3. The ten verification queries

Run each against the SCRATCH project (never production). Record pass/fail
and the returned value.

1. `select count(*) from information_schema.tables where table_schema = 'public';`
   — sanity: nonzero, roughly matches production's live table count.
2. `select count(*) from golf_rounds;` — a large, high-write table restored
   with a plausible row count (compare against a same-day production count
   taken via a read-only tool before the restore, not from memory).
3. `select max(created_at) from golf_rounds;` — the newest row should be at
   or just before the chosen recovery timestamp, never after.
4. `select count(*) from pg_policies where schemaname = 'public';` — RLS
   policies restored (a restore that silently dropped policies is a
   security regression, not just a data one).
5. `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';`
   — function count roughly matches production (SECURITY DEFINER facades
   included).
6. `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'helm_debug';`
   — the `helm_debug` schema and its facades exist, if applied in
   production at recovery time.
7. `select has_function_privilege('anon', 'public.helm_jobs_enqueue(text,jsonb,text)'::regprocedure, 'EXECUTE');`
   (only if the D6 migration is applied by then) — expect `false`; a
   restore must not silently widen a grant.
8. `select extname from pg_extension order by 1;` — confirms which
   extensions the restored snapshot actually carried (pgmq, pgaudit,
   pg_cron, pg_net — whichever were enabled as of the recovery point).
9. `select count(*) from auth.users;` — auth data restored (Supabase Auth
   tables live in the same physical database as `public`).
10. Application-level check: point a LOCAL dev build at the scratch
    project's connection string (never a shared/staging deployment) and
    confirm the app boots and a basic read (e.g. the golf dashboard for a
    known seed team) renders without error.

## 4. Timing sheet

Fill in during the rehearsal — this is the number that answers "how long
would a real incident actually take":

| Step | Started (UTC) | Finished (UTC) | Duration |
|---|---|---|---|
| Restore initiated -> project READY | | | |
| Verification queries 1-9 | | | |
| Application boot check (query 10) | | | |
| Scratch project torn down | | | |
| **Total, incident-start to confirmed-good** | | | |

## 5. Tear down

Delete the scratch project when done — it holds a full copy of production
data and must not be left running. Confirm deletion in the dashboard, not
just that the create/restore flow "finished."

## 6. Cadence

A `status: owner-manual` quarterly entry is added to `config/routines.yml`
(see that file) so this rehearsal is a tracked routine, not a one-time
event that quietly stops happening. The routines check
(`npm run repo:doctor`) flags this entry only for existing — it cannot
verify a human actually ran the rehearsal; that is why the timing sheet
above exists as the artifact of having done it.
