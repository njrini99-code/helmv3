-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner (supabase/migrations/HELD.md).
-- Apply: npm run db:apply -- <this file>
--
-- Clubhouse P-10 "In class until 11:50" (class awareness). Build plan:
-- clubhouse-handoff/build-plans/P-10-class-awareness.md, section 8, with the
-- 2026-10-25 review fixes (Must 3, 5; Should 1, 9; S-6, S-7, S-8, S-14).
--
-- Adds three tables, one helper, one column and a realtime entry:
--   golf_team_terms            coach-confirmed term dates and the class time zone
--   golf_player_class_settings a player's sharing and push-hold choices (kept out of
--                              users.notification_preferences, whose whitelist
--                              trigger from 20261017100000 drops unknown keys)
--   golf_player_shares_class_status(team, player)  definer helper; the only way a
--                              coach-side policy learns the sharing switch
--   golf_class_exceptions      "no class today", team breaks, exam blocks
--   golf_player_classes.status_enabled  per-class switch, default true
--   golf_class_exceptions in the supabase_realtime publication
--
-- Tables locked while this runs: golf_player_classes (ADD COLUMN, a metadata-only
-- change on PG 11+ but it still takes ACCESS EXCLUSIVE for an instant; the
-- lock_timeout below makes it give up instead of queueing behind a long read).
-- Every other object is new. No index is added to golf_events: main's
-- idx_golf_events_team_start (team_id, start_time) serves the class-occurrence scan.
--
-- Nothing reads these until the app ships; the app treats a missing table or
-- function (PGRST202 / 42P01) as "no class status", so either order is safe.
-- Risk: LOW. New tables, one additive column with a default.
-- pgTAP: supabase/tests/rls/golf_class_awareness.sql
--
-- ROLLBACK: supabase/rollbacks/20261025070000_golf_class_awareness_tables.rollback.sql
-- ROLLBACK: order: 070200 and 070100 first (they read these tables), then this file; 070300 is independent.
-- VERIFY: select 1 where to_regclass('public.golf_team_terms') is not null and to_regclass('public.golf_class_exceptions') is not null and to_regclass('public.golf_player_class_settings') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_player_classes' and column_name = 'status_enabled') and (select relrowsecurity from pg_class where oid = 'public.golf_team_terms'::regclass) and (select relrowsecurity from pg_class where oid = 'public.golf_class_exceptions'::regclass) and (select relrowsecurity from pg_class where oid = 'public.golf_player_class_settings'::regclass);
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_team_terms', 'truncate') and not has_table_privilege('authenticated', 'public.golf_class_exceptions', 'truncate') and not has_table_privilege('authenticated', 'public.golf_player_class_settings', 'truncate') and not has_table_privilege('anon', 'public.golf_team_terms', 'select') and not has_table_privilege('anon', 'public.golf_class_exceptions', 'select') and not has_table_privilege('anon', 'public.golf_player_class_settings', 'select');
-- VERIFY: select 1 where has_function_privilege('authenticated', 'public.golf_player_shares_class_status(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.golf_player_shares_class_status(uuid, uuid)', 'execute');
-- VERIFY: select 1 where exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_class_exceptions');

SET lock_timeout = '3s';

-- 1. Terms -----------------------------------------------------------------

create table if not exists public.golf_team_terms (
    id            uuid primary key default gen_random_uuid(),
    team_id       uuid not null references public.golf_teams(id) on delete cascade,
    label         text not null,
    classes_start date not null,
    classes_end   date not null,
    exams_end     date not null,
    time_zone     text not null,
    confirmed_by  uuid references auth.users(id) on delete set null,
    confirmed_at  timestamptz not null default now(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_team_terms_label_len') then
    alter table public.golf_team_terms
      add constraint golf_team_terms_label_len check (char_length(btrim(label)) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_team_terms_span') then
    alter table public.golf_team_terms
      add constraint golf_team_terms_span
      check (classes_end >= classes_start + 27 and classes_end <= classes_start + 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_team_terms_exams') then
    alter table public.golf_team_terms
      add constraint golf_team_terms_exams
      check (exams_end >= classes_end and exams_end <= classes_end + 21);
  end if;
end $$;

create index if not exists idx_golf_team_terms_team_start
  on public.golf_team_terms (team_id, classes_start);

-- Validate the zone, refuse overlaps, stamp updated_at and confirmed_by.
-- The advisory lock closes the two-coaches race (Should 1): btree_gist is not
-- installed, so an exclusion constraint is not available, and without the lock
-- two concurrent inserts could each pass the overlap check before either commits.
create or replace function public.golf_team_terms_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'unknown time zone %', new.time_zone using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('golf_team_terms:' || new.team_id::text));
  if exists (
    select 1 from public.golf_team_terms t
    where t.team_id = new.team_id
      and t.id <> new.id
      and daterange(t.classes_start, t.exams_end, '[]') && daterange(new.classes_start, new.exams_end, '[]')
  ) then
    raise exception 'term overlaps another term for this team' using errcode = '23P01';
  end if;
  new.label := btrim(new.label);
  new.updated_at := now();
  new.confirmed_at := now();
  new.confirmed_by := coalesce(auth.uid(), new.confirmed_by);
  return new;
end $$;

revoke all on function public.golf_team_terms_guard() from public, anon, authenticated;

drop trigger if exists golf_team_terms_guard on public.golf_team_terms;
create trigger golf_team_terms_guard
  before insert or update on public.golf_team_terms
  for each row execute function public.golf_team_terms_guard();

alter table public.golf_team_terms enable row level security;

drop policy if exists golf_team_terms_select on public.golf_team_terms;
create policy golf_team_terms_select on public.golf_team_terms
  for select to authenticated
  using (public.is_golf_team_coach(team_id) or public.user_is_golf_team_member(team_id));

drop policy if exists golf_team_terms_insert_coach on public.golf_team_terms;
create policy golf_team_terms_insert_coach on public.golf_team_terms
  for insert to authenticated
  with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_team_terms_update_coach on public.golf_team_terms;
create policy golf_team_terms_update_coach on public.golf_team_terms
  for update to authenticated
  using (public.is_golf_team_coach(team_id))
  with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_team_terms_delete_coach on public.golf_team_terms;
create policy golf_team_terms_delete_coach on public.golf_team_terms
  for delete to authenticated
  using (public.is_golf_team_coach(team_id));

revoke all on public.golf_team_terms from anon, authenticated;
grant select, insert, update, delete on public.golf_team_terms to authenticated;
grant all on public.golf_team_terms to service_role;

-- 2. Player settings ---------------------------------------------------------

create table if not exists public.golf_player_class_settings (
    player_id     uuid primary key references public.golf_players(id) on delete cascade,
    share_status  boolean not null default true,
    hold_pushes   boolean not null default true,
    updated_at    timestamptz not null default now()
);

alter table public.golf_player_class_settings enable row level security;

drop policy if exists golf_player_class_settings_own on public.golf_player_class_settings;
create policy golf_player_class_settings_own on public.golf_player_class_settings
  for all to authenticated
  using (player_id = (select public.get_current_golf_player_id()))
  with check (player_id = (select public.get_current_golf_player_id()));
-- Coaches never read this table directly; golf_team_class_day exposes only the
-- derived "tracked" and "holds" booleans for their own team's players.

revoke all on public.golf_player_class_settings from anon, authenticated;
grant select, insert, update on public.golf_player_class_settings to authenticated;
grant all on public.golf_player_class_settings to service_role;

-- The sharing switch as a definer helper, so a coach-side policy can honour it
-- without reading the settings table (Must 5). It answers only for a coach of the
-- team or the player themself; everyone else gets false. Known exception, stated
-- in plan 8.10: a coach calling this through the API learns that one boolean.
create or replace function public.golf_player_shares_class_status(p_team_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_team_id is null or p_player_id is null then false
    when not (public.is_golf_team_coach(p_team_id)
              or p_player_id = public.get_current_golf_player_id()) then false
    else coalesce(
      (select s.share_status from public.golf_player_class_settings s where s.player_id = p_player_id),
      true)
  end
$$;

revoke all on function public.golf_player_shares_class_status(uuid, uuid) from public, anon;
grant execute on function public.golf_player_shares_class_status(uuid, uuid) to authenticated, service_role;

-- 3. Exceptions: off days, team breaks, exam blocks ------------------------

create table if not exists public.golf_class_exceptions (
    id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.golf_teams(id) on delete cascade,
    player_id   uuid references public.golf_players(id) on delete cascade,      -- null: team-wide
    class_id    uuid references public.golf_player_classes(id) on delete cascade, -- null: all classes
    kind        text not null,
    starts_on   date not null,
    ends_on     date not null,
    start_time  time,
    end_time    time,
    label       text,
    created_by  uuid default auth.uid() references auth.users(id) on delete set null,
    created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_kind') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_kind check (kind in ('off', 'extra'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_range') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_range
      check (ends_on >= starts_on and ends_on <= starts_on + 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_scope') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_scope check (player_id is not null or class_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_off_shape') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_off_shape
      check (kind <> 'off' or (start_time is null and end_time is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_extra_shape') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_extra_shape
      check (kind <> 'extra' or (
        player_id is not null and class_id is null
        and ends_on = starts_on
        and start_time is not null and end_time is not null
        and end_time > start_time
        and end_time - start_time <= interval '4 hours'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_label_len') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_label_len check (label is null or char_length(label) <= 60);
  end if;
end $$;

create index if not exists idx_golf_class_exceptions_player_on
  on public.golf_class_exceptions (player_id, starts_on) where player_id is not null;
create index if not exists idx_golf_class_exceptions_team_on
  on public.golf_class_exceptions (team_id, starts_on);
create index if not exists idx_golf_class_exceptions_class
  on public.golf_class_exceptions (class_id) where class_id is not null;

-- class_id must belong to player_id; player must be an active member of team_id.
create or replace function public.golf_class_exceptions_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.golf_player_classes c
    where c.id = new.class_id and c.player_id = new.player_id
  ) then
    raise exception 'class does not belong to this player' using errcode = '23514';
  end if;
  if new.player_id is not null and not exists (
    select 1 from public.golf_team_members m
    where m.player_id = new.player_id and m.team_id = new.team_id and m.status = 'active'
  ) then
    raise exception 'player is not an active member of this team' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function public.golf_class_exceptions_guard() from public, anon, authenticated;

drop trigger if exists golf_class_exceptions_guard on public.golf_class_exceptions;
create trigger golf_class_exceptions_guard
  before insert on public.golf_class_exceptions
  for each row execute function public.golf_class_exceptions_guard();

alter table public.golf_class_exceptions enable row level security;

-- Read: your own rows; team-wide rows of your team; coaches read their team's
-- team-wide rows and the rows of players who share class status (Must 5: the
-- coach branch is gated on the sharing switch through the definer helper).
drop policy if exists golf_class_exceptions_select on public.golf_class_exceptions;
create policy golf_class_exceptions_select on public.golf_class_exceptions
  for select to authenticated
  using (
    player_id = (select public.get_current_golf_player_id())
    or (player_id is null and public.user_is_golf_team_member(team_id))
    or (
      public.is_golf_team_coach(team_id)
      and (player_id is null or public.golf_player_shares_class_status(team_id, player_id))
    )
  );

-- Players add their own rows on a team they belong to.
drop policy if exists golf_class_exceptions_insert_player on public.golf_class_exceptions;
create policy golf_class_exceptions_insert_player on public.golf_class_exceptions
  for insert to authenticated
  with check (
    player_id = (select public.get_current_golf_player_id())
    and public.user_is_golf_team_member(team_id)
  );

-- Coaches add team-wide breaks only (never a row for a single player).
drop policy if exists golf_class_exceptions_insert_coach on public.golf_class_exceptions;
create policy golf_class_exceptions_insert_coach on public.golf_class_exceptions
  for insert to authenticated
  with check (player_id is null and public.is_golf_team_coach(team_id));

drop policy if exists golf_class_exceptions_delete on public.golf_class_exceptions;
create policy golf_class_exceptions_delete on public.golf_class_exceptions
  for delete to authenticated
  using (
    player_id = (select public.get_current_golf_player_id())
    or (player_id is null and public.is_golf_team_coach(team_id))
  );
-- No update policy: rows are replaced, never edited.

revoke all on public.golf_class_exceptions from anon, authenticated;
grant select, insert, delete on public.golf_class_exceptions to authenticated;
grant all on public.golf_class_exceptions to service_role;

-- 4. Per-class switch --------------------------------------------------------

alter table public.golf_player_classes
  add column if not exists status_enabled boolean not null default true;

-- 5. Realtime: coach views learn about "no class today" within seconds -------
-- The publication change has no declarative mirror: supabase/schemas declares no
-- publication (S-6).

do $$
declare
  t text;
  wanted text[] := ARRAY['golf_class_exceptions'];
begin
  foreach t in array wanted loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      raise notice 'realtime publication: skipping % (no such table in public)', t;
      continue;
    end if;
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      raise notice 'realtime publication: % already published', t;
      continue;
    end if;
    execute format('alter publication supabase_realtime add table public.%I', t);
    raise notice 'realtime publication: added %', t;
  end loop;
end $$;
