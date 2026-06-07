-- Security hardening (2026-06-07): lock the two stat-writer RPCs to service_role.
--
-- update_player_distance_proximity(uuid) and update_player_putt_make_pct(uuid)
-- were added 2026-06-06 as SECURITY DEFINER functions and inadvertently granted
-- anon + authenticated EXECUTE. Each takes a player_id and writes that player's
-- cache with NO ownership check, so an anon/authenticated caller could force a
-- recompute for any player (IDOR write vector). They have ZERO client/server
-- .rpc() callers — both are driven only internally via PERFORM inside
-- refresh_player_stats_cache() (which runs as definer/service_role). Locking them
-- to service_role mirrors the v3 standing-RPC hardening in
-- 20260606090000_v3_rpc_grant_hardening.sql. Reversible; no caller is affected.
--
-- NOTE: this migration was first applied to prod via the Supabase MCP
-- (apply_migration) on 2026-06-07; this file is the reproducible source. Reconcile
-- the prod-recorded version timestamp with this filename before `supabase db push`
-- against any non-prod environment to avoid an accidental replay.

REVOKE EXECUTE ON FUNCTION public.update_player_distance_proximity(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_player_distance_proximity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_player_putt_make_pct(uuid) TO service_role;
