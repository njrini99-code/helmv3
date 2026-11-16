-- STATUS: WRITTEN, NOT APPLIED. Written 2026-11-15 (launch readiness
-- DF-P-04); the owner applies it after review (supabase/migrations/HELD.md
-- row).
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261115141500_golf_coachhelm_shown_reads_seen_only.sql
-- Risk: LOW. Replaces one read-only function with the same signature, the
-- same grants and one more WHERE clause; no table, policy or data change.
--
-- ORDER: after 20261021090000_golf_coachhelm_shown_reads.sql (applied
-- 2026-10-21). Before the Track record flag coachhelm_track_record_v1 turns
-- on: with the flag off nothing reads this function.
--
-- WHY (DF-P-04): the Track record counts the reads shown to a team since the
-- season start, one row per read from its newest exposure. Every
-- `hub_signal` exposure is a read nobody saw: Team Hub's loader recorded the
-- player's top insight as shown on every open and every prefetch, for a card
-- no Clubhouse screen draws (PMAC-01, DF-P-02; the loader no longer reads it,
-- so no new rows are written). Causality runs already leave those rows out
-- (src/lib/coachhelm/v3/causality/exposure-scope.ts,
-- CAUSALITY_EXCLUDED_SURFACES); this makes the Track record read the same
-- rows. A read whose only exposures are hub_signal drops out of the record;
-- a read with any other exposure keeps it, dated from the newest of those.
--
-- NOT FIXED HERE: coach_feed rows written by the coach's player Standing
-- before DF-P-03 (15 Nov 2026) carry the same surface as the reads a coach
-- did see, so no filter can tell them apart. They date a read's newest
-- exposure no later than a seen one would, and the record counts reads, not
-- exposures, so they add a read only when the coach never opened its dive or
-- board in the window.
--
-- WHO MAY CALL IT: unchanged (an authenticated coach of p_team_id; anon and
-- public have no EXECUTE).
--
-- ROLLBACK: re-run the CREATE OR REPLACE in
-- 20261021090000_golf_coachhelm_shown_reads.sql.
--
-- `npm run test:rls` could not run where this was written (no Docker).
--
-- VERIFY: select 1 where pg_get_functiondef(
-- VERIFY: 'public.golf_coachhelm_shown_reads(uuid, timestamptz)'::regprocedure)
-- VERIFY: like '%hub_signal%'
-- VERIFY: and not has_function_privilege('anon',
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
    and (e.surface is null or e.surface not in ('hub_signal'))
  order by e.insight_id, e.shown_at desc;
$function$;

comment on function public.golf_coachhelm_shown_reads(uuid, timestamptz) is
'CoachHelm Track record (Slice 6b, flag coachhelm_track_record_v1): one row '
'per read shown to the team since p_since, with its newest exposure time and '
'the ladder that exposure recorded. Leaves out hub_signal exposures, which '
'no screen drew (DF-P-04). Coaches of the team only; no rows for anyone else.';

revoke all on function public.golf_coachhelm_shown_reads(uuid, timestamptz)
from public, anon;
grant execute on function public.golf_coachhelm_shown_reads(uuid, timestamptz)
to authenticated, service_role;
