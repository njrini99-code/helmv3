-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). New behaviour (owner
-- decision 2026-11-10: leaving a team removes you from its team channel and
-- its group chats); applied separately from the security fixes.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090400_golf_team_leave_removes_participants.sql
-- Risk: MEDIUM. No data changes when applied (the people who already left are
-- 20261110090500's job). From then on a roster or staff write that ends a
-- person's last role on a team deletes that person's participant rows in the
-- team's channel and team chats: they stop reading and posting there at once,
-- and lose the history. Neither write can fail because of it: any error is
-- caught and raised as a WARNING, and the person then stays in.
-- App change needed: NONE. Both apps reload the conversation list on a
-- golf_conversation_participants change, and both already handle a member the
-- group's creator removed (the same row delete): their messages stay, shown as
-- from a former member. No push, e-mail or in-app notification is sent.
--
-- The gap. A participant row is the whole of a person's access to a
-- conversation (user_conversation_ids(), golf_conversation_has_me()), and
-- nothing removes it when the person leaves the team: a coach setting a player
-- inactive or removed (team-management.ts), a player leaving (the "Players can
-- leave teams" DELETE policy), a coach coming off the staff. So a former player
-- or coach keeps reading and posting in the team channel and in every coach's
-- group they were in. Many members are minors. Production, 2026-11-10
-- (read-only): 5 such rows on 3 teams, all in conversations that have messages.
--
-- What this adds:
--   1. helm_private.golf_team_remove_departed(p_team_id uuid, p_user_id uuid)
--      RETURNS integer (rows removed). Does nothing unless the team still
--      exists and the user has NO live link to it. A live link is an 'active'
--      golf_team_members row of a golf_players row with that user_id, or a
--      golf_team_coach_staff row of a golf_coaches row with that user_id: the
--      same test golf_user_on_conversation_team() makes. Then it deletes the
--      user's golf_conversation_participants rows for conversations with
--      team_id = that team AND (is_team_channel OR is_team_chat). A one-to-one
--      conversation (team set, neither flag) is left alone, and so is every
--      conversation of another team.
--   2. helm_private.golf_team_chats_leave_member(), on golf_team_members:
--        golf_team_members_leave_team_chats         AFTER UPDATE OF status,
--          WHEN (old.status = 'active'
--                AND new.status IS DISTINCT FROM 'active')
--        golf_team_members_delete_leave_team_chats  AFTER DELETE
--      It resolves the row's player to a user and calls (1).
--   3. helm_private.golf_team_chats_leave_staff(), on golf_team_coach_staff:
--        golf_team_coach_staff_leave_team_chats     AFTER DELETE
--      It resolves the row's coach to a user and calls (1). Then, if that user
--      created the team's channel and is no longer on the staff, the channel's
--      created_by moves to the primary coach still on the staff, else the one
--      staffed first (the order 20261110090300 uses). created_by is what lets
--      someone add and remove the channel's members, and what would let a
--      former coach put themself back (branch 1 of golf_participants_insert_v2
--      is "your own row, in a conversation you created"). With no coach left
--      it stays as it is.
--   All three are SECURITY DEFINER (the DELETE policy admits only the member
--   themself or the creator), search_path = '', EXECUTE revoked from PUBLIC,
--   anon and authenticated. The trigger functions run their work inside BEGIN
--   ... EXCEPTION WHEN OTHERS THEN RAISE WARNING.
--
-- One login, two roles (a coach who is also a player of the same team): the
-- live-link test covers both, so access ends when the second role ends,
-- whichever order they end in.
--
-- What else runs on a participant delete (all inside the same guarded block):
-- golf_participants_read_marks_on_leave (golf_forget_read_marks: deletes that
-- user's read marks for the conversation) and, once 20261031150000 is applied
-- (it is not on production today), golf_participants_unpin_on_leave (removes
-- the pin and broadcasts the user's pin list). Both are SECURITY DEFINER. If
-- either raises, the removal is rolled back to the savepoint and the roster
-- write commits; the warning names the team and the person.
--
-- Thought through, and what happens:
--   * Inactive, then active again: 20261110090200 / 090300 put the player back
--     in the channel. Not in a coach's group: a coach adds people to a group.
--     Their old last_read_at is gone, so the channel's history counts as
--     unread for them.
--   * A coach who created a group and leaves the staff: the group is not
--     deleted and keeps its created_by. Its members keep reading and posting
--     and can each leave; nobody can add or remove a member any more, because
--     only the creator can (golf_participants_insert_v2 branch 3,
--     golf_participants_delete) and there is no DELETE policy on
--     golf_conversations. NOT CLOSED HERE: the former coach is still its
--     creator, so the INSERT policy still lets them add their own row back
--     (branch 1) or add a current team member (branch 3). 20261110090600
--     closes that; apply it with this file.
--   * A team is deleted: golf_team_members and golf_team_coach_staff rows
--     cascade and these triggers fire, find no team, and do nothing, so the
--     result does not depend on the order Postgres runs the cascades in. The
--     conversations keep their members with team_id NULL (ON DELETE SET NULL),
--     as before this file.
--   * A golf_players or golf_coaches row is deleted outright: the roster or
--     staff row cascades, the trigger cannot resolve the user any more and
--     does nothing. The participant rows stay unless the account itself is
--     deleted (they cascade from users). The removal half of 20261110090500 is
--     re-runnable and sweeps them.
--   * A two-person conversation stored as a team chat (a coach's broadcast to
--     one player carries is_team_chat) is a team chat here: the player who
--     leaves the team is removed from it. Only threads with neither flag are
--     kept.
--   * A roster row that was never active (pending, declined) and is deleted:
--     the function runs, finds no live link and nothing to delete.
--
-- LOCKS (pg_locks after each statement, local stack 2026-11-10): SHARE ROW
-- EXCLUSIVE on golf_team_members, then on golf_team_coach_staff, each from
-- CREATE OR REPLACE TRIGGER (the same two locks, in the same order, as
-- 20261110090200). Roster and staff writes wait for the few milliseconds the
-- file takes; reads do not wait and are not waited for.
--
-- ORDER: after 20261110090300. Before 20261110090500, so nobody the backfill
-- removes can drift back. No app deploy is needed before or after.
--
-- VERIFY: select 1 where (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and (tgtype & 2) = 0 and (tgtype & 1) = 1 and ((tgrelid = 'public.golf_team_members'::regclass and tgname = 'golf_team_members_leave_team_chats' and (tgtype & 16) = 16) or (tgrelid = 'public.golf_team_members'::regclass and tgname = 'golf_team_members_delete_leave_team_chats' and (tgtype & 8) = 8) or (tgrelid = 'public.golf_team_coach_staff'::regclass and tgname = 'golf_team_coach_staff_leave_team_chats' and (tgtype & 8) = 8))) = 3; -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_proc where oid in ('helm_private.golf_team_remove_departed(uuid, uuid)'::regprocedure, 'helm_private.golf_team_chats_leave_member()'::regprocedure, 'helm_private.golf_team_chats_leave_staff()'::regprocedure) and prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE')) = 3; -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgname in ('golf_team_members_join_team_channel', 'golf_team_coach_staff_join_team_channel')) = 2; -- noqa: LT05
--
-- ROLLBACK: (one transaction; people already removed stay removed: nothing
-- records who they were, so put them back by hand or from a backup). ORDER:
-- nothing has to be rolled back first; no other file calls these functions:
--   drop trigger if exists golf_team_coach_staff_leave_team_chats
--     on public.golf_team_coach_staff;
--   drop trigger if exists golf_team_members_delete_leave_team_chats
--     on public.golf_team_members;
--   drop trigger if exists golf_team_members_leave_team_chats
--     on public.golf_team_members;
--   drop function if exists helm_private.golf_team_chats_leave_staff();
--   drop function if exists helm_private.golf_team_chats_leave_member();
--   drop function if exists helm_private.golf_team_remove_departed(uuid, uuid);
-- pgTAP: supabase/tests/rls/golf_team_leave_removes_participants.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF to_regclass('public.golf_team_members') IS NULL
     OR to_regclass('public.golf_team_coach_staff') IS NULL
     OR to_regclass('public.golf_conversations') IS NULL
     OR to_regclass('public.golf_conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'a roster or conversation table is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'helm_private') THEN
    RAISE EXCEPTION 'schema helm_private is missing';
  END IF;
  -- Rejoining must put a player back in the channel, and the channel must exist.
  IF to_regprocedure('helm_private.golf_ensure_team_channel(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'apply 20261110090300 first: the team channel is not ensured yet';
  END IF;
END $$;

-- 1. Take one person out of one team's channel and team chats -----------------

CREATE OR REPLACE FUNCTION helm_private.golf_team_remove_departed(
    p_team_id uuid, p_user_id uuid
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_removed integer := 0;
BEGIN
  IF p_team_id IS NULL OR p_user_id IS NULL THEN
    RETURN 0;
  END IF;
  -- A deleted team: its rows are cascading. Leave its conversations alone.
  IF NOT EXISTS (
    SELECT 1 FROM public.golf_teams AS t
    WHERE t.id = p_team_id
  ) THEN
    RETURN 0;
  END IF;
  -- Still on the team in either role: stays.
  IF EXISTS (
    SELECT 1
    FROM public.golf_team_members AS m
    INNER JOIN public.golf_players AS gp ON m.player_id = gp.id
    WHERE m.team_id = p_team_id
      AND m.status = 'active'::public.team_member_status
      AND gp.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff AS s
    INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
    WHERE s.team_id = p_team_id
      AND gc.user_id = p_user_id
  ) THEN
    RETURN 0;
  END IF;

  DELETE FROM public.golf_conversation_participants AS cp
  USING public.golf_conversations AS c
  WHERE cp.conversation_id = c.id
    AND cp.user_id = p_user_id
    AND c.team_id = p_team_id
    AND (c.is_team_channel OR c.is_team_chat);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_remove_departed(uuid, uuid)
FROM public, anon, authenticated;

-- 2. A player who stops being active, or whose roster row is deleted ----------

CREATE OR REPLACE FUNCTION helm_private.golf_team_chats_leave_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
BEGIN
  -- Never fail the roster write.
  BEGIN
    SELECT gp.user_id INTO v_user
    FROM public.golf_players AS gp
    WHERE gp.id = OLD.player_id;
    IF v_user IS NOT NULL THEN
      PERFORM helm_private.golf_team_remove_departed(OLD.team_id, v_user);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team chats removal failed for team % player %: % (%)',
      OLD.team_id, OLD.player_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_chats_leave_member()
FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_team_members_leave_team_chats
AFTER UPDATE OF status ON public.golf_team_members
FOR EACH ROW
WHEN (old.status = 'active' AND new.status IS DISTINCT FROM 'active')
EXECUTE FUNCTION helm_private.golf_team_chats_leave_member();

CREATE OR REPLACE TRIGGER golf_team_members_delete_leave_team_chats
AFTER DELETE ON public.golf_team_members
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_team_chats_leave_member();

-- 3. A coach who comes off the staff ------------------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_team_chats_leave_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
BEGIN
  -- Never fail the staff write.
  BEGIN
    SELECT gc.user_id INTO v_user
    FROM public.golf_coaches AS gc
    WHERE gc.id = OLD.coach_id;
    IF v_user IS NOT NULL THEN
      PERFORM helm_private.golf_team_remove_departed(OLD.team_id, v_user);

      -- The channel belongs to a coach who is on the staff. If this one
      -- created it and is no longer staffed, hand it to the primary coach
      -- still there, else the one staffed first. Nobody left: no change.
      UPDATE public.golf_conversations AS c
      SET created_by = heir.user_id
      FROM (
        SELECT gc.user_id
        FROM public.golf_team_coach_staff AS s
        INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
        WHERE s.team_id = OLD.team_id
          AND gc.user_id IS NOT NULL
          AND gc.user_id <> v_user
        ORDER BY coalesce(s.is_primary, false) DESC, s.created_at ASC, s.id ASC
        LIMIT 1
      ) AS heir
      WHERE c.team_id = OLD.team_id
        AND c.is_team_channel
        AND c.created_by = v_user
        AND NOT EXISTS (
          SELECT 1
          FROM public.golf_team_coach_staff AS s2
          INNER JOIN public.golf_coaches AS gc2 ON s2.coach_id = gc2.id
          WHERE s2.team_id = OLD.team_id
            AND gc2.user_id = v_user
        );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team chats removal failed for team % coach %: % (%)',
      OLD.team_id, OLD.coach_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_chats_leave_staff()
FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_team_coach_staff_leave_team_chats
AFTER DELETE ON public.golf_team_coach_staff
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_team_chats_leave_staff();
