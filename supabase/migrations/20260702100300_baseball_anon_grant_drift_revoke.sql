-- anon-EXECUTE drift revoke.
--
-- This file defines no functions (no CREATE/ALTER FUNCTION anywhere below) --
-- only REVOKEs against 3 pre-existing RPCs. Each of the three already pins
-- its own SET search_path clause in its defining migration (cited below) and
-- is unchanged here; this file just tightens a live EXECUTE grant.
--
-- LIVE-VERIFIED (2026-07-02, pg_proc.proacl): 3 SECURITY DEFINER RPCs carry a
-- live `anon=X` grant despite their OWN defining migrations explicitly doing
-- `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated,
-- service_role;` (no anon) at creation time:
--   - can_insert_baseball_team_member(uuid, team_member_status)
--       (20260630233000_baseball_team_join_policy_rls.sql:101-102)
--   - try_redeem_baseball_team_invitation(uuid)
--       (20260630180200_baseball_team_invitation_redeem_rpc.sql:24-25)
--   - release_baseball_team_invitation_redemption(uuid)
--       (20260630180200_baseball_team_invitation_redeem_rpc.sql:40-41)
-- No later migration touches any of the three, so this is drift from outside
-- migration history (dashboard/manual grant, or a broader ALTER DEFAULT
-- PRIVILEGES / blanket grant applied at some point) -- not a code defect. All
-- three call sites are in src/app/baseball/actions/teams.ts, a 'use server'
-- file that checks supabase.auth.getUser() before any RPC call -- anon
-- EXECUTE is not required by the app and matches none of the three
-- migrations' stated intent. Defense-in-depth: REVOKE it.

REVOKE EXECUTE ON FUNCTION public.can_insert_baseball_team_member(uuid, public.team_member_status) FROM anon;
REVOKE EXECUTE ON FUNCTION public.try_redeem_baseball_team_invitation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) FROM anon;

-- Verify (paste output in the PR/approval record):
--   select proname, proacl from pg_proc where proname in
--     ('can_insert_baseball_team_member','try_redeem_baseball_team_invitation',
--      'release_baseball_team_invitation_redemption');
--   -> anon must not appear in any proacl.
--
-- NOTE: this is a targeted revoke on 3 functions this review happened to spot
-- (baseball-prefixed SECURITY DEFINER RPCs with anon in their live ACL), not
-- the full "155 SECURITY DEFINER RPCs" project-wide sweep referenced in the
-- DB-untangle task. Recommend a dedicated follow-up sweep across all
-- baseball-prefixed SECURITY DEFINER functions (not just the ones this pass
-- happened to name-match) before calling that item closed.
--
-- Rollback: GRANT EXECUTE ON FUNCTION ... TO anon; (re-opens the drift --
-- there is no legitimate reason to; not recommended).
--
-- Reminder for the follow-up sweep above: confirm every baseball-prefixed
-- SECURITY DEFINER function it touches still pins SET search_path -- this
-- file changes none of their definitions, so none needs it added here.
