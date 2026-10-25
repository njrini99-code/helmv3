-- ROLLBACK CAPTURE for
-- supabase/migrations/20261025070200_golf_push_holds.sql
--
-- Forward change (held, not applied): adds golf_push_holds, golf_push_hold_heartbeat,
-- golf_class_hold_dirty, twelve functions (the beat, put, cancel, claim, claim_failed,
-- claim_user, mark, unclaim, reconcile, cleanup, release_mine functions and the dirty
-- trigger function), five triggers, and re-creates golf_my_class_day with a 'held' block.
--
-- Prior definitions: none, except golf_my_class_day, whose prior body is the 070100
-- one (printed in full below, 'held' null).
--
-- What rolling back costs: pushes that were held and not yet released are lost with the
-- table (they are summaries of messages and updates already visible in the Bell and the
-- inbox; roll back only after the release job has drained them, or run Deliver now for
-- everyone first). The app's gate treats a missing function as "send now".
--
-- Metadata: forward change carried by the PR that adds this file (record its merge SHA
-- in the production rollout ledger); capture date 2026-10-25; approval record:
-- Production rollout ledger row on apply; Sentry watch window: the apply time plus 24
-- hours, surfaces pushes.class_hold and class-holds-release.

SET lock_timeout = '3s';

drop trigger if exists golf_class_hold_mark_dirty on public.golf_class_exceptions;
drop trigger if exists golf_class_hold_mark_dirty on public.golf_team_terms;
drop trigger if exists golf_class_hold_mark_dirty on public.golf_player_class_settings;
drop trigger if exists golf_class_hold_mark_dirty on public.golf_player_classes;
drop trigger if exists golf_class_hold_mark_dirty on public.golf_event_attendance;
drop function if exists public.golf_class_hold_mark_dirty();

-- golf_my_class_day back to its 070100 body (no table dependency) before the table goes.
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

drop function if exists public.golf_push_holds_release_mine();
drop function if exists public.golf_push_holds_cleanup(interval);
drop function if exists public.golf_push_holds_reconcile(timestamptz, boolean);
drop function if exists public.golf_push_holds_unclaim(uuid, uuid[]);
drop function if exists public.golf_push_holds_mark(uuid, uuid[], text);
drop function if exists public.golf_push_holds_claim_user(uuid, uuid, text, boolean);
drop function if exists public.golf_push_holds_claim_failed(uuid, integer, timestamptz);
drop function if exists public.golf_push_holds_claim(uuid, integer, timestamptz, text);
drop function if exists public.golf_push_holds_cancel(uuid, uuid);
drop function if exists public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text);
drop function if exists public.golf_push_holds_beat(text);

drop table if exists public.golf_class_hold_dirty;
drop table if exists public.golf_push_hold_heartbeat;
drop table if exists public.golf_push_holds;
