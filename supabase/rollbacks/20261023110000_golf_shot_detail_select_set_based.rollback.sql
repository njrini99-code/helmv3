-- ROLLBACK CAPTURE for
-- supabase/migrations/20261023110000_golf_shot_detail_select_set_based.sql
--
-- Forward change (not applied): adds public.golf_shot_detail_round_ids() and
-- puts a set-based fast branch in front of can_read_golf_shot_detail(shot_id)
-- in the putt_details_select and approach_miss_details_select policies. Who can
-- read which row does not change; only how fast the check runs.
--
-- Prior definitions, read live from pg_policies and pg_proc on production
-- 2026-10-23 (read-only):
--   putt_details_select            PERMISSIVE, SELECT, TO authenticated,
--                                  USING (can_read_golf_shot_detail(shot_id))
--   approach_miss_details_select   PERMISSIVE, SELECT, TO authenticated,
--                                  USING (can_read_golf_shot_detail(shot_id))
--   public.golf_shot_detail_round_ids(): does not exist.
-- can_read_golf_shot_detail(uuid) itself is not touched by the forward change
-- (COST 10000 and its search_path stay as they are), so it needs no restore.
--
-- What rolling back costs: shot-detail embeds go back to one function call per
-- detail row on every page (measured 2026-10-23: up to ~6 s for a whole team).
-- No data changes either way.
--
-- Metadata: forward change carried by the PR that adds this file (record its
-- merge SHA in the production rollout ledger); capture date 2026-10-23;
-- approval record: Production rollout ledger row on apply; Sentry watch window:
-- the apply time plus 24 hours, surfaces insight-delivery.fetchShotDriversByCategory
-- and golf stats pages (statement timeouts, 57014).

BEGIN;

ALTER POLICY putt_details_select ON public.putt_details
  USING (public.can_read_golf_shot_detail(shot_id));

ALTER POLICY approach_miss_details_select ON public.approach_miss_details
  USING (public.can_read_golf_shot_detail(shot_id));

DROP FUNCTION IF EXISTS public.golf_shot_detail_round_ids();

COMMIT;

-- Verification (expect 2 rows, then 0 rows):
--   select policyname from pg_policies where schemaname = 'public'
--     and policyname in ('putt_details_select', 'approach_miss_details_select')
--     and qual = 'can_read_golf_shot_detail(shot_id)';
--   select 1 from pg_proc where proname = 'golf_shot_detail_round_ids';
