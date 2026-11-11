-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). NOT one of the two
-- features the owner approved on 2026-11-10: a security follow-up found while
-- building 20261110090400, which that file's promise depends on. The owner
-- decides; the recommendation is to apply it with 20261110090400.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090600_golf_participants_insert_team_link.sql
-- Risk: LOW-MEDIUM. No data changes. It narrows who may INSERT a participant
-- row into a team's channel or team chat: only a caller who is on that team.
-- Every participant insert the app makes into such a conversation is made by a
-- creator who is on the team (the five sites listed in 20261110090000's header,
-- the same at main and at d0f467a73), so no app flow loses a write.
-- App change needed: NONE.
--
-- The hole (found 2026-11-10; reproduced on the local stack in the pgTAP file
-- below, where four inserts succeed before this file):
--   20261110090400 deletes the participant rows of a person who leaves a team.
--   But golf_participants_insert_v2 trusts golf_conversations.created_by, and
--   leaving does not change who created a conversation:
--     branch 1  user_id = auth.uid() AND golf_conversation_created_by_me(...)
--               "your own row, in a conversation you created"
--     branch 3  golf_conversation_created_by_me(...) AND the conversation is a
--               team chat AND the new member is on the team
--   Neither asks whether the CALLER is still on the team. So a coach who
--   created a group for some players and was then taken off the staff can, with
--   one insert, put themself back in it (branch 1) and read its history and
--   attachments again, or add any current player to it (branch 3) without
--   being in it. The same holds for a player who created a team chat and is no
--   longer active, and for the creator of a team channel when no other coach
--   was left to hand it to. Many members are minors, and a coach who has been
--   removed from a team is exactly the person this should stop.
--   It is not new: before 20261110090400 such a person was simply never
--   removed. Production today (read-only, 2026-11-10): 0 team chats or channels
--   whose creator has no live link to the team, so nobody is in that position
--   yet.
--
-- The fix:
--   1. public.golf_conversation_team_link_ok(p_conversation_id uuid) RETURNS
--      boolean: false only when the conversation has a team, is that team's
--      channel or a team chat, and the caller is neither an active player nor a
--      staffed coach of that team (is_golf_team_player / is_golf_team_coach).
--      True for every other conversation, including one-to-one threads and
--      conversations with no team. STABLE, SECURITY DEFINER (a former member
--      cannot SELECT the conversation, so the policy could not see its team),
--      search_path = '', EXECUTE for authenticated and service_role only. What
--      it tells a caller about a conversation they cannot read is one bit:
--      "this id is a team conversation of a team you are not on".
--   2. golf_participants_insert_team_link, a RESTRICTIVE INSERT policy on
--      golf_conversation_participants: WITH CHECK (that function). Restrictive,
--      so it holds whatever the permissive policy says and whichever order
--      this file and a later rewrite of golf_participants_insert_v2 are
--      applied in. golf_participants_insert_v2 itself is not touched.
--   Definer code (the auto-join, the backfill), the table owner and the service
--   role are not held to it.
--
-- Not closed:
--   * A group whose creator has left has no manager: nobody can add or remove
--     a member (only the creator could, and now cannot). Members can still
--     read, post and leave. Handing a group to another coach is a product
--     decision, not made here.
--   * One-to-one conversations (neither flag) are out of scope, as in
--     20261110090400: both people stay in them.
--
-- LOCKS (pg_locks after each statement, local stack 2026-11-10): ACCESS
-- EXCLUSIVE on golf_conversation_participants, once (a policy change needs
-- it). Reads and writes of the table wait for the few milliseconds the file
-- takes, and the file waits for them for at most 3s. Apply off-peak and run
-- again on a lock timeout.
--
-- ORDER: independent of the other files (it needs only 20261017003000's
-- helpers, on production since 2026-10-21). It means most with
-- 20261110090400. No app deploy is needed before or after.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversation_participants' and policyname = 'golf_participants_insert_team_link' and permissive = 'RESTRICTIVE' and cmd = 'INSERT' and position('golf_conversation_team_link_ok' in with_check) > 0; -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_conversation_team_link_ok(uuid)'::regprocedure and prosecdef and provolatile = 's' and proconfig = array['search_path=""'] and has_function_privilege('authenticated', oid, 'EXECUTE') and not has_function_privilege('anon', oid, 'EXECUTE'); -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversation_participants' and policyname = 'golf_participants_insert_v2' and cmd = 'INSERT' and permissive = 'PERMISSIVE'; -- noqa: LT05
--
-- ROLLBACK (one transaction; re-opens the hole):
--   drop policy if exists golf_participants_insert_team_link
--     on public.golf_conversation_participants;
--   drop function if exists public.golf_conversation_team_link_ok(uuid);
-- pgTAP: supabase/tests/rls/golf_participants_insert_team_link.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF to_regclass('public.golf_conversations') IS NULL
     OR to_regclass('public.golf_conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'a conversation table is missing';
  END IF;
  IF to_regprocedure('public.is_golf_team_coach(uuid)') IS NULL
     OR to_regprocedure('public.is_golf_team_player(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_golf_team_coach / is_golf_team_player are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_conversation_participants'
      AND policyname = 'golf_participants_insert_v2'
  ) THEN
    RAISE EXCEPTION
      'golf_participants_insert_v2 is missing: this file narrows it';
  END IF;
END $$;

-- 1. Is the caller on the team this conversation belongs to? ------------------

CREATE OR REPLACE FUNCTION public.golf_conversation_team_link_ok(
    p_conversation_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.golf_conversations AS c
    WHERE c.id = p_conversation_id
      AND c.team_id IS NOT NULL
      AND (c.is_team_channel OR c.is_team_chat)
      AND NOT (
        public.is_golf_team_coach(c.team_id)
        OR public.is_golf_team_player(c.team_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.golf_conversation_team_link_ok(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_conversation_team_link_ok(uuid)
TO authenticated, service_role;

-- 2. Only someone on the team adds a member to its channel or team chats ------

DROP POLICY IF EXISTS golf_participants_insert_team_link
ON public.golf_conversation_participants;
CREATE POLICY golf_participants_insert_team_link
ON public.golf_conversation_participants
AS RESTRICTIVE
FOR INSERT
WITH CHECK (public.golf_conversation_team_link_ok(conversation_id));
