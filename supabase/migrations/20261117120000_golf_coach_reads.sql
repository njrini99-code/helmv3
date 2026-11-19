-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 17 Nov 2026 for the CoachHelm insights rebuild, stage 1 (branch
--   agent/coachhelm-reads, PR "CoachHelm reads: stages 1, 2, 4 and the
--   player's card"). Not applied anywhere, not run against any shared database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261117120000_golf_coach_reads.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/golf_coach_reads.sql). Owner applies.
--
-- Risk: LOW. Additive only: one new table, one view, their indexes, one
--   policy and grants. No existing table, column, policy, grant or function
--   changes.
--
-- What:
--   golf_coach_reads: CoachHelm's read of one player (the analyst's card,
--   src/lib/coachhelm/v3/analyst/reads), append-only. A row is written only
--   when what a coach would see changed (content_hash differs from the
--   player's latest), after a posted round and nightly, for teams with the
--   coachhelm_reads_v1 flag on. History is the earlier rows.
--   golf_coach_reads_current: the latest row per player and team
--   (security_invoker, so the table's RLS applies to whoever reads it).
--
-- Why not golf_coach_insights: its insight_type CHECK rejects a new kind,
--   about 80 readers read it, and its player-own SELECT policy would show a
--   player the team block of their own read.
--
-- RLS: coach-only read (public.is_team_coach(team_id)). No player policy: a
--   player's own card is served by a server read that removes the coach-only
--   blocks (reads/player-card.ts), never by a policy that exposes the row.
--   No insert, update or delete policy: only the service role writes. anon
--   holds nothing; authenticated holds SELECT only.
--
-- Code that reads and writes it: src/lib/coachhelm/v3/analyst/reads/store.ts
--   (service role) and src/clubhouse/data/coachhelm-reads.ts (the coach's
--   session). Everything runs WITHOUT this migration: on 42P01 / PGRST205
--   nothing is written and the card is not drawn.
--
-- ROLLBACK:
--   drop view if exists public.golf_coach_reads_current;
--   drop table if exists public.golf_coach_reads;
--   (nothing else depends on them)
--
-- VERIFY: select 1 where to_regclass('public.golf_coach_reads') is not null;
-- VERIFY: select 1 where to_regclass('public.golf_coach_reads_current') is not
-- null;
-- VERIFY: select 1 where (select relrowsecurity from pg_class where oid =
-- 'public.golf_coach_reads'::regclass);
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- 'public' and tablename = 'golf_coach_reads') = 1;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- 'public.golf_coach_reads', 'SELECT');
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- 'public.golf_coach_reads', 'INSERT');

create table if not exists public.golf_coach_reads (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.golf_teams (id) on delete cascade,
    player_id uuid not null references public.golf_players (
        id
    ) on delete cascade,
    computed_at timestamptz not null default now(),
    through_date date,
    n_rounds bigint not null check (n_rounds >= 0),
    signature text,
    certainty text check (certainty in ('clear', 'likely', 'leaning')),
    analyst_version text not null,
    content_hash text not null,
    payload jsonb not null,
    trigger text not null check (trigger in ('round', 'nightly', 'manual')),
    round_id uuid references public.golf_rounds (id) on delete set null
);

comment on table public.golf_coach_reads is
'CoachHelm reads (stage 1): the analyst''s card for one player, append-only; '
'a row only when what a coach sees changed. Coach-only: no player policy.';

create index if not exists golf_coach_reads_player_computed_idx
on public.golf_coach_reads (player_id, computed_at desc);
create index if not exists golf_coach_reads_team_computed_idx
on public.golf_coach_reads (team_id, computed_at desc);
create index if not exists golf_coach_reads_round_idx
on public.golf_coach_reads (round_id);

alter table public.golf_coach_reads enable row level security;

drop policy if exists golf_coach_reads_select_team_coach
on public.golf_coach_reads;
create policy golf_coach_reads_select_team_coach
on public.golf_coach_reads
for select to authenticated
using (public.is_team_coach(team_id));

revoke all on public.golf_coach_reads from anon;
revoke all on public.golf_coach_reads from authenticated;
grant select on public.golf_coach_reads to authenticated;
grant all on public.golf_coach_reads to service_role;

create or replace view public.golf_coach_reads_current
with (security_invoker = true) as
select distinct on (r.player_id, r.team_id)
    r.id,
    r.team_id,
    r.player_id,
    r.computed_at,
    r.through_date,
    r.n_rounds,
    r.signature,
    r.certainty,
    r.analyst_version,
    r.content_hash,
    r.payload,
    r.trigger,
    r.round_id
from public.golf_coach_reads as r
order by r.player_id asc, r.team_id asc, r.computed_at desc, r.id desc;

comment on view public.golf_coach_reads_current is
'The latest golf_coach_reads row per player and team. security_invoker: the '
'table''s coach-only RLS applies to the reader.';

revoke all on public.golf_coach_reads_current from anon;
revoke all on public.golf_coach_reads_current from authenticated;
grant select on public.golf_coach_reads_current to authenticated;
grant select on public.golf_coach_reads_current to service_role;
