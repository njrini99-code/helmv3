-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 16 Nov 2026 for launch readiness F-05, the roster limit
--   (thread "Build coach table-stakes features", PR #2543). Not applied
--   anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261115250000_golf_roster_limits.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/golf_roster_limits.sql). Order: after
--   20261115230000 and 20261115240000 (independent of both).
--
-- Risk: LOW. Additive only: two new tables, their indexes and policies. No
--   existing table, column, policy, grant or function changes.
--
-- What:
--   golf_team_roster_limits: one row a team, its roster limit. NCAA Division
--   I Bylaw 17.2 (Manual 2026-27) caps golf at 9 for a school in the House
--   settlement; a conference may set fewer, so the number is the coach's.
--   A team with no row reads as on at 9 for Division I, off otherwise.
--   golf_roster_exemptions: one row a player who doesn't count toward the
--   limit: 'designated' (a designated student-athlete) or 'medical' (a
--   medically documented incapacitating injury or illness, never to compete
--   again). The note is the coach's, at most 280 characters.
--
-- RLS: a coach of the team (is_golf_team_coach) reads and writes both. An
--   active player of the team (is_golf_team_player) reads the limit only:
--   an exemption names a reason about a teammate, so players never read
--   golf_roster_exemptions. An exemption's player must be a member of the
--   team (checked in the policy). anon has nothing.
--
-- Code that reads it: src/lib/golf/roster-limit.ts (Roster header, row
--   menu, lineup builder) and src/app/golf/actions/roster-limit.ts.
--   Everything runs WITHOUT this migration: on 42P01 / PGRST205 the limit
--   is the division default, nobody is exempt, and saving says it waits on
--   this update.
--
-- ROLLBACK:
--   drop table if exists public.golf_roster_exemptions;
--   drop table if exists public.golf_team_roster_limits;
--   (no other object depends on them; the app reads them as missing again)
--
-- VERIFY: select 1 where to_regclass('public.golf_team_roster_limits') is not null;
-- VERIFY: select 1 where to_regclass('public.golf_roster_exemptions') is not null;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname = 'public' and tablename in ('golf_team_roster_limits', 'golf_roster_exemptions')) = 8;
-- VERIFY: select 1 where not has_table_privilege('anon', 'public.golf_roster_exemptions', 'SELECT');

create table if not exists public.golf_team_roster_limits (
  team_id uuid primary key references public.golf_teams (id) on delete cascade,
  enabled boolean not null default true,
  max_players integer not null default 9 check (max_players between 1 and 40),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.golf_team_roster_limits is
  'F-05: a team''s roster limit (NCAA DI Bylaw 17.2: 9 in golf). One row a team; absent means on at 9 for Division I, off otherwise.';

create index if not exists golf_team_roster_limits_updated_by_idx on public.golf_team_roster_limits (updated_by);

create table if not exists public.golf_roster_exemptions (
  team_id uuid not null references public.golf_teams (id) on delete cascade,
  player_id uuid not null references public.golf_players (id) on delete cascade,
  reason text not null check (reason in ('designated', 'medical')),
  note text check (note is null or char_length(note) <= 280),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

comment on table public.golf_roster_exemptions is
  'F-05: a player who does not count toward the team''s roster limit (designated student-athlete, or medical). Coach-only.';

create index if not exists golf_roster_exemptions_player_idx on public.golf_roster_exemptions (player_id);
create index if not exists golf_roster_exemptions_created_by_idx on public.golf_roster_exemptions (created_by);

alter table public.golf_team_roster_limits enable row level security;
alter table public.golf_roster_exemptions enable row level security;

drop policy if exists golf_team_roster_limits_select on public.golf_team_roster_limits;
create policy golf_team_roster_limits_select on public.golf_team_roster_limits
  for select to authenticated
  using (public.is_golf_team_coach(team_id) or public.is_golf_team_player(team_id));

drop policy if exists golf_team_roster_limits_insert on public.golf_team_roster_limits;
create policy golf_team_roster_limits_insert on public.golf_team_roster_limits
  for insert to authenticated
  with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_team_roster_limits_update on public.golf_team_roster_limits;
create policy golf_team_roster_limits_update on public.golf_team_roster_limits
  for update to authenticated
  using (public.is_golf_team_coach(team_id))
  with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_team_roster_limits_delete on public.golf_team_roster_limits;
create policy golf_team_roster_limits_delete on public.golf_team_roster_limits
  for delete to authenticated
  using (public.is_golf_team_coach(team_id));

drop policy if exists golf_roster_exemptions_select on public.golf_roster_exemptions;
create policy golf_roster_exemptions_select on public.golf_roster_exemptions
  for select to authenticated
  using (public.is_golf_team_coach(team_id));

drop policy if exists golf_roster_exemptions_insert on public.golf_roster_exemptions;
create policy golf_roster_exemptions_insert on public.golf_roster_exemptions
  for insert to authenticated
  with check (
    public.is_golf_team_coach(team_id)
    and exists (select 1 from public.golf_team_members m where m.team_id = golf_roster_exemptions.team_id and m.player_id = golf_roster_exemptions.player_id)
  );

drop policy if exists golf_roster_exemptions_update on public.golf_roster_exemptions;
create policy golf_roster_exemptions_update on public.golf_roster_exemptions
  for update to authenticated
  using (public.is_golf_team_coach(team_id))
  with check (
    public.is_golf_team_coach(team_id)
    and exists (select 1 from public.golf_team_members m where m.team_id = golf_roster_exemptions.team_id and m.player_id = golf_roster_exemptions.player_id)
  );

drop policy if exists golf_roster_exemptions_delete on public.golf_roster_exemptions;
create policy golf_roster_exemptions_delete on public.golf_roster_exemptions
  for delete to authenticated
  using (public.is_golf_team_coach(team_id));

revoke all on table public.golf_team_roster_limits from anon, public;
revoke all on table public.golf_roster_exemptions from anon, public;
grant select, insert, update, delete on table public.golf_team_roster_limits to authenticated;
grant select, insert, update, delete on table public.golf_roster_exemptions to authenticated;
