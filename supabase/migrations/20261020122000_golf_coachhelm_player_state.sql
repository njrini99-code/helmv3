-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-20 for CoachHelm Slice 3
-- (lifecycle: checkpoints, recheck, Contradicted, Under review, archive
-- rules); the owner applies it after review (supabase/migrations/HELD.md row).
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261020122000_golf_coachhelm_player_state.sql
-- Risk: LOW. One new table with RLS on; nothing existing changes. No backfill.
--
-- ORDER: no prerequisite. The only reader and writer
-- (src/lib/coachhelm/v3/lifecycle/job.ts, called from the nightly
-- coachhelm-insight-lifecycle cron) runs only behind the flag
-- coachhelm_recheck_v1 (off) and treats a missing table (42P01 / PGRST205)
-- as "lifecycle not available", so the app may ship before or after this
-- apply. Turn the flag on only after this is applied.
--
-- WHY (02-accuracy-standard §5 "Checkpoints", 07 §2 D): CoachHelm re-judges
-- a read after every round today, so a player with two rounds a week is
-- looked at about 24 times in 12 weeks and a null metric crosses a 5% line
-- about a quarter of the time. The design re-judges rungs only at a
-- checkpoint: >= 3 new countable rounds, or >= 20 new attempts in one shot
-- family, since the last checkpoint. This table is the per-player counter.
--
-- WHAT A ROW HOLDS: ids the system already stores (the player, the round the
-- last checkpoint fired on), counts (rounds since, attempts since by family,
-- checkpoints so far) and timestamps. No names, no free text.
--
-- WHO READS IT: the player (own row, through golf_players.user_id), a coach
-- of a team the player is an active member of, super admins. WHO WRITES IT:
-- service_role only (the nightly cron); authenticated has SELECT only.
--
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_coachhelm_player_state; the job
-- then reports "not available" and every read keeps today's age rules.
--
-- `npm run test:rls` could not run where this was written (no Docker); the
-- policy shape copies golf_coachhelm_corrections (20261020121000, Slice 6a).
--
-- VERIFY: select 1 where exists (select 1 from information_schema.tables
-- VERIFY: where table_schema = 'public'
-- VERIFY: and table_name = 'golf_coachhelm_player_state');
-- VERIFY: select 1 where (select relrowsecurity from pg_class
-- VERIFY: where oid = 'public.golf_coachhelm_player_state'::regclass);
-- VERIFY: select 1 where (select count(*) from pg_policies
-- VERIFY: where schemaname = 'public'
-- VERIFY: and tablename = 'golf_coachhelm_player_state') = 1;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.golf_coachhelm_player_state', 'SELECT')
-- VERIFY: and not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_player_state', 'INSERT')
-- VERIFY: and not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_player_state', 'UPDATE');

create table if not exists public.golf_coachhelm_player_state (
    player_id uuid primary key
    references public.golf_players (id) on delete cascade,
    -- The countable round the newest checkpoint fired on (null before the
    -- first one; the first nightly pass only sets the baseline).
    last_checkpoint_round_id uuid
    references public.golf_rounds (id) on delete set null,
    last_checkpoint_at timestamptz,
    -- Checkpoints fired so far (the baseline is 0).
    checkpoint_count integer not null default 0
    check (checkpoint_count >= 0),
    -- Countable rounds after last_checkpoint_round_id.
    rounds_since integer not null default 0 check (rounds_since >= 0),
    -- { family: attempts } since the last checkpoint, for the shot families
    -- in src/lib/coachhelm/v3/lifecycle/checkpoint.ts.
    attempts_since jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attempts_since) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.golf_coachhelm_player_state is
'CoachHelm checkpoint counter per player (Slice 3, flag coachhelm_recheck_v1): '
'countable rounds and per-family attempts since the last checkpoint. Reads '
'are rechecked, paired and archived only when a checkpoint fires. 07 §2 D.';

-- Covers the last_checkpoint_round_id foreign key (ON DELETE SET NULL).
create index if not exists idx_golf_coachhelm_player_state_checkpoint_round
on public.golf_coachhelm_player_state (last_checkpoint_round_id)
where last_checkpoint_round_id is not null;

-- The nightly job processes the least recently updated players first.
create index if not exists idx_golf_coachhelm_player_state_updated_at
on public.golf_coachhelm_player_state (updated_at);

alter table public.golf_coachhelm_player_state enable row level security;

drop policy if exists golf_coachhelm_player_state_select
on public.golf_coachhelm_player_state;
create policy golf_coachhelm_player_state_select
on public.golf_coachhelm_player_state
for select
to authenticated
using (
    exists (
        select 1
        from public.golf_players as gp
        where
            gp.id = golf_coachhelm_player_state.player_id
            and gp.user_id = (select auth.uid())
    )
    or exists (
        select 1
        from public.golf_team_members as gtm
        where
            gtm.player_id = golf_coachhelm_player_state.player_id
            and gtm.status = 'active'::public.team_member_status
            and public.is_golf_team_coach(gtm.team_id)
    )
    or (select public.is_super_admin())
);

revoke all on public.golf_coachhelm_player_state from anon;
revoke all on public.golf_coachhelm_player_state from authenticated;
grant select on public.golf_coachhelm_player_state to authenticated;
grant select, insert, update, delete on public.golf_coachhelm_player_state
to service_role;
