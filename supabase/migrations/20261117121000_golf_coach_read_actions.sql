-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 17 Nov 2026 for the CoachHelm insights rebuild, stage 4 (branch
--   agent/coachhelm-reads). Not applied anywhere, not run against any shared
--   database. Apply after 20261117120000_golf_coach_reads.sql.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261117121000_golf_coach_read_actions.sql
--   after npm run test:rls passes on a local stack (pgTAP:
--   supabase/tests/rls/golf_coach_read_actions.sql). Owner applies.
--
-- Risk: LOW. Additive only: two new tables, their indexes, policies and
--   grants. Nothing existing changes.
--
-- What:
--   golf_coach_read_feedback: a coach marked a CoachHelm read "not useful" or
--   "wrong", with the reason and what the card said then. The read stays down
--   unless the evidence changes materially (reads/memory.ts).
--   golf_coach_read_focus: a focus or plan made from a read keeps the card id
--   and the number on the day, so the card can say "since the focus was set"
--   and give one word at the horizon (reads/focus.ts).
--
-- RLS: coach-only. The team's coaches read both; a coach inserts only as
--   themselves (coach_id is the caller's golf_coaches row) for a team they
--   coach. No update or delete policy (append-only). No player policy. anon
--   holds nothing.
--
-- ROLLBACK:
--   drop table if exists public.golf_coach_read_focus;
--   drop table if exists public.golf_coach_read_feedback;
--
-- VERIFY: select 1 where to_regclass('public.golf_coach_read_feedback') is not
-- null;
-- VERIFY: select 1 where to_regclass('public.golf_coach_read_focus') is not
-- null;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- 'public.golf_coach_read_feedback', 'SELECT');
-- VERIFY: select 1 where not has_table_privilege('anon',
-- 'public.golf_coach_read_focus', 'SELECT');

create table if not exists public.golf_coach_read_feedback (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.golf_teams (id) on delete cascade,
    player_id uuid not null references public.golf_players (
        id
    ) on delete cascade,
    coach_id uuid not null references public.golf_coaches (
        id
    ) on delete cascade,
    card_key text not null,
    verdict text not null check (verdict in ('not_useful', 'wrong')),
    reason text not null check (char_length(btrim(reason)) between 1 and 500),
    lost_per_round numeric not null,
    certainty text not null check (certainty in ('clear', 'likely', 'leaning')),
    area text not null,
    created_at timestamptz not null default now()
);

create index if not exists golf_coach_read_feedback_player_idx
on public.golf_coach_read_feedback (player_id, created_at desc);
create index if not exists golf_coach_read_feedback_team_idx
on public.golf_coach_read_feedback (team_id);
create index if not exists golf_coach_read_feedback_coach_idx
on public.golf_coach_read_feedback (coach_id);

create table if not exists public.golf_coach_read_focus (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.golf_teams (id) on delete cascade,
    player_id uuid not null references public.golf_players (
        id
    ) on delete cascade,
    coach_id uuid not null references public.golf_coaches (
        id
    ) on delete cascade,
    focus_area_id uuid references public.golf_player_focus_areas (
        id
    ) on delete set null,
    card_key text not null,
    part text not null,
    set_on date not null,
    value_on_day numeric not null,
    rounds_on_day bigint not null check (rounds_on_day >= 0),
    team_lost_on_day numeric,
    created_at timestamptz not null default now()
);

create index if not exists golf_coach_read_focus_player_idx
on public.golf_coach_read_focus (player_id, created_at desc);
create index if not exists golf_coach_read_focus_team_idx
on public.golf_coach_read_focus (team_id);
create index if not exists golf_coach_read_focus_coach_idx
on public.golf_coach_read_focus (coach_id);
create index if not exists golf_coach_read_focus_area_idx
on public.golf_coach_read_focus (focus_area_id);

alter table public.golf_coach_read_feedback enable row level security;
alter table public.golf_coach_read_focus enable row level security;

drop policy if exists golf_coach_read_feedback_select
on public.golf_coach_read_feedback;
create policy golf_coach_read_feedback_select
on public.golf_coach_read_feedback
for select to authenticated
using (public.is_team_coach(team_id));

drop policy if exists golf_coach_read_feedback_insert
on public.golf_coach_read_feedback;
create policy golf_coach_read_feedback_insert
on public.golf_coach_read_feedback
for insert to authenticated
with check (
    public.is_team_coach(team_id)
    and exists (
        select 1 from public.golf_coaches c
        where c.id = coach_id and c.user_id = (select auth.uid())
    )
);

drop policy if exists golf_coach_read_focus_select
on public.golf_coach_read_focus;
create policy golf_coach_read_focus_select
on public.golf_coach_read_focus
for select to authenticated
using (public.is_team_coach(team_id));

drop policy if exists golf_coach_read_focus_insert
on public.golf_coach_read_focus;
create policy golf_coach_read_focus_insert
on public.golf_coach_read_focus
for insert to authenticated
with check (
    public.is_team_coach(team_id)
    and exists (
        select 1 from public.golf_coaches c
        where c.id = coach_id and c.user_id = (select auth.uid())
    )
);

revoke all on public.golf_coach_read_feedback from anon;
revoke all on public.golf_coach_read_focus from anon;
revoke all on public.golf_coach_read_feedback from authenticated;
revoke all on public.golf_coach_read_focus from authenticated;
grant select, insert on public.golf_coach_read_feedback to authenticated;
grant select, insert on public.golf_coach_read_focus to authenticated;
grant all on public.golf_coach_read_feedback to service_role;
grant all on public.golf_coach_read_focus to service_role;
