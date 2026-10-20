-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-20 for CoachHelm Slice 1
-- (support and the claim ladder); the owner applies it after review
-- (supabase/migrations/HELD.md row).
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261020114500_golf_coachhelm_run_log.sql
-- Risk: LOW. One new table with RLS on and no policy for anon or for any
-- non-admin user; nothing existing changes. No backfill.
--
-- ORDER: no prerequisite. The writer (src/lib/coachhelm/v3/support/run-log.ts)
-- runs only behind the flag coachhelm_support_v1 (off) and treats a missing
-- table (42P01 / PGRST205) as "run log not available", so the app may ship
-- before or after this apply.
--
-- WHY (02-accuracy-standard §5 "Accounting", 04 §1.5, 07 §2 C and H): the
-- engine tests about 60 hypotheses per player per run and has never recorded
-- how many it tested, how many cleared Benjamini-Hochberg, or why the rest
-- were held back. Without that, the false-read rate and the Watching list
-- ("8 more putts from 4-6 ft") cannot be computed, and the Track record
-- (02 §9) would need a back-test for every number. One row per player per
-- engine run.
--
-- WHAT A ROW HOLDS: counts only (candidates, testable, supported, shown =
-- eligible for a surface before delivery caps), jsonb tallies by rule
-- (suppressed), by rung (rungs) and by family (families), and the Watching
-- list (family, unit, have/need counts). No names, no free text, no insight
-- content. player_id and newest_round_id are ids the engine already logs.
--
-- WHO READS IT: super admins only (the Bridge reads with service_role). A
-- coach or player has no policy and reads nothing; anon has no grant.
--
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_coachhelm_run_log; the writer
-- then reports "not available" again and the engine is unaffected.
--
-- `npm run test:rls` could not run where this was written (no Docker); the
-- policy shape copies admin_error_resolutions (20260827031754).
--
-- VERIFY: select 1 where exists (select 1 from information_schema.tables
-- VERIFY: where table_schema = 'public'
-- VERIFY: and table_name = 'golf_coachhelm_run_log');
-- VERIFY: select 1 where (select relrowsecurity from pg_class
-- VERIFY: where oid = 'public.golf_coachhelm_run_log'::regclass);
-- VERIFY: select 1 where (select count(*) from pg_policies
-- VERIFY: where schemaname = 'public'
-- VERIFY: and tablename = 'golf_coachhelm_run_log') = 1;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.golf_coachhelm_run_log', 'SELECT')
-- VERIFY: and not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_run_log', 'INSERT');

create table if not exists public.golf_coachhelm_run_log (
    id uuid primary key default gen_random_uuid(),
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    run_at timestamptz not null default now(),
    trigger text not null default 'unspecified'
    check (
        trigger in ('round', 'sweep', 'manual', 'checkpoint', 'unspecified')
    ),
    -- The player's newest countable round (isCountableRound) when the run
    -- finished.
    newest_round_id uuid references public.golf_rounds (id) on delete set null,
    -- Every candidate read the run evaluated (BH's m), untestable included.
    candidates bigint not null default 0 check (candidates >= 0),
    testable bigint not null default 0 check (testable >= 0),
    -- BH-adjusted q <= 0.10.
    supported bigint not null default 0 check (supported >= 0),
    -- Working hypothesis or above: eligible for a surface before the 3 + 1 cap.
    shown bigint not null default 0 check (shown >= 0),
    -- { rule: count } for candidates held at Not enough yet (first reason).
    suppressed jsonb not null default '{}'::jsonb,
    -- { rung: count } over all candidates.
    rungs jsonb not null default '{}'::jsonb,
    -- { family: { rung: count } }.
    families jsonb not null default '{}'::jsonb,
    -- [{ family, unit, have_n, need_n, rounds_have, rounds_need }],
    -- capped at 50.
    watching jsonb not null default '[]'::jsonb,
    tests_in_run bigint not null default 0 check (tests_in_run >= 0),
    engine_version text not null default 'v3',
    support_version text not null default 'support_v1',
    created_at timestamptz not null default now(),
    constraint golf_coachhelm_run_log_counts_ordered
    check (
        testable <= candidates
        and supported <= testable
        and shown <= candidates
    )
);

comment on table public.golf_coachhelm_run_log is
'CoachHelm engine accounting, one row per player per run (Slice 1, flag '
'coachhelm_support_v1): candidates tested, BH-supported, eligible, held back '
'by rule, and the ladder distribution. Counts only; admin-only.';

create index if not exists idx_golf_coachhelm_run_log_player_run_at
on public.golf_coachhelm_run_log (player_id, run_at desc);

create index if not exists idx_golf_coachhelm_run_log_run_at
on public.golf_coachhelm_run_log (run_at desc);

-- Covers the newest_round_id foreign key (ON DELETE SET NULL scans it).
create index if not exists idx_golf_coachhelm_run_log_newest_round
on public.golf_coachhelm_run_log (newest_round_id)
where newest_round_id is not null;

alter table public.golf_coachhelm_run_log enable row level security;

drop policy if exists golf_coachhelm_run_log_select_super_admin
on public.golf_coachhelm_run_log;
create policy golf_coachhelm_run_log_select_super_admin
on public.golf_coachhelm_run_log
for select
to authenticated
using ((select public.is_super_admin()));

revoke all on public.golf_coachhelm_run_log from anon;
revoke all on public.golf_coachhelm_run_log from authenticated;
grant select on public.golf_coachhelm_run_log to authenticated;
grant select, insert on public.golf_coachhelm_run_log to service_role;
