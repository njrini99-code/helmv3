-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix
-- (final security review of PR #2498, 2026-11-10, item 1). Apply BEFORE
-- 20261110090200, whatever the file names say: see ORDER.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090700_golf_team_members_coach_write_bounds.sql
-- Risk: MEDIUM. No data changes. It narrows what a coach's own session may
-- write to golf_team_members (a new row needs a pending join request from that
-- player for that team; team_id and player_id of an existing row are frozen)
-- and to golf_team_join_requests (team_id and player_id frozen; a decided
-- request cannot be set back to pending). Every roster write the app makes
-- stays inside those bounds at main (743cb23a1) and at the build production
-- serves (d0f467a73); the list is below. A caller outside the app that inserted
-- a roster row with no request, or moved one, would now get 42501.
-- App change needed: NONE.
--
-- The hole (verified on production from pg_policies, read-only, 2026-11-10;
-- reproduced on the local stack in the pgTAP file below, where 20 of the 39
-- assertions fail before this file):
--   golf_team_members_insert_coach   WITH CHECK (is_golf_team_coach(team_id))
--   golf_team_members_update_coach   USING / WITH CHECK (the same)
--   Neither binds player_id. Coach sign-up is self-serve, so anyone can become
--   a staffed coach of a team of their own, and then:
--     INSERT INTO golf_team_members (team_id, player_id, status)
--     VALUES ('<my team>', '<any golf_players.id>', 'active');
--   or UPDATE one of their own roster rows SET player_id = '<any id>'. That
--   player is now "on the coach's team" for every policy that asks: the coach
--   reads the player's profile row (user_is_coach_of_golf_player), can add them
--   to the team's chats, and once 20261110090200 is applied the auto-join
--   trigger puts the player in the coach's team channel. Many players are
--   minors. The one-team check in acceptJoinRequest is app code only.
--   It needs the victim's golf_players.id. One place a coach can read ids of
--   players who are not on their team today: golf_team_join_requests, whose
--   coach SELECT and UPDATE policies are scoped to the coach's ORGANIZATION,
--   not to their staff rows (a men's coach reads the women's team's requests).
--   No wider leak was found in the SELECT policies; that sweep was not
--   exhaustive (definer RPCs were not read one by one).
--
-- Every way a roster row is written (swept 2026-11-10 over src/**, scripts/**
-- and supabase/functions/** at both versions; file:line at main, with
-- d0f467a73 where it differs):
--   coach approves a request   teams.ts:1355    INSERT (player, team, 'active')
--                              made while the request is still 'pending'; the
--                              request is marked 'approved' afterwards (:1371).
--                              The only INSERT a coach session makes.
--   coach rejects a request    teams.ts:1332, :1512   request UPDATE only
--   coach sets active/inactive team-management.ts:335 (d0f467a73: :241)
--                              UPDATE status, updated_at
--   coach sets availability    team-management.ts:454 (not in d0f467a73)
--                              UPDATE availability, availability_updated_at,
--                              updated_at
--   coach removes a player     roster.ts:107    DELETE
--   player leaves              JoinTeamSection.tsx:138, clubhouse
--                              settings/writes.ts:198 (d0f467a73: :197) DELETE
--   player joins by code       teams.ts:430     RPC golf_join_team_with_code,
--                              SECURITY DEFINER: it inserts as the table owner
--                              and is not held to any policy or to these guards
--   player asks to join        teams.ts:1050    request INSERT, own player only
--   player cancels a request   teams.ts:1619    request DELETE, pending only
--   seed and admin scripts     service role: bypass RLS, and the guards let
--                              them through
--   Onboarding (onboarding.ts) writes golf_players, golf_coaches, golf_teams
--   and golf_team_coach_staff, never golf_team_members. There is no "add
--   player" or invite flow that writes a roster row: invitePlayerToTeam and
--   emailPlayerInvites send the join code.
--   teams.ts:432 is the other branch of joinGolfTeam (no join code): a direct
--   INSERT by the player's own session, which no policy has admitted since the
--   player INSERT policy was dropped (#1257). Its only caller passes the code.
--   It would pass today only for a login that is a staffed coach of the team
--   AND owns the player profile; after this file that needs a pending request
--   too. Production has 1 such login (2026-11-10); its roster row already
--   exists, and joinGolfTeam returns early for a player already on the team.
--   One staff row of production's 21 belongs to a coach whose organization is
--   not the team's. That coach cannot read the team's join requests, so
--   acceptJoinRequest already answers "Request not found" for them; this file
--   changes nothing they can do in the app.
--
-- The fix:
--   1. golf_team_join_requests_identity_guard, BEFORE UPDATE, client sessions
--      only (keyed on current_user, like the messaging guards): id, team_id and
--      player_id cannot change, and status cannot go back to 'pending' from
--      'approved' or 'rejected'. The pending request is the player's consent,
--      and "Coaches can review team join requests" lets a coach UPDATE every
--      column of a request in their organization; without this a coach would
--      re-point a request of their own second account at any player, or reopen
--      an old one, and then pass the check in 2. Only the player inserts a
--      request (unchanged policy), and only for their own profile.
--   2. golf_team_members_insert_coach is recreated: a staffed coach of the
--      team (as before) AND a pending golf_team_join_requests row for that
--      (team_id, player_id). The subquery runs under the coach's own RLS; the
--      approve flow has just read that same request row with the same session
--      (teams.ts:1252), so wherever the flow works the check passes.
--   3. golf_team_members_identity_guard, BEFORE UPDATE, client sessions only:
--      id, team_id and player_id cannot change. Every other column stays
--      writable as it is today.
--   Column grants were considered for 3 and not used: the table gains columns
--   (the three availability columns arrived between d0f467a73 and main), a
--   missed grant would fail a roster save with 42501, and the guard already
--   gives the guarantee the attack needs. The guards are SECURITY INVOKER so
--   that current_user is the session's role; definer functions, the table
--   owner and service_role run as other roles and pass.
--
-- Not closed, on purpose:
--   * A pending request stays valid until the player cancels it or a coach
--     decides it. A player who asked to join team A and then joined team B by
--     code can still be added to A by A's coach with a direct INSERT (the app
--     refuses, with its service-role one-team check). The player did ask.
--     Production holds 0 pending requests (9 approved, 3 rejected).
--   * The request policies stay organization-scoped (see above).
--   * DELETE is unchanged: a coach removes rows of their own team only.
--
-- LOCKS (pg_locks before commit, local stack 2026-11-10): SHARE ROW EXCLUSIVE
-- on golf_team_join_requests, then ACCESS EXCLUSIVE on golf_team_members, in
-- that order. On golf_team_members the policy change comes first, so the
-- strongest lock is the first one taken there and the trigger's SHARE ROW
-- EXCLUSIVE afterwards adds nothing (no lock upgrade). That is the order a
-- join-request write locks them (the request row, then golf_team_members
-- through is_golf_team_player in golf_teams' policy), so such a write and this
-- file cannot wait on each other; no function in the mirror writes both
-- tables. Nearly every Golf policy reads golf_team_members: reads and writes
-- of it wait from that lock to the commit, a few milliseconds; lock_timeout
-- gives up after 3s with nothing changed. Apply off-peak, with no account or
-- team deletion running (a cascade writes both tables and can take them in
-- the other order), and run it again if it times out.
--
-- ORDER: needs nothing from the other held messaging files and no app deploy.
-- In production apply it BEFORE 20261110090200: from that file on, a roster row
-- puts its player in the team channel, so who may write a roster row matters
-- more. (The file is named 090700 because it was written last; a fresh
-- `supabase db reset` applies it after the channel files, which is harmless
-- there.) 20261110090600 asks "is the caller on this team"; this file is what
-- makes the roster's answer to that trustworthy.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_team_members' and policyname = 'golf_team_members_insert_coach' and cmd = 'INSERT' and permissive = 'PERMISSIVE' and roles = '{authenticated}' and position('is_golf_team_coach' in with_check) > 0 and position('golf_team_join_requests' in with_check) > 0 and position('pending' in with_check) > 0; -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname = 'public' and tablename = 'golf_team_members' and cmd in ('INSERT', 'ALL')) = 1; -- noqa: LT05
-- VERIFY: select 1 from pg_trigger where tgrelid = 'public.golf_team_members'::regclass and tgname = 'golf_team_members_identity_guard' and not tgisinternal and tgenabled = 'O' and (tgtype & 2) = 2 and (tgtype & 16) = 16; -- noqa: LT05
-- VERIFY: select 1 from pg_trigger where tgrelid = 'public.golf_team_join_requests'::regclass and tgname = 'golf_team_join_requests_identity_guard' and not tgisinternal and tgenabled = 'O' and (tgtype & 2) = 2 and (tgtype & 16) = 16; -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_proc where oid in ('public.golf_team_members_identity_guard()'::regprocedure, 'public.golf_team_join_requests_identity_guard()'::regprocedure) and not prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE')) = 2; -- noqa: LT05
--
-- ROLLBACK: (one transaction; re-opens the hole, use only to restore a broken
-- roster write while a fix is prepared). ORDER: while 20261110090200 or a later
-- channel file is live, rolling this back means a coach can again deliver any
-- player into their team channel; roll those back first (20261110090500's
-- function, 090400, 090300, 090200, in that order) or accept that for the
-- time the fix takes:
--   drop policy if exists golf_team_members_insert_coach
--     on public.golf_team_members;
--   create policy golf_team_members_insert_coach
--     on public.golf_team_members for insert to authenticated
--     with check (public.is_golf_team_coach(team_id));
--   drop trigger if exists golf_team_members_identity_guard
--     on public.golf_team_members;
--   drop function if exists public.golf_team_members_identity_guard();
--   drop trigger if exists golf_team_join_requests_identity_guard
--     on public.golf_team_join_requests;
--   drop function if exists public.golf_team_join_requests_identity_guard();
-- pgTAP: supabase/tests/rls/golf_team_members_coach_write_bounds.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  v_check text;
  v_other integer;
BEGIN
  IF to_regclass('public.golf_team_members') IS NULL
     OR to_regclass('public.golf_team_join_requests') IS NULL THEN
    RAISE EXCEPTION 'golf_team_members / golf_team_join_requests are missing';
  END IF;
  IF to_regprocedure('public.is_golf_team_coach(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_golf_team_coach(uuid) is missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'golf_team_join_requests'
        AND column_name IN ('id', 'team_id', 'player_id', 'status')) <> 4
     OR (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'golf_team_members'
           AND column_name IN ('id', 'team_id', 'player_id')) <> 3 THEN
    RAISE EXCEPTION 'a roster or join-request identity column is missing';
  END IF;
  -- The join request is only a player's consent while nobody else can file
  -- one: a client INSERT policy on it that is not the player's own would let a
  -- coach forge the request this file asks for. Stop and read it first.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_team_join_requests'
      AND cmd = 'INSERT'
      AND position('gp.user_id' IN with_check) > 0
  ) OR (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'golf_team_join_requests'
          AND cmd IN ('INSERT', 'ALL')) <> 1 THEN
    RAISE EXCEPTION
      'golf_team_join_requests does not have exactly one INSERT policy, the player''s own';
  END IF;
  -- This file rewrites the coach INSERT policy from its one-clause shape and
  -- assumes it is the only way a client session inserts a roster row.
  SELECT with_check INTO v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'golf_team_members'
    AND policyname = 'golf_team_members_insert_coach' AND cmd = 'INSERT';
  IF v_check IS NULL OR position('is_golf_team_coach' IN v_check) = 0 THEN
    RAISE EXCEPTION
      'golf_team_members_insert_coach is not in the shape this file was written against';
  END IF;
  SELECT count(*) INTO v_other
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'golf_team_members'
    AND cmd IN ('INSERT', 'ALL')
    AND policyname <> 'golf_team_members_insert_coach';
  IF v_other > 0 THEN
    RAISE EXCEPTION
      'golf_team_members has % other INSERT policies: this file would not bound them',
      v_other;
  END IF;
END $$;

-- 1. A join request cannot be re-pointed or reopened --------------------------
-- First on purpose: golf_team_join_requests is locked before golf_team_members.

CREATE OR REPLACE FUNCTION public.golf_team_join_requests_identity_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only client sessions are held to this. service_role, the table owner and
  -- SECURITY DEFINER functions run as other roles and pass.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.player_id IS DISTINCT FROM OLD.player_id THEN
    RAISE EXCEPTION 'A join request cannot be moved to another team or player'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'A decided join request cannot be reopened'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.golf_team_join_requests_identity_guard()
FROM public, anon;

CREATE OR REPLACE TRIGGER golf_team_join_requests_identity_guard
BEFORE UPDATE ON public.golf_team_join_requests
FOR EACH ROW
WHEN (
    old.id IS DISTINCT FROM new.id
    OR old.team_id IS DISTINCT FROM new.team_id
    OR old.player_id IS DISTINCT FROM new.player_id
    OR (new.status = 'pending' AND old.status IS DISTINCT FROM 'pending')
)
EXECUTE FUNCTION public.golf_team_join_requests_identity_guard();

-- 2. A coach adds only a player who asked to join that team -------------------

DROP POLICY IF EXISTS golf_team_members_insert_coach
ON public.golf_team_members;
CREATE POLICY golf_team_members_insert_coach
ON public.golf_team_members
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_golf_team_coach(team_id)
    AND EXISTS (
        SELECT 1
        FROM public.golf_team_join_requests AS r
        WHERE
            r.team_id = golf_team_members.team_id
            AND r.player_id = golf_team_members.player_id
            AND r.status = 'pending'
    )
);

-- 3. A roster row stays with its team and its player --------------------------

CREATE OR REPLACE FUNCTION public.golf_team_members_identity_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only client sessions are held to this. service_role, the table owner and
  -- SECURITY DEFINER functions run as other roles and pass.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.player_id IS DISTINCT FROM OLD.player_id THEN
    RAISE EXCEPTION 'A roster row cannot be moved to another team or player'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.golf_team_members_identity_guard()
FROM public, anon;

CREATE OR REPLACE TRIGGER golf_team_members_identity_guard
BEFORE UPDATE ON public.golf_team_members
FOR EACH ROW
WHEN (
    old.id IS DISTINCT FROM new.id
    OR old.team_id IS DISTINCT FROM new.team_id
    OR old.player_id IS DISTINCT FROM new.player_id
)
EXECUTE FUNCTION public.golf_team_members_identity_guard();
