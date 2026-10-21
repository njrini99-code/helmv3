-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-21 for CoachHelm Slice 6b
-- (precision counters and the Track record); the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261021090000_golf_coachhelm_shown_reads.sql
-- Risk: LOW. One new read-only function; no table, policy or data changes.
--
-- ORDER: no prerequisite. The reader (src/clubhouse/data/
-- coachhelm-track-record.ts) runs only behind the flag
-- coachhelm_track_record_v1 (off) and treats a missing function (42883 /
-- PGRST202) as "track record not available", so the app may ship before or
-- after this apply.
--
-- WHY (02 §9, 07 §2 F): the Track record counts READS shown, under the rung
-- of each read's newest exposure. golf_insight_exposure logs every render, so
-- the largest program has 86,770 exposure rows since Aug 1 for 64 distinct
-- reads (read-only count, 2026-10-21): loading them through PostgREST would
-- be 87 pages a page view. This function returns one row per read (the
-- newest exposure in the window and the ladder it recorded), about 150 ms on
-- that program (EXPLAIN ANALYZE of the same SELECT). The counting itself
-- stays in TypeScript (src/lib/coachhelm/v3/track-record/track-record.ts).
--
-- WHO MAY CALL IT: an authenticated coach of p_team_id
-- (is_golf_team_coach); anyone else gets no rows. SECURITY DEFINER so the
-- per-row exposure policy is not re-evaluated 87,000 times; the coach check
-- is the same one that policy makes (golf_insight_exposure_coach_select_team),
-- applied once. It returns ids and a ladder word only, for the team's active
-- players. anon and public have no EXECUTE.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS
-- public.golf_coachhelm_shown_reads(uuid, timestamptz); the page then says
-- "not available" again.
--
-- `npm run test:rls` could not run where this was written (no Docker).
--
-- VERIFY: select 1 where to_regprocedure(
-- VERIFY: 'public.golf_coachhelm_shown_reads(uuid, timestamptz)') is not null;
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.golf_coachhelm_shown_reads(uuid, timestamptz)', 'EXECUTE')
-- VERIFY: and has_function_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_shown_reads(uuid, timestamptz)', 'EXECUTE');

create or replace function public.golf_coachhelm_shown_reads(
    p_team_id uuid,
    p_since timestamptz
)
returns table (
    insight_id uuid,
    last_shown_at timestamptz,
    shown_ladder text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct on (e.insight_id)
    e.insight_id,
    e.shown_at as last_shown_at,
    e.rank_factors ->> 'ladder' as shown_ladder
  from public.golf_insight_exposure as e
  join public.golf_team_members as gtm
    on gtm.player_id = e.player_id
   and gtm.team_id = p_team_id
   and gtm.status = 'active'::public.team_member_status
  where public.is_golf_team_coach(p_team_id)
    and e.shown_at >= p_since
    and e.insight_id is not null
  order by e.insight_id, e.shown_at desc;
$function$;

comment on function public.golf_coachhelm_shown_reads(uuid, timestamptz) is
'CoachHelm Track record (Slice 6b, flag coachhelm_track_record_v1): one row '
'per read shown to the team since p_since, with its newest exposure time and '
'the ladder that exposure recorded. Coaches of the team only; no rows for '
'anyone else.';

revoke all on function public.golf_coachhelm_shown_reads(uuid, timestamptz)
from public, anon;
grant execute on function public.golf_coachhelm_shown_reads(uuid, timestamptz)
to authenticated, service_role;
