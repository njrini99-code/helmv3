-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 15 Nov 2026 for launch readiness F-03, the practice-hours (CARA) log
--   (thread "Build coach table-stakes features", PR #2543). Not applied
--   anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261115230000_golf_team_hours.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/golf_team_hours.sql).
--
-- Risk: LOW. Additive only: two new tables, their indexes and policies. No
--   existing table, column, policy, grant or function changes.
--
-- What:
--   1. golf_team_hours_settings: one row a team, the limits its hours log is
--      read against. division (d1, d2, d3, naia, custom), the Division I
--      autonomy rules, the team's week (the day it starts, any seven
--      consecutive days fixed for the segment, NCAA DI 17.1.7.3.3, DII
--      17.1.6.4.3), the declared fall and spring playing seasons, the team's
--      own limits when division is custom, and untimed_hours, the hours a
--      practice or meeting saved with no times counts (real calendars save
--      practice all day).
--   2. golf_hours_adjustments: a coach's change to how one event counts for
--      every player on it: counted false (an academic meeting, which is not
--      countable, NCAA DI 17.02.1) or a figure in hours, with a note.
--
-- RLS: both tables are the team's. A coach of the team (is_golf_team_coach)
--   reads and writes; an active player of the team (is_golf_team_player)
--   reads, so a player's own week shows the same figures and notes the
--   coach's log does. An adjustment's event must be the same team's
--   (checked in the policy). No delete on settings (a coach changes them);
--   a coach may delete an adjustment (back to the drafted figure). anon has
--   nothing; authenticated has table privileges, the policies decide.
--
-- Code that reads it: src/clubhouse/data/hours.ts (the Calendar's Practice
--   hours page) and src/app/golf/actions/hours.ts. The page runs WITHOUT this
--   migration: on 42P01 / PGRST205 it drafts the week on the defaults (the
--   team's division from Settings, Team, else Division I, in season) and says
--   that saving limits and changes waits on this update.
--
-- ROLLBACK:
--   drop table if exists public.golf_hours_adjustments;
--   drop table if exists public.golf_team_hours_settings;
--   (no other object depends on either; the app reads them as missing again)
--
-- VERIFY: select 1 where to_regclass('public.golf_team_hours_settings') is not
-- null and to_regclass('public.golf_hours_adjustments') is not null;
-- VERIFY: select 1 where (select count(*) from pg_class where oid in
-- ('public.golf_team_hours_settings'::regclass,
-- 'public.golf_hours_adjustments'::regclass) and relrowsecurity) = 2;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- 'public' and tablename in ('golf_team_hours_settings',
-- 'golf_hours_adjustments')) = 7;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- 'public.golf_team_hours_settings', 'SELECT') and not
-- has_table_privilege('anon', 'public.golf_hours_adjustments', 'SELECT');

create table if not exists public.golf_team_hours_settings (
    team_id uuid primary key references public.golf_teams (
        id
    ) on delete cascade,
    division text not null default 'd1' check (
        division in ('d1', 'd2', 'd3', 'naia', 'custom')
    ),
    autonomy boolean not null default false,
    -- a small bounded value (its check holds it far below the smallint limit).
    -- squawk-ignore prefer-bigint-over-smallint
    week_starts_on smallint not null default 1 check (
        week_starts_on between 0 and 6
    ),
    fall_from date,
    fall_to date,
    spring_from date,
    spring_to date,
    custom_day_hours numeric(4, 2) check (
        custom_day_hours is null
        or (custom_day_hours > 0 and custom_day_hours <= 24)
    ),
    custom_week_hours numeric(5, 2) check (
        custom_week_hours is null
        or (custom_week_hours > 0 and custom_week_hours <= 168)
    ),
    -- a small bounded value (its check holds it far below the smallint limit).
    -- squawk-ignore prefer-bigint-over-smallint
    custom_days_off smallint not null default 1 check (
        custom_days_off between 0 and 7
    ),
    untimed_hours numeric(4, 2) check (
        untimed_hours is null or (untimed_hours > 0 and untimed_hours <= 12)
    ),
    updated_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint golf_team_hours_settings_fall_range check (
        (fall_from is null) = (fall_to is null)
        and (fall_from is null or fall_from <= fall_to)
    ),
    constraint golf_team_hours_settings_spring_range check (
        (spring_from is null) = (spring_to is null)
        and (spring_from is null or spring_from <= spring_to)
    )
);

comment on table public.golf_team_hours_settings is
'F-03: the limits a team''s practice-hours (CARA) log is read against. One row '
'a team; absent means the defaults (the team''s division, else NCAA Division '
'I, in season).';

create index if not exists golf_team_hours_settings_updated_by_idx
on public.golf_team_hours_settings (
    updated_by
);

alter table public.golf_team_hours_settings enable row level security;

drop policy if exists golf_team_hours_settings_select
on public.golf_team_hours_settings;
create policy golf_team_hours_settings_select on public.golf_team_hours_settings
for select to authenticated
using (
    public.is_golf_team_coach(team_id) or public.is_golf_team_player(team_id)
);

drop policy if exists golf_team_hours_settings_insert
on public.golf_team_hours_settings;
create policy golf_team_hours_settings_insert on public.golf_team_hours_settings
for insert to authenticated
with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_team_hours_settings_update
on public.golf_team_hours_settings;
create policy golf_team_hours_settings_update on public.golf_team_hours_settings
for update to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));

revoke all on table public.golf_team_hours_settings from anon, public;
grant select,
insert,
update on table public.golf_team_hours_settings to authenticated;

create table if not exists public.golf_hours_adjustments (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.golf_teams (id) on delete cascade,
    event_id uuid not null references public.golf_events (id) on delete cascade,
    counted boolean not null default true,
    hours numeric(4, 2) check (hours is null or (hours >= 0 and hours <= 24)),
    note text check (note is null or char_length(note) <= 280),
    created_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint golf_hours_adjustments_event_uq unique (event_id)
);

comment on table public.golf_hours_adjustments is
'F-03: a coach''s change to how one event counts in the practice-hours log, '
'for every player on it (not countable, or a figure in hours).';

create index if not exists golf_hours_adjustments_team_idx
on public.golf_hours_adjustments (
    team_id
);
create index if not exists golf_hours_adjustments_created_by_idx
on public.golf_hours_adjustments (
    created_by
);

alter table public.golf_hours_adjustments enable row level security;

drop policy if exists golf_hours_adjustments_select
on public.golf_hours_adjustments;
create policy golf_hours_adjustments_select on public.golf_hours_adjustments
for select to authenticated
using (
    public.is_golf_team_coach(team_id) or public.is_golf_team_player(team_id)
);

drop policy if exists golf_hours_adjustments_insert
on public.golf_hours_adjustments;
create policy golf_hours_adjustments_insert on public.golf_hours_adjustments
for insert to authenticated
with check (
    public.is_golf_team_coach(team_id)
    and exists (
        select 1
        from public.golf_events e
        where e.id = event_id and e.team_id = golf_hours_adjustments.team_id
    )
);

drop policy if exists golf_hours_adjustments_update
on public.golf_hours_adjustments;
create policy golf_hours_adjustments_update on public.golf_hours_adjustments
for update to authenticated
using (public.is_golf_team_coach(team_id))
with check (
    public.is_golf_team_coach(team_id)
    and exists (
        select 1
        from public.golf_events e
        where e.id = event_id and e.team_id = golf_hours_adjustments.team_id
    )
);

drop policy if exists golf_hours_adjustments_delete
on public.golf_hours_adjustments;
create policy golf_hours_adjustments_delete on public.golf_hours_adjustments
for delete to authenticated
using (public.is_golf_team_coach(team_id));

revoke all on table public.golf_hours_adjustments from anon, public;
grant select,
insert,
update,
delete on table public.golf_hours_adjustments to authenticated;
