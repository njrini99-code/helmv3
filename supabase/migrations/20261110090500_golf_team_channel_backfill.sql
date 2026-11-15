-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). DATA CHANGE on live
-- conversations: the owner approves this file on its own, after seeing the
-- counts below.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090500_golf_team_channel_backfill.sql
-- Risk: MEDIUM. This is the one file of the set that changes rows when it is
-- applied. On production today (read-only counts, 2026-11-10; run
-- "Counts before applying" again first, they move with the roster):
--   11 channels created     one for each of the 11 teams that has none; all 11
--                           have a staffed coach.
--   117 participant rows added
--                           114 into the 11 new channels (96 active players and
--                           18 coaches), 3 into the one channel that exists (1
--                           active player and 2 staffed coaches missing from
--                           it).
--   5 participant rows removed
--                           5 people on 3 teams with no role on the team any
--                           more (3 have a roster row that is not active, 2
--                           have no roster or staff row), in 4 coach's groups.
--                           All 4 groups have messages, which those 5 stop
--                           being able to read; 3 of the 5 posted there, and
--                           their messages stay. None of the 5 created the
--                           group, none is in a team channel, and none of the
--                           rows is in a two-person group.
-- App change needed: NONE, with one cosmetic gap (see "What people see").
-- No push, e-mail or in-app notification is sent: the file writes no message,
-- the app notifies from the code path that sends one (src/app/actions/
-- messages.ts), and no trigger on golf_conversations or
-- golf_conversation_participants notifies (production's triggers on them,
-- 2026-11-10: golf_participants_read_mark and _read_marks_on_leave only; no
-- webhook trigger anywhere).
--
-- What this does:
--   1. Creates helm_private.golf_team_channel_backfill() RETURNS TABLE
--      (channels_created integer, rows_added integer, rows_removed integer),
--      SECURITY DEFINER, search_path = '', EXECUTE revoked from PUBLIC, anon
--      and authenticated. It is kept, so the same sweep can be run again.
--        a. For every team with at least one staffed coach who has an account:
--           helm_private.golf_ensure_team_channel() (20261110090300; it
--           creates the channel if there is none and fills it), then adds to
--           the team's channel every active player with an account and every
--           staffed coach with an account who is not in it.
--        b. For every team: helm_private.golf_team_remove_departed()
--           (20261110090400) for each person in its channel or team chats, so
--           "has no live link" is decided by the same code the triggers run.
--           One-to-one conversations are not touched.
--   2. Runs it once and prints the three counts and the transaction's
--      timestamp (RAISE NOTICE). Keep that line: the rollback needs the
--      timestamp.
--   A second run finds nothing to do and reports 0, 0, 0.
--
-- What people see (Fairway at d0f467a73, which production serves, and at
-- main: the code below is the same at both; Clubhouse at main, off in
-- production):
--   * Every coach and active player gets one new row in Messages. Fairway:
--     title "<team name> — Team Channel" (conversation-kind.ts:55), preview
--     "No messages yet" (MessageConversationRail.tsx:306), no time and no
--     unread dot. A thread with no message has no day, so it lists first in
--     the EARLIER section, under unread threads and today's
--     (MessageConversationRail.tsx:121-126; the hook sorts by last message
--     time, else updated_at, and does not keep the RPC's channel-first order).
--     Opening it shows the "No messages yet" empty state. Nothing says
--     "Unknown". Clubhouse: the same title and preview (MessagesView.tsx:597),
--     always first in the Pinned card (model.ts:378), second line "Team
--     channel · N members".
--   * COSMETIC GAP, Fairway only: Fairway decides "group or direct" by member
--     count (conversation-kind.ts:39, count > 2), so a channel with one or two
--     members is drawn as a direct thread: it shows the other person's name,
--     or "Conversation member" when the coach is alone in it, instead of the
--     title. Production has 2 such teams today (1 person and 2 people). It
--     corrects itself when the team has three people. The fix is app-side
--     (isGroupConversation returns true for is_team_channel) and needs an app
--     release; it is not in this file.
--   * UNREAD BADGE on the one channel that exists: the 3 people added to it
--     have never read it, so all of its messages count as unread for them (the
--     list RPC and the Fairway hook count every message from someone else for
--     a team chat with no last_read_at). That is an in-app badge, not a push.
--     The 11 new channels are empty and show none.
--   * A person who is removed loses that group from their list on the next
--     reload; the others see them as "Former member" on old messages
--     (MessageThreadPane.tsx:1396).
--
-- Not done here:
--   * A member the channel's creator removed by hand is put back if still on
--     the team: nothing records that the removal was deliberate. On the one
--     existing channel all 8 members joined in the minute it was created
--     (20261110090000 header), so its 3 missing people were never added.
--   * An existing channel's created_by is left as it is (production's one
--     channel was created by a coach still on that team's staff).
--   * Teams with no staffed coach get no channel (production: none today).
--
-- LOCKS: row locks only (inserts into golf_conversations and
-- golf_conversation_participants, deletes from golf_conversation_participants
-- and, through its triggers, golf_conversation_read_marks). No table is
-- locked against reads or writes.
--
-- ORDER: after 20261110090300 AND 20261110090400 (the precondition refuses to
-- run without both: with only the first, a person this file removes would
-- stay out, but the next person to leave would not be removed). No app deploy
-- is needed before or after.
--
-- Counts before applying (read-only, one row; production 2026-11-10: 11, 117,
-- 5). A per-team version, with how many of the removed are in conversations
-- that have messages, was handed over with this file.
-- COUNTS: with live as (select m.team_id, gp.user_id from public.golf_team_members m join public.golf_players gp on gp.id = m.player_id where m.status = 'active' and gp.user_id is not null union select s.team_id, gc.user_id from public.golf_team_coach_staff s join public.golf_coaches gc on gc.id = s.coach_id where gc.user_id is not null), coached as (select distinct s.team_id from public.golf_team_coach_staff s join public.golf_coaches gc on gc.id = s.coach_id where gc.user_id is not null) select (select count(*) from coached k where not exists (select 1 from public.golf_conversations c where c.team_id = k.team_id and c.is_team_channel)) as channels_to_create, (select count(*) from live l join coached k on k.team_id = l.team_id where not exists (select 1 from public.golf_conversation_participants cp join public.golf_conversations c on c.id = cp.conversation_id where c.team_id = l.team_id and c.is_team_channel and cp.user_id = l.user_id)) as rows_to_add, (select count(*) from public.golf_conversation_participants cp join public.golf_conversations c on c.id = cp.conversation_id where c.team_id is not null and (c.is_team_channel or c.is_team_chat) and not public.golf_user_on_conversation_team(c.id, cp.user_id)) as rows_to_remove; -- noqa: LT05
-- Save before applying, so the removals can be put back (5 rows today):
--   select cp.* from public.golf_conversation_participants cp
--   join public.golf_conversations c on c.id = cp.conversation_id
--   where c.team_id is not null and (c.is_team_channel or c.is_team_chat)
--     and not public.golf_user_on_conversation_team(c.id, cp.user_id);
--
-- VERIFY: select 1 where not exists (select 1 from public.golf_teams t where exists (select 1 from public.golf_team_coach_staff s join public.golf_coaches gc on gc.id = s.coach_id where s.team_id = t.id and gc.user_id is not null) and not exists (select 1 from public.golf_conversations c where c.team_id = t.id and c.is_team_channel)); -- noqa: LT05
-- VERIFY: select 1 where not exists (select 1 from (select m.team_id, gp.user_id from public.golf_team_members m join public.golf_players gp on gp.id = m.player_id where m.status = 'active' and gp.user_id is not null union select s.team_id, gc.user_id from public.golf_team_coach_staff s join public.golf_coaches gc on gc.id = s.coach_id where gc.user_id is not null) l join public.golf_conversations c on c.team_id = l.team_id and c.is_team_channel where not exists (select 1 from public.golf_conversation_participants cp where cp.conversation_id = c.id and cp.user_id = l.user_id)); -- noqa: LT05
-- VERIFY: select 1 where not exists (select 1 from public.golf_conversation_participants cp join public.golf_conversations c on c.id = cp.conversation_id where c.team_id is not null and (c.is_team_channel or c.is_team_chat) and not public.golf_user_on_conversation_team(c.id, cp.user_id)); -- noqa: LT05
-- VERIFY: select 1 where not exists (select 1 from public.golf_conversations where is_team_channel and team_id is not null group by team_id having count(*) > 1); -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = 'helm_private.golf_team_channel_backfill()'::regprocedure and prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE'); -- noqa: LT05
--
-- ROLLBACK (one transaction; <ts> is the timestamp the NOTICE printed, which
-- every row this file wrote carries as created_at or joined_at). ORDER: this
-- file goes first of the channel files, before 20261110090300 (its function
-- calls that file's ensure function) and 20261110090200:
--   Can be undone:
--     -- channels this file created that still have no message (their
--     -- participant rows go with them, ON DELETE CASCADE)
--     delete from public.golf_conversations c
--     where c.is_team_channel and c.created_at = '<ts>'
--       and not exists (select 1 from public.golf_messages m
--                       where m.conversation_id = c.id);
--     -- people this file added to a channel that already existed
--     delete from public.golf_conversation_participants cp
--     using public.golf_conversations c
--     where c.id = cp.conversation_id and c.is_team_channel
--       and cp.joined_at = '<ts>' and c.created_at <> '<ts>';
--     drop function if exists helm_private.golf_team_channel_backfill();
--   Cannot be undone from the database:
--     * A channel this file created that has a message by then. Deleting it
--       deletes the messages; leave it, or decide by hand.
--     * The removed participant rows. Nothing keeps them. They can be
--       re-inserted only from the "Save before applying" output above
--       (conversation_id, user_id, joined_at, last_read_at and the mute
--       settings), and while 20261110090400 is applied a re-inserted row stays
--       only until that person's next roster change.
--     * While 20261110090300 is applied, a deleted channel comes back, empty,
--       on the team's next roster or staff write.
-- pgTAP: supabase/tests/rls/golf_team_channel_backfill.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('helm_private.golf_ensure_team_channel(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'apply 20261110090300 first: the team channel is not ensured yet';
  END IF;
  IF to_regprocedure('helm_private.golf_team_remove_departed(uuid, uuid)')
     IS NULL THEN
    RAISE EXCEPTION
      'apply 20261110090400 first: leaving a team does not remove anyone yet';
  END IF;
END $$;

-- 1. The sweep ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_backfill()
RETURNS TABLE (
    channels_created integer, rows_added integer, rows_removed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team uuid;
  v_person record;
  v_channel uuid;
  v_had_channel boolean;
  v_before integer;
  v_after integer;
  v_created integer := 0;
  v_added integer := 0;
  v_removed integer := 0;
BEGIN
  -- a. Every team with a staffed coach has a channel holding its people.
  FOR v_team IN
    SELECT t.id
    FROM public.golf_teams AS t
    WHERE EXISTS (
      SELECT 1
      FROM public.golf_team_coach_staff AS s
      INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
      WHERE s.team_id = t.id AND gc.user_id IS NOT NULL
    )
    ORDER BY t.id
  LOOP
    SELECT
      count(DISTINCT c.id) > 0,
      count(cp.id)::integer
    INTO v_had_channel, v_before
    FROM public.golf_conversations AS c
    LEFT JOIN public.golf_conversation_participants AS cp
      ON c.id = cp.conversation_id
    WHERE c.team_id = v_team AND c.is_team_channel;

    v_channel := helm_private.golf_ensure_team_channel(v_team);
    CONTINUE WHEN v_channel IS NULL;
    IF NOT v_had_channel THEN
      v_created := v_created + 1;
    END IF;

    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    SELECT
      v_channel,
      people.user_id
    FROM (
      SELECT gp.user_id
      FROM public.golf_team_members AS m
      INNER JOIN public.golf_players AS gp ON m.player_id = gp.id
      WHERE m.team_id = v_team
        AND m.status = 'active'::public.team_member_status
        AND gp.user_id IS NOT NULL
      UNION
      SELECT gc.user_id
      FROM public.golf_team_coach_staff AS s
      INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
      WHERE s.team_id = v_team AND gc.user_id IS NOT NULL
    ) AS people
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    SELECT count(*)::integer INTO v_after
    FROM public.golf_conversation_participants AS cp
    WHERE cp.conversation_id = v_channel;
    v_added := v_added + (v_after - v_before);
  END LOOP;

  -- b. Nobody without a live link stays in a team's channel or team chats.
  FOR v_person IN
    SELECT DISTINCT
      c.team_id,
      cp.user_id
    FROM public.golf_conversation_participants AS cp
    INNER JOIN public.golf_conversations AS c ON cp.conversation_id = c.id
    WHERE c.team_id IS NOT NULL AND (c.is_team_channel OR c.is_team_chat)
  LOOP
    v_removed := v_removed
      + helm_private.golf_team_remove_departed(v_person.team_id, v_person.user_id);
  END LOOP;

  RETURN QUERY SELECT v_created, v_added, v_removed;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_backfill()
FROM public, anon, authenticated;

-- 2. Run it once --------------------------------------------------------------

DO $$
DECLARE
  v_run record;
BEGIN
  SELECT * INTO v_run FROM helm_private.golf_team_channel_backfill();
  RAISE NOTICE
    'golf team channel backfill: % channels created, % participant rows added, % participant rows removed; rows stamped %',
    v_run.channels_created, v_run.rows_added, v_run.rows_removed, now();
END $$;
