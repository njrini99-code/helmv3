-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner (supabase/migrations/HELD.md).
-- Apply after 20261025070000. Apply: npm run db:apply -- <this file>
--
-- Clubhouse P-10: the one definition of "who is in class on a date", with the
-- 2026-10-25 review fixes (Must 2, 7, 8; Should 5, 8, 9, 10, 11; S-9, S-13).
--   golf_day_token_dow(text)             weekday token -> ISO dow, mirrors availability.ts
--   golf_safe_time_zone(text)            a zone name that exists, else America/New_York
--   golf_class_in_term(...)              the term-membership rule (F2)
--   golf_class_usable(class, term)       F1, F2, F4, F5: the class could count at all
--   golf_class_term_at(team, at)         the term covering an instant, in its own zone
--   golf_class_player_team(player)       the team class status is computed for
--   golf_player_on_course(player, at)    P-06 8.19 rule, v0 fallback while that table is absent
--   golf_class_blocks_internal(...)      blocks for a team and date (no client grant)
--   golf_class_holds_live(at)            false here; 070200 makes it "the release job is alive"
--   golf_class_day_players_internal(...) the per-player object, shared by both reads
--   golf_team_class_day(team, on)        coach read, SECURITY DEFINER, coach-checked
--   golf_my_class_day(on)                the player's own day plus the exact coach object
--   golf_class_hold_until(user, at)      service_role only; when a hold would end, or null
-- Every uncertain input resolves to "not in class" (plan section 8.4).
--
-- Dates: "today" is taken in the zone of the term covering now (golf_class_term_at),
-- and only when no term covers now in the team zone, checked against
-- pg_timezone_names (golf_safe_time_zone), so a bad stored zone cannot make the coach
-- RPC raise (Must 8).
--
-- golf_my_class_day here has 'held' null. 20261025070200 re-creates it with the
-- real held count once golf_push_holds exists (plpgsql resolves tables at first
-- run, so the body below must not name a table that does not exist yet).
--
-- Tables read, none locked beyond a normal statement: golf_team_terms, golf_team_members,
-- golf_players, golf_player_classes, golf_events, golf_event_attendance,
-- golf_travel_itineraries, golf_class_exceptions, golf_academic_exclusions,
-- golf_player_class_settings, golf_team_settings, golf_rounds. New functions only.
-- Risk: LOW. Wrong logic here would show a player as in class when they are not;
-- every rule fails open and the pgTAP file covers each suppression.
-- pgTAP: supabase/tests/rls/golf_class_blocks.sql
--
-- ROLLBACK: supabase/rollbacks/20261025070100_golf_class_blocks_functions.rollback.sql
-- ROLLBACK: order: 070200 first (it re-creates golf_my_class_day and calls these), then this file, then 070000.
-- VERIFY: select 1 where has_function_privilege('authenticated', 'public.golf_team_class_day(uuid, date)', 'execute') and has_function_privilege('authenticated', 'public.golf_my_class_day(date)', 'execute') and not has_function_privilege('anon', 'public.golf_team_class_day(uuid, date)', 'execute') and not has_function_privilege('anon', 'public.golf_my_class_day(date)', 'execute');
-- VERIFY: select 1 where not has_function_privilege('authenticated', 'public.golf_class_hold_until(uuid, timestamptz)', 'execute') and not has_function_privilege('authenticated', 'public.golf_class_blocks_internal(uuid, date, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.golf_class_day_players_internal(uuid, date, uuid, timestamptz)', 'execute') and not has_function_privilege('authenticated', 'public.golf_player_on_course(uuid, timestamptz)', 'execute') and not has_function_privilege('authenticated', 'public.golf_class_term_at(uuid, timestamptz)', 'execute') and has_function_privilege('service_role', 'public.golf_class_hold_until(uuid, timestamptz)', 'execute');
-- VERIFY: select 1 where not has_function_privilege('authenticated', 'public.golf_class_holds_live(timestamptz)', 'execute') and has_function_privilege('service_role', 'public.golf_class_holds_live(timestamptz)', 'execute') and public.golf_class_holds_live() = false;
-- VERIFY: select 1 where public.golf_day_token_dow('sunday') = 7 and public.golf_day_token_dow('th') = 4 and public.golf_day_token_dow('s') is null and public.golf_safe_time_zone('Not/AZone') = 'America/New_York' and public.golf_safe_time_zone('America/Los_Angeles') = 'America/Los_Angeles';

SET lock_timeout = '3s';

-- Mirrors DAY_CODE_TO_INDEX in src/lib/calendar/availability.ts exactly, key for
-- key. ISO dow: Monday 1 .. Sunday 7 (TS uses 0 for Sunday). A parity unit test
-- reads both files as text and maps 0 to 7 (Must 7). One `when` per key so the
-- test can read the list.
create or replace function public.golf_day_token_dow(p_token text)
returns integer
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case lower(btrim(p_token))
    when 'su' then 7
    when 'sun' then 7
    when 'sunday' then 7
    when 'm' then 1
    when 'mo' then 1
    when 'mon' then 1
    when 'monday' then 1
    when 't' then 2
    when 'tu' then 2
    when 'tue' then 2
    when 'tues' then 2
    when 'tuesday' then 2
    when 'w' then 3
    when 'we' then 3
    when 'wed' then 3
    when 'wednesday' then 3
    when 'th' then 4
    when 'thu' then 4
    when 'thur' then 4
    when 'thurs' then 4
    when 'r' then 4
    when 'thursday' then 4
    when 'f' then 5
    when 'fr' then 5
    when 'fri' then 5
    when 'friday' then 5
    when 'sa' then 6
    when 'sat' then 6
    when 'saturday' then 6
    else null
  end
$$;

-- A zone name Postgres knows, else America/New_York (getValidTimezone's fallback,
-- src/lib/golf/timezone.ts:57).
create or replace function public.golf_safe_time_zone(p_zone text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select n.name from pg_timezone_names n where n.name = btrim(p_zone) limit 1),
    'America/New_York')
$$;

-- F2: semester equals the term label, or blank and created close to the term.
create or replace function public.golf_class_in_term(
    p_semester text, p_created_at timestamptz, p_term public.golf_team_terms
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_term.id is null then false
    when nullif(btrim(p_semester), '') is not null
      then lower(btrim(p_semester)) = lower(btrim(p_term.label))
    else p_created_at >= ((p_term.classes_start - 45)::timestamp at time zone p_term.time_zone)
  end
$$;

-- F1, F2, F4, F5: the class could count in this term at all (Should 10: "tracked"
-- and "holds" need at least one usable class).
create or replace function public.golf_class_usable(
    p_class public.golf_player_classes, p_term public.golf_team_terms
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_term.id is not null
    and p_class.status_enabled                                                 -- F1
    and public.golf_class_in_term(p_class.semester, p_class.created_at, p_term) -- F2
    and p_class.start_time is not null and p_class.end_time is not null        -- F4
    and p_class.end_time - p_class.start_time between interval '10 minutes' and interval '4 hours'
    and coalesce(cardinality(p_class.days), 0) > 0                             -- F5
    and not exists (select 1 from unnest(p_class.days) d where public.golf_day_token_dow(d) is null)
$$;

-- The term covering an instant, judged in the term's own zone: the one date rule
-- (Must 8). Returns null when no term covers it.
create or replace function public.golf_class_term_at(p_team_id uuid, p_at timestamptz)
returns public.golf_team_terms
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.*
  from public.golf_team_terms t
  where t.team_id = p_team_id
    and (p_at at time zone t.time_zone)::date between t.classes_start and t.exams_end
  order by t.classes_start desc
  limit 1
$$;

-- The team class status is computed for: the player's most recent active membership.
create or replace function public.golf_class_player_team(p_player_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.team_id
  from public.golf_team_members m
  where m.player_id = p_player_id and m.status = 'active'
  order by m.joined_at desc nulls last
  limit 1
$$;

-- On the course (S-13, from P-06 8.19): with golf_round_live, a row in phase
-- on_course or finished heard from in the last 10 minutes; before that table
-- exists, the v0 rule: an in-progress golf_rounds row updated in the last 10
-- minutes. Not P-06's 4-hour privacy helper. The branch is dynamic SQL because a
-- plain SQL body naming a missing table fails at create.
create or replace function public.golf_player_on_course(p_player_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  if to_regclass('public.golf_round_live') is not null then
    execute 'select exists (select 1 from public.golf_round_live l'
         || ' where l.player_id = $1 and l.phase in (''on_course'', ''finished'')'
         || ' and l.heard_at > $2 - interval ''10 minutes'')'
      into v_found using p_player_id, p_at;
    return coalesce(v_found, false);
  end if;
  return exists (
    select 1 from public.golf_rounds r
    where r.player_id = p_player_id
      and r.status = 'in_progress'
      and r.updated_at > p_at - interval '10 minutes'
  );
end $$;

-- Blocks for a team and a date (p_on is the date in the term's zone). One block is
-- one meeting of one class, or one exam, for one player, as a pair of instants.
create or replace function public.golf_class_blocks_internal(
    p_team_id uuid,
    p_on date,
    p_player_id uuid default null
)
returns table (
    player_id  uuid,
    class_id   uuid,
    label      text,
    kind       text,      -- 'class' | 'exam'
    source     text,      -- 'pattern' | 'calendar' | 'exam'
    starts_at  timestamptz,
    ends_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with term as (
    select t.*
    from public.golf_team_terms t
    where t.team_id = p_team_id
      and p_on between t.classes_start and t.exams_end
    order by t.classes_start desc
    limit 1
  ),
  bounds as (
    select
      t.time_zone                                           as tz,
      (p_on::timestamp at time zone t.time_zone)            as day_start,
      ((p_on + 1)::timestamp at time zone t.time_zone)      as day_end,
      (t.classes_start::timestamp at time zone t.time_zone) as term_start,
      ((t.classes_end + 1)::timestamp at time zone t.time_zone) as term_classes_end,
      p_on <= t.classes_end                                 as in_classes
    from term t
  ),
  members as (
    select m.player_id
    from public.golf_team_members m
    where m.team_id = p_team_id
      and m.status = 'active'
      and (p_player_id is null or m.player_id = p_player_id)
  ),
  eligible as (                                   -- F1..F6
    select c.id, c.player_id, c.class_name, c.start_time, c.end_time
    from public.golf_player_classes c
    join members m on m.player_id = c.player_id
    cross join term t
    cross join bounds b
    where b.in_classes                                                    -- F3
      and public.golf_class_usable(c, t)                                  -- F1, F2, F4, F5
      and exists (select 1 from unnest(c.days) d                          -- F6
                  where public.golf_day_token_dow(d) = extract(isodow from p_on)::int)
  ),
  class_events as (                               -- narrowed to eligible ids before the regex (Should 5)
    select
      e.start_time, e.end_time, e.status, e.cancelled_at,
      (substring(e.description from
        '\[class:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]'))::uuid
        as class_id
    from public.golf_events e
    cross join bounds b
    where e.team_id = p_team_id
      and e.event_type = 'class'
      and e.start_time >= b.term_start
      and e.start_time <  b.term_classes_end
      and e.description ilike any (select '%[class:' || ec.id::text || ']%' from eligible ec)
  ),
  synced as (
    select distinct ce.class_id from class_events ce
  ),
  today_events as (
    select ce.* from class_events ce cross join bounds b
    where ce.start_time >= b.day_start and ce.start_time < b.day_end
  ),
  pattern as (
    select
      c.player_id, c.id as class_id, c.class_name,
      ((p_on + c.start_time) at time zone b.tz) as starts_at,
      ((p_on + c.end_time)   at time zone b.tz) as ends_at
    from eligible c cross join bounds b
  ),
  agreed as (                                      -- step 5: agreement with the calendar
    select p.*, case when s.class_id is null then 'pattern' else 'calendar' end as source
    from pattern p
    left join synced s on s.class_id = p.class_id
    where s.class_id is null
       or (
         exists (
           select 1 from today_events o
           where o.class_id = p.class_id
             and coalesce(o.status, 'scheduled') <> 'cancelled'
             and o.cancelled_at is null
             and abs(extract(epoch from (o.start_time - p.starts_at))) <= 60
             and abs(extract(epoch from (coalesce(o.end_time, o.start_time) - p.ends_at))) <= 60
         )
         and not exists (
           select 1 from today_events o
           where o.class_id = p.class_id
             and (o.status = 'cancelled' or o.cancelled_at is not null)
         )
       )
  ),
  unsuppressed as (                                -- S1, S2, S3
    select a.* from agreed a
    where not exists (
        select 1 from public.golf_class_exceptions x
        where x.team_id = p_team_id
          and x.kind = 'off'
          and p_on between x.starts_on and x.ends_on
          and (
            x.player_id is null
            or (x.player_id = a.player_id and (x.class_id is null or x.class_id = a.class_id))
          )
      )
      and not exists (
        select 1 from public.golf_academic_exclusions ae
        where ae.player_id = a.player_id
          and p_on between ae.start_date and coalesce(ae.end_date, ae.start_date)
      )
  ),
  exams as (                                       -- step 6
    select
      x.player_id, null::uuid as class_id, coalesce(nullif(btrim(x.label), ''), 'Exam') as class_name,
      ((p_on + x.start_time) at time zone b.tz) as starts_at,
      ((p_on + x.end_time)   at time zone b.tz) as ends_at
    from public.golf_class_exceptions x
    join members m on m.player_id = x.player_id
    cross join bounds b
    where x.team_id = p_team_id and x.kind = 'extra' and x.starts_on = p_on
  ),
  all_blocks as (
    select u.player_id, u.class_id, u.class_name as label, 'class'::text as kind, u.source,
           u.starts_at, u.ends_at
    from unsuppressed u
    union all
    select e.player_id, e.class_id, e.class_name, 'exam', 'exam', e.starts_at, e.ends_at
    from exams e
  )
  select bl.*
  from all_blocks bl
  cross join bounds b
  where not exists (                               -- S4 travelling
      select 1
      from public.golf_travel_itineraries i
      join public.golf_event_attendance a on a.event_id = i.event_id
      where i.team_id = p_team_id
        and i.event_id is not null
        and a.player_id = bl.player_id
        and p_on between i.departure_date and coalesce(i.return_date, i.departure_date)
        and coalesce(a.status, 'pending') not in ('declined', 'not_attending')
    )
    and not exists (                               -- S5 accepted events
      select 1
      from public.golf_events e
      join public.golf_event_attendance a on a.event_id = e.id
      where e.team_id = p_team_id
        and e.event_type is distinct from 'class'
        and coalesce(e.status, 'scheduled') <> 'cancelled'
        and e.cancelled_at is null
        and a.player_id = bl.player_id
        and a.status in ('accepted', 'attending')
        and e.start_time < b.day_end
        and coalesce(e.end_time, e.start_time) >= b.day_start
        and (
          (coalesce(e.all_day, false) = false
            and tstzrange(e.start_time, coalesce(e.end_time, e.start_time + interval '1 hour'), '[)')
                && tstzrange(bl.starts_at, bl.ends_at, '[)'))
          or (coalesce(e.all_day, false) and e.event_type in ('tournament', 'travel', 'qualifier'))
        )
    )
$$;

revoke all on function public.golf_class_blocks_internal(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.golf_class_blocks_internal(uuid, date, uuid) to service_role;

-- Whether pushes can really be held right now (Should 14: the coach payload, the composer
-- placeholder and Notify anyway must never promise a hold that will not happen). Here it is
-- false: nothing can be held until the held-push tables exist. 20261025070200 re-creates it
-- to require a fresh release-job heartbeat (the gate holds nothing while the job is stale, so
-- neither may the payload say it does). Callers are SECURITY DEFINER reads; no client grant.
create or replace function public.golf_class_holds_live(p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select false $$;

revoke all on function public.golf_class_holds_live(timestamptz) from public, anon, authenticated;
grant execute on function public.golf_class_holds_live(timestamptz) to service_role;

-- The per-player object. The coach RPC builds the whole team with it; the player's
-- RPC takes element 0 for one player, so "Coaches see" is the same SQL, not a copy
-- (Should 8). There is no `shared` key: a player with no schedule and a player who
-- turned sharing off look the same to a coach (Should 9); only `tracked` is sent.
create or replace function public.golf_class_day_players_internal(
    p_team_id uuid,
    p_on date,
    p_player_id uuid default null,
    p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_term    public.golf_team_terms;
  v_tz      text;
  v_today   boolean;
  v_players jsonb;
begin
  select * into v_term from public.golf_team_terms t
  where t.team_id = p_team_id and p_on between t.classes_start and t.exams_end
  order by t.classes_start desc limit 1;

  v_tz := coalesce(
    v_term.time_zone,
    (select public.golf_safe_time_zone(s.timezone) from public.golf_team_settings s
      where s.team_id = p_team_id limit 1),
    'America/New_York');
  v_today := p_on = (p_at at time zone v_tz)::date;

  with members as (
    select m.player_id, gp.first_name, gp.last_name, gp.avatar_url
    from public.golf_team_members m
    join public.golf_players gp on gp.id = m.player_id
    where m.team_id = p_team_id and m.status = 'active'
      and (p_player_id is null or m.player_id = p_player_id)
  ),
  settings as (
    select mb.player_id,
           coalesce(s.share_status, true) as shared,
           coalesce(s.share_status, true) and coalesce(s.hold_pushes, true) as holds
    from members mb
    left join public.golf_player_class_settings s on s.player_id = mb.player_id
  ),
  has_usable as (
    select mb.player_id,
      v_term.id is not null and (
        exists (
          select 1 from public.golf_player_classes c
          where c.player_id = mb.player_id and public.golf_class_usable(c, v_term)
        )
        or exists (
          select 1 from public.golf_class_exceptions x
          where x.player_id = mb.player_id and x.kind = 'extra'
            and x.starts_on between v_term.classes_start and v_term.exams_end
        )
      ) as has_usable
    from members mb
  ),
  blocks as (
    select * from public.golf_class_blocks_internal(p_team_id, p_on, p_player_id)
  ),
  away as (
    select distinct on (a.player_id)
      a.player_id, i.destination, i.return_date,
      a.status in ('accepted', 'attending') as confirmed
    from public.golf_travel_itineraries i
    join public.golf_event_attendance a on a.event_id = i.event_id
    where i.team_id = p_team_id and i.event_id is not null
      and p_on between i.departure_date and coalesce(i.return_date, i.departure_date)
      and coalesce(a.status, 'pending') not in ('declined', 'not_attending')
    order by a.player_id, (a.status in ('accepted', 'attending')) desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'player_id',  mb.player_id,
      'first_name', mb.first_name,
      'last_name',  mb.last_name,
      'avatar_url', mb.avatar_url,
      'tracked',    st.shared and hu.has_usable,
      'holds',      st.holds and hu.has_usable and public.golf_class_holds_live(p_at),
      'on_course',  v_today and public.golf_player_on_course(mb.player_id, p_at),
      'off_today',  st.shared and exists (
                      select 1 from public.golf_class_exceptions x
                      where x.team_id = p_team_id and x.kind = 'off'
                        and p_on between x.starts_on and x.ends_on
                        and (x.player_id is null or (x.player_id = mb.player_id and x.class_id is null))),
      'away',       case when aw.player_id is null then null else jsonb_build_object(
                      'destination', aw.destination, 'return_date', aw.return_date,
                      'confirmed', aw.confirmed) end,
      'blocks',     case when st.shared then coalesce((
                      select jsonb_agg(jsonb_build_object(
                          'class_id', bl.class_id, 'label', bl.label, 'kind', bl.kind,
                          'source', bl.source, 'starts_at', bl.starts_at, 'ends_at', bl.ends_at)
                        order by bl.starts_at)
                      from blocks bl where bl.player_id = mb.player_id), '[]'::jsonb)
                    else '[]'::jsonb end
    ) order by mb.last_name, mb.first_name), '[]'::jsonb)
  into v_players
  from members mb
  join settings st on st.player_id = mb.player_id
  join has_usable hu on hu.player_id = mb.player_id
  left join away aw on aw.player_id = mb.player_id;

  return v_players;
end $$;

revoke all on function public.golf_class_day_players_internal(uuid, date, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.golf_class_day_players_internal(uuid, date, uuid, timestamptz) to service_role;

-- Coach read: one payload for Home, Roster, Messages and the sheets.
create or replace function public.golf_team_class_day(p_team_id uuid, p_on date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_tz text;
  v_now     public.golf_team_terms;
  v_zone    text;
  v_today   date;
  v_on      date;
  v_term    public.golf_team_terms;
  v_next    public.golf_team_terms;
begin
  if p_team_id is null or not public.is_golf_team_coach(p_team_id) then
    raise exception 'not a coach of this team' using errcode = '42501';
  end if;

  select public.golf_safe_time_zone(s.timezone) into v_team_tz
  from public.golf_team_settings s where s.team_id = p_team_id limit 1;
  v_team_tz := coalesce(v_team_tz, 'America/New_York');

  -- "Today" is taken in the zone of the term covering now; the team zone only
  -- when no term covers now (Must 8).
  v_now := public.golf_class_term_at(p_team_id, now());
  v_zone := coalesce(v_now.time_zone, v_team_tz);
  v_today := (now() at time zone v_zone)::date;
  v_on := coalesce(p_on, v_today);
  if v_on < v_today - 7 or v_on > v_today + 14 then
    raise exception 'date out of range' using errcode = '22023';
  end if;

  select * into v_term from public.golf_team_terms t
  where t.team_id = p_team_id and v_on between t.classes_start and t.exams_end
  order by t.classes_start desc limit 1;

  select * into v_next from public.golf_team_terms t
  where t.team_id = p_team_id and t.classes_start > v_on
  order by t.classes_start limit 1;

  return jsonb_build_object(
    'on', v_on,
    'team_time_zone', v_team_tz,
    'class_time_zone', v_zone,
    'term', case when v_term.id is null then null else jsonb_build_object(
      'id', v_term.id, 'label', v_term.label,
      'classes_start', v_term.classes_start, 'classes_end', v_term.classes_end,
      'exams_end', v_term.exams_end, 'time_zone', v_term.time_zone,
      'phase', case when v_on <= v_term.classes_end then 'classes' else 'exams' end) end,
    'next_term', case when v_next.id is null then null else jsonb_build_object(
      'id', v_next.id, 'label', v_next.label, 'classes_start', v_next.classes_start) end,
    'players', public.golf_class_day_players_internal(p_team_id, v_on, null, now())
  );
end $$;

revoke all on function public.golf_team_class_day(uuid, date) from public, anon;
grant execute on function public.golf_team_class_day(uuid, date) to authenticated, service_role;

-- The player's own day: their blocks (computed regardless of sharing, it is their
-- own data), their settings, and `player`, the exact object a coach's payload holds
-- for them, so "Coaches see" cannot drift from the coach view (Should 8).
-- This is the 070100 version, 'held' null. 070200 re-creates it with the held count.
create or replace function public.golf_my_class_day(p_on date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player  uuid := public.get_current_golf_player_id();
  v_team    uuid;
  v_team_tz text;
  v_now     public.golf_team_terms;
  v_zone    text;
  v_today   date;
  v_on      date;
  v_term    public.golf_team_terms;
  v_share   boolean;
  v_hold    boolean;
begin
  if v_player is null then
    return jsonb_build_object('player', null);
  end if;

  v_team := public.golf_class_player_team(v_player);
  if v_team is null then
    return jsonb_build_object('player', null);
  end if;

  select public.golf_safe_time_zone(s.timezone) into v_team_tz
  from public.golf_team_settings s where s.team_id = v_team limit 1;
  v_team_tz := coalesce(v_team_tz, 'America/New_York');

  v_now := public.golf_class_term_at(v_team, now());
  v_zone := coalesce(v_now.time_zone, v_team_tz);
  v_today := (now() at time zone v_zone)::date;
  v_on := coalesce(p_on, v_today);
  if v_on < v_today - 7 or v_on > v_today + 14 then
    raise exception 'date out of range' using errcode = '22023';
  end if;

  select * into v_term from public.golf_team_terms t
  where t.team_id = v_team and v_on between t.classes_start and t.exams_end
  order by t.classes_start desc limit 1;

  select coalesce(s.share_status, true), coalesce(s.hold_pushes, true)
  into v_share, v_hold
  from (select 1) one
  left join public.golf_player_class_settings s on s.player_id = v_player;

  return jsonb_build_object(
    'on', v_on,
    'team_id', v_team,
    'team_time_zone', v_team_tz,
    'class_time_zone', v_zone,
    'term', case when v_term.id is null then null else jsonb_build_object(
      'id', v_term.id, 'label', v_term.label,
      'classes_start', v_term.classes_start, 'classes_end', v_term.classes_end,
      'exams_end', v_term.exams_end, 'time_zone', v_term.time_zone,
      'phase', case when v_on <= v_term.classes_end then 'classes' else 'exams' end) end,
    'settings', jsonb_build_object('share_status', v_share, 'hold_pushes', v_hold),
    'player', (public.golf_class_day_players_internal(v_team, v_on, v_player, now())) -> 0,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
          'class_id', bl.class_id, 'label', bl.label, 'kind', bl.kind,
          'source', bl.source, 'starts_at', bl.starts_at, 'ends_at', bl.ends_at)
        order by bl.starts_at)
      from public.golf_class_blocks_internal(v_team, v_on, v_player) bl), '[]'::jsonb),
    'untagged_classes', (
      select count(*) from public.golf_player_classes c
      where v_term.id is not null and c.player_id = v_player
        and nullif(btrim(c.semester), '') is null
        and not public.golf_class_in_term(c.semester, c.created_at, v_term)),
    'unusable_classes', coalesce((
      select jsonb_agg(u.item order by u.sort_name) from (
        -- Should 11: why a class that is switched on and in this term does not count.
        select jsonb_build_object('class_id', c.id, 'reason',
                 case when c.start_time is null or c.end_time is null
                           or c.end_time - c.start_time not between interval '10 minutes' and interval '4 hours'
                      then 'times' else 'days' end) as item,
               c.class_name as sort_name
        from public.golf_player_classes c
        where v_term.id is not null and c.player_id = v_player and c.status_enabled
          and public.golf_class_in_term(c.semester, c.created_at, v_term)
          and not public.golf_class_usable(c, v_term)
        union all
        -- Usable on paper, but the synced calendar rows never match its times.
        select jsonb_build_object('class_id', c.id, 'reason', 'calendar_mismatch'), c.class_name
        from public.golf_player_classes c
        where v_term.id is not null and c.player_id = v_player
          and public.golf_class_usable(c, v_term)
          and exists (
            select 1 from public.golf_events e
            where e.team_id = v_team and e.event_type = 'class'
              and e.start_time >= (v_term.classes_start::timestamp at time zone v_term.time_zone)
              and e.start_time <  ((v_term.classes_end + 1)::timestamp at time zone v_term.time_zone)
              and e.description ilike '%[class:' || c.id::text || ']%')
          and not exists (
            select 1 from public.golf_events e
            where e.team_id = v_team and e.event_type = 'class'
              and e.start_time >= (v_term.classes_start::timestamp at time zone v_term.time_zone)
              and e.start_time <  ((v_term.classes_end + 1)::timestamp at time zone v_term.time_zone)
              and e.description ilike '%[class:' || c.id::text || ']%'
              and coalesce(e.status, 'scheduled') <> 'cancelled' and e.cancelled_at is null
              and abs(extract(epoch from ((e.start_time at time zone v_term.time_zone)::time - c.start_time))) <= 60
              and abs(extract(epoch from ((coalesce(e.end_time, e.start_time) at time zone v_term.time_zone)::time - c.end_time))) <= 60)
      ) u), '[]'::jsonb),
    'held', null
  );
end $$;

revoke all on function public.golf_my_class_day(date) from public, anon;
grant execute on function public.golf_my_class_day(date) to authenticated, service_role;

-- The push gate's question: if a push for this user were sent at p_at, until when
-- should it wait? Null means send now. Service role only. There is no window
-- before the first block (Must 2): the hold starts at the island's start, so a
-- push one minute before class goes out and the player's phone buzzes as they sit.
create or replace function public.golf_class_hold_until(
    p_user_id uuid,
    p_at timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid;
  v_team   uuid;
  v_term   public.golf_team_terms;
  v_on     date;
  v_share  boolean;
  v_hold   boolean;
  v_end    timestamptz;
begin
  select gp.id into v_player from public.golf_players gp where gp.user_id = p_user_id limit 1;
  if v_player is null then return null; end if;

  select coalesce(s.share_status, true), coalesce(s.hold_pushes, true)
  into v_share, v_hold
  from (select 1) one
  left join public.golf_player_class_settings s on s.player_id = v_player;
  if not (v_share and v_hold) then return null; end if;

  v_team := public.golf_class_player_team(v_player);
  if v_team is null then return null; end if;

  if public.golf_player_on_course(v_player, p_at) then return null; end if;

  v_term := public.golf_class_term_at(v_team, p_at);
  if v_term.id is null then return null; end if;
  v_on := (p_at at time zone v_term.time_zone)::date;

  with b as (
    select starts_at, ends_at
    from public.golf_class_blocks_internal(v_team, v_on, v_player)
  ),
  flagged as (
    select starts_at, ends_at,
      case when starts_at <= max(ends_at) over (
             order by starts_at rows between unbounded preceding and 1 preceding
           ) + interval '15 minutes'
           then 0 else 1 end as is_new
    from b
  ),
  numbered as (
    select starts_at, ends_at, sum(is_new) over (order by starts_at) as island
    from flagged
  ),
  islands as (
    select min(starts_at) as island_start, max(ends_at) as island_end
    from numbered group by island
  )
  select least(i.island_end, p_at + interval '4 hours') into v_end
  from islands i
  where p_at >= i.island_start
    and p_at <  i.island_end
  order by i.island_start
  limit 1;

  return v_end;
end $$;

revoke all on function public.golf_class_hold_until(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.golf_class_hold_until(uuid, timestamptz) to service_role;

revoke all on function public.golf_class_term_at(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.golf_class_term_at(uuid, timestamptz) to service_role;
revoke all on function public.golf_class_player_team(uuid) from public, anon, authenticated;
grant execute on function public.golf_class_player_team(uuid) to service_role;
revoke all on function public.golf_player_on_course(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.golf_player_on_course(uuid, timestamptz) to service_role;
