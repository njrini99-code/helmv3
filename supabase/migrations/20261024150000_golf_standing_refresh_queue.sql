-- Standing refresh queue: a saved round marks its player's teams dirty, and a
-- short-interval pass refreshes only the dirty teams (Clubhouse A+ rows 105
-- and 121, 2026-10-24). AWAITING OWNER APPLY. Do not apply without the
-- owner's go-ahead.
--
-- WHY. Clubhouse Standing is written only by the nightly standing-refresh
-- cron (02:20 UTC), so a player who saves a round sees yesterday's Standing
-- until the next morning. Calling the team-wide refresh RPCs from the round
-- save is not safe: round-submit.ts runs its follow-up work in after() on
-- Fairway's live 'use server' path, and three team-wide upserts there race
-- the crons into 40P01 deadlocks (see the note above the progress drivers in
-- round-submit.ts). Instead the save leaves a mark, and the refresh runs
-- later, once per team, from the cron.
--
-- WHAT.
--   golf_standing_refresh_queue      one row per dirty team. marked_at moves
--       on every mark (the debounce clock); first_marked_at does not (the
--       cap, so a team saved every few minutes still refreshes).
--   mark_team_standing_dirty(player) marks every team the player is active
--       on. Called after a round save, through the service client, outside
--       the save's transaction; it never touches the round.
--   select_dirty_standing_teams(limit, quiet_seconds, max_wait_seconds)
--       read-only: teams quiet for quiet_seconds since their last mark, or
--       dirty for longer than max_wait_seconds, oldest first.
--   clear_dirty_standing_teams(team_ids, marked_ats) removes a team's mark
--       only if it was not marked again after the run read it (marked_at <=
--       the value the run saw), so a round saved mid-refresh is not lost.
--
-- This file depends on no other held migration and changes no existing
-- object: it can be applied on its own (Tier 1). Until the season standing
-- migration (20261024151000) is applied, the cron's dirty pass finds no
-- refresh function to call, leaves every mark in place and returns.
--
-- SAFETY. New table and new functions only; no existing object changes.
-- The team_id foreign key takes a SHARE ROW EXCLUSIVE lock on golf_teams
-- for the apply's transaction (writes to golf_teams wait; reads do not).
-- lock_timeout 3s caps that wait: a busy golf_teams fails the apply
-- instead of queueing team writes behind it.
-- RLS is enabled with no policy, and anon / authenticated lose the default
-- privileges Supabase grants on new public tables, so only service_role
-- reaches the table. The three functions are SECURITY DEFINER with a pinned
-- search_path, revoked from PUBLIC, anon and authenticated, and granted to
-- service_role only (the select_stalest_teams pattern, 20260606120300).
-- The mark sets lock_timeout 2s on itself: it runs after the save has
-- committed, so a wait can delay only background work, never the save.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.clear_dirty_standing_teams(uuid[], timestamptz[]);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.select_dirty_standing_teams(integer, integer, integer);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.mark_team_standing_dirty(uuid);
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_standing_refresh_queue;
-- ROLLBACK: (the app treats a missing function as "not applied" and skips the mark and the dirty pass quietly).
--
-- VERIFY: select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'golf_standing_refresh_queue' and c.relrowsecurity
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_standing_refresh_queue', 'select') and not has_table_privilege('anon', 'public.golf_standing_refresh_queue', 'select')
-- VERIFY: select 1 where has_function_privilege('service_role', 'public.mark_team_standing_dirty(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.mark_team_standing_dirty(uuid)', 'execute')
-- VERIFY: select 1 where has_function_privilege('service_role', 'public.select_dirty_standing_teams(integer, integer, integer)', 'execute') and not has_function_privilege('anon', 'public.select_dirty_standing_teams(integer, integer, integer)', 'execute')
-- VERIFY: select 1 where has_function_privilege('service_role', 'public.clear_dirty_standing_teams(uuid[], timestamptz[])', 'execute') and not has_function_privilege('authenticated', 'public.clear_dirty_standing_teams(uuid[], timestamptz[])', 'execute')

-- The team_id foreign key takes a SHARE ROW EXCLUSIVE lock on golf_teams for
-- this transaction; cap the wait so team writes are never queued behind it.
set lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_standing_refresh_queue (
  team_id uuid PRIMARY KEY REFERENCES public.golf_teams (id) ON DELETE CASCADE,
  first_marked_at timestamptz NOT NULL DEFAULT now(),
  marked_at timestamptz NOT NULL DEFAULT now(),
  -- A per-team mark count between drains; never near 32 bits.
  -- squawk-ignore prefer-bigint-over-int
  marks integer NOT NULL DEFAULT 1
);

ALTER TABLE public.golf_standing_refresh_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.golf_standing_refresh_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.golf_standing_refresh_queue TO service_role;

COMMENT ON TABLE public.golf_standing_refresh_queue IS 'Teams whose Standing needs a refresh because a player saved a round (Clubhouse A+ rows 105/121, 2026-10-24). Written by mark_team_standing_dirty, read by select_dirty_standing_teams, cleared by clear_dirty_standing_teams; all three service_role only. marked_at is the debounce clock (moves on every mark), first_marked_at the cap.';

CREATE OR REPLACE FUNCTION public.mark_team_standing_dirty(p_player_id uuid)
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET lock_timeout = '2s'
AS $$
  -- Team order is fixed so two marks on overlapping teams lock rows in the
  -- same order.
  WITH teams AS (
    SELECT DISTINCT tm.team_id
      FROM public.golf_team_members tm
     WHERE tm.player_id = p_player_id
       AND tm.status = 'active'::public.team_member_status
  ),
  marked AS (
    INSERT INTO public.golf_standing_refresh_queue AS q (team_id)
    SELECT t.team_id FROM teams t ORDER BY t.team_id
    ON CONFLICT (team_id) DO UPDATE
      SET marked_at = now(), marks = q.marks + 1
    RETURNING 1
  )
  SELECT count(*)::integer FROM marked;
$$;

COMMENT ON FUNCTION public.mark_team_standing_dirty(uuid) IS 'Marks every team the player is active on as needing a Standing refresh; returns how many teams were marked. Called after a round save through the service client (never inside the save). service_role only.';

CREATE OR REPLACE FUNCTION public.select_dirty_standing_teams(
  p_limit integer,
  p_quiet_seconds integer DEFAULT 180,
  p_max_wait_seconds integer DEFAULT 1800
)
  RETURNS TABLE (team_id uuid, marked_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT q.team_id, q.marked_at
    FROM public.golf_standing_refresh_queue q
   WHERE q.marked_at <= now() - make_interval(secs => GREATEST(COALESCE(p_quiet_seconds, 0), 0))
      OR q.first_marked_at <= now() - make_interval(secs => GREATEST(COALESCE(p_max_wait_seconds, 0), 0))
   ORDER BY q.first_marked_at ASC, q.team_id ASC
   LIMIT GREATEST(COALESCE(p_limit, 0), 0);
$$;

COMMENT ON FUNCTION public.select_dirty_standing_teams(integer, integer, integer) IS 'Read-only. Up to p_limit dirty teams that have been quiet for p_quiet_seconds since their last mark (the debounce), or dirty for longer than p_max_wait_seconds (the cap), oldest mark first, with the marked_at the caller must hand back to clear_dirty_standing_teams. service_role only.';

CREATE OR REPLACE FUNCTION public.clear_dirty_standing_teams(p_team_ids uuid[], p_marked_ats timestamptz[])
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cleared integer;
BEGIN
  -- Lock the rows first, in team order (the mark's order), so a clear and a
  -- mark on overlapping teams cannot lock them in opposite orders.
  PERFORM 1
     FROM public.golf_standing_refresh_queue q
     JOIN unnest(p_team_ids, p_marked_ats) AS seen(team_id, marked_at) ON seen.team_id = q.team_id
    WHERE q.marked_at <= seen.marked_at
    ORDER BY q.team_id
      FOR UPDATE OF q;

  DELETE FROM public.golf_standing_refresh_queue q
   USING unnest(p_team_ids, p_marked_ats) AS seen(team_id, marked_at)
   WHERE q.team_id = seen.team_id
     AND q.marked_at <= seen.marked_at;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN v_cleared;
END;
$$;

COMMENT ON FUNCTION public.clear_dirty_standing_teams(uuid[], timestamptz[]) IS 'Clears the marks a refresh run has covered: a team''s row goes only if its marked_at is not later than the value the run read, so a round saved during the refresh keeps its team dirty. Returns the rows removed. service_role only.';

REVOKE ALL ON FUNCTION public.mark_team_standing_dirty(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.select_dirty_standing_teams(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_dirty_standing_teams(uuid[], timestamptz[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_team_standing_dirty(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.select_dirty_standing_teams(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_dirty_standing_teams(uuid[], timestamptz[]) TO service_role;
