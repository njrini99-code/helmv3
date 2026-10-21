-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-20 for CoachHelm Slice 6a
-- (learning from corrections); the owner applies it after review
-- (supabase/migrations/HELD.md row).
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261020121000_golf_coachhelm_corrections.sql
-- Risk: LOW. One new table with RLS on; nothing existing changes. No backfill.
--
-- ORDER: no prerequisite. The writer (src/app/golf/actions/
-- coachhelm-corrections.ts) and the reader (src/lib/coachhelm/v3/corrections/
-- load-weights.ts) run only behind the flag coachhelm_corrections_v1 (off) and
-- treat a missing table (42P01 / PGRST205) as "corrections not available", so
-- the app may ship before or after this apply.
--
-- WHY (04-output-specs §1.4, 03 §7.2, 07 §2 F): a coach's structured answer
-- to a read ("Not this", "Wrong cause", "Already on it", "Show later", "Good
-- read") is the fastest learning signal CoachHelm can get; today there are 7
-- player feedback rows and no coach channel at all. One row per correction,
-- append-only. The per-coach weight W (03 §2.2) and the per-family precision
-- counters (02 §9) are computed from these rows.
--
-- WHAT A ROW HOLDS: ids the system already stores (the insight, the player,
-- the team, the author's auth user id), the author's role, the kind and
-- reason chips, an optional alternative cause label and free text (both
-- length-capped), the player's newest round when the correction was made
-- (the checkpoint anchor for "Show later" and "Under review"), and the time.
--
-- WHO READS IT (04 §1.4 "author reads own; coach reads own team's"): the
-- author; a coach on the staff of a team the player is an active member of
-- (the row's own team_id grants nothing); super admins. A player reads only
-- rows they wrote (never a coach's correction on their read). anon has no
-- grant.
-- WHO WRITES IT: an authenticated user, as themselves, either a coach on the
-- staff of a team the player is active on (any kind), or the player on their
-- own read (only 'not_this' and 'confirm', and team_id null or a team the
-- player is active on). The insight must belong to that player. No UPDATE
-- or DELETE policy: corrections are append-only; the newest correction by
-- one author on one read is the one that counts.
--
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_coachhelm_corrections; the
-- writer and reader then report "not available" again and ranking is neutral.
--
-- `npm run test:rls` could not run where this was written (no Docker);
-- supabase/tests/rls/golf_coachhelm_corrections.sql holds the pgTAP checks.
--
-- VERIFY: select 1 where exists (select 1 from information_schema.tables
-- VERIFY: where table_schema = 'public'
-- VERIFY: and table_name = 'golf_coachhelm_corrections');
-- VERIFY: select 1 where (select relrowsecurity from pg_class
-- VERIFY: where oid = 'public.golf_coachhelm_corrections'::regclass);
-- VERIFY: select 1 where (select count(*) from pg_policies
-- VERIFY: where schemaname = 'public'
-- VERIFY: and tablename = 'golf_coachhelm_corrections') = 2;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.golf_coachhelm_corrections', 'SELECT')
-- VERIFY: and not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_corrections', 'UPDATE')
-- VERIFY: and not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_corrections', 'DELETE');

create table if not exists public.golf_coachhelm_corrections (
    id uuid primary key default gen_random_uuid(),
    insight_id uuid not null
    references public.golf_coach_insights (id) on delete cascade,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    team_id uuid references public.golf_teams (id) on delete set null,
    author_user_id uuid not null
    references auth.users (id) on delete cascade,
    author_role text not null
    check (author_role in ('coach', 'player')),
    kind text not null
    check (
        kind in (
            'not_this', 'wrong_cause', 'already_on_it', 'snooze', 'confirm'
        )
    ),
    -- The "Not this" reason chip; null for every other kind.
    reason text
    check (
        reason is null
        or reason in ('wrong', 'not_important', 'already_know')
    ),
    -- "Wrong cause": the cause the coach picked instead.
    alternative_cause_label text
    check (
        alternative_cause_label is null
        or char_length(alternative_cause_label) <= 120
    ),
    free_text text
    check (free_text is null or char_length(free_text) <= 500),
    -- The player's newest completed, non-test round when the correction was
    -- made: the anchor "Show later" and "Under review" count checkpoints from.
    checkpoint_round_id uuid
    references public.golf_rounds (id) on delete set null,
    created_at timestamptz not null default now(),
    constraint golf_coachhelm_corrections_reason_only_on_not_this
    check (reason is null or kind = 'not_this'),
    constraint golf_coachhelm_corrections_player_kinds
    check (author_role = 'coach' or kind in ('not_this', 'confirm'))
);

comment on table public.golf_coachhelm_corrections is
'CoachHelm corrections (Slice 6a, flag coachhelm_corrections_v1): one '
'append-only row per coach or player answer to a read (not_this, '
'wrong_cause, already_on_it, snooze, confirm). Feeds the per-coach weight W '
'and the per-family precision counters. 04-output-specs §1.4.';

-- The ranking read: one coach's corrections, newest first.
create index if not exists idx_golf_coachhelm_corrections_author_created
on public.golf_coachhelm_corrections (author_user_id, created_at desc);

-- The audit view and the precision rollup: corrections on one read.
create index if not exists idx_golf_coachhelm_corrections_insight
on public.golf_coachhelm_corrections (insight_id, created_at desc);

-- The coach read policy and the player foreign key.
create index if not exists idx_golf_coachhelm_corrections_player
on public.golf_coachhelm_corrections (player_id);

-- Covers the team_id foreign key (ON DELETE SET NULL scans it).
create index if not exists idx_golf_coachhelm_corrections_team
on public.golf_coachhelm_corrections (team_id)
where team_id is not null;

-- Covers the checkpoint_round_id foreign key.
create index if not exists idx_golf_coachhelm_corrections_checkpoint_round
on public.golf_coachhelm_corrections (checkpoint_round_id)
where checkpoint_round_id is not null;

alter table public.golf_coachhelm_corrections enable row level security;

drop policy if exists golf_coachhelm_corrections_select
on public.golf_coachhelm_corrections;
create policy golf_coachhelm_corrections_select
on public.golf_coachhelm_corrections
for select
to authenticated
using (
    author_user_id = (select auth.uid())
    -- Coach visibility follows the player's active teams, never the row's
    -- own team_id, so a row cannot be steered to an unrelated team's staff.
    or exists (
        select 1
        from public.golf_team_members as gtm
        where
            gtm.player_id = golf_coachhelm_corrections.player_id
            and gtm.status = 'active'::public.team_member_status
            and public.is_golf_team_coach(gtm.team_id)
    )
    or (select public.is_super_admin())
);

drop policy if exists golf_coachhelm_corrections_insert_author
on public.golf_coachhelm_corrections;
create policy golf_coachhelm_corrections_insert_author
on public.golf_coachhelm_corrections
for insert
to authenticated
with check (
    author_user_id = (select auth.uid())
    and exists (
        select 1
        from public.golf_coach_insights as gci
        where
            gci.id = golf_coachhelm_corrections.insight_id
            and gci.player_id = golf_coachhelm_corrections.player_id
    )
    and (
        (
            author_role = 'coach'
            and team_id is not null
            and public.is_golf_team_coach(team_id)
            and exists (
                select 1
                from public.golf_team_members as gtm
                where
                    gtm.player_id = golf_coachhelm_corrections.player_id
                    and gtm.team_id = golf_coachhelm_corrections.team_id
                    and gtm.status = 'active'::public.team_member_status
            )
        )
        or (
            author_role = 'player'
            and exists (
                select 1
                from public.golf_players as gp
                where
                    gp.id = golf_coachhelm_corrections.player_id
                    and gp.user_id = (select auth.uid())
            )
            -- A player may only tag a team they are an active member of.
            and (
                team_id is null
                or exists (
                    select 1
                    from public.golf_team_members as gtm
                    where
                        gtm.player_id = golf_coachhelm_corrections.player_id
                        and gtm.team_id = golf_coachhelm_corrections.team_id
                        and gtm.status = 'active'::public.team_member_status
                )
            )
        )
    )
);

revoke all on public.golf_coachhelm_corrections from anon;
revoke all on public.golf_coachhelm_corrections from authenticated;
grant select, insert on public.golf_coachhelm_corrections to authenticated;
grant select, insert, delete on public.golf_coachhelm_corrections
to service_role;
