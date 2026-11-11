-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). New behaviour (owner
-- decision 2026-11-10: every team has a team channel); applied separately from
-- the security fixes.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090300_golf_team_channel_ensure.sql
-- Risk: LOW-MEDIUM. No data changes when applied: it creates no channel and
-- adds nobody (the existing teams are 20261110090500's job). From then on the
-- first roster or staff write on a team that has no channel creates one and
-- fills it from the roster. Neither write can fail because of that: any error
-- is caught and raised as a WARNING. The unique index refuses a second channel
-- for a team; production has none (checked read-only 2026-11-10: 12 teams, 1
-- channel, 0 teams with two, 0 channels without a team).
-- App change needed: NONE. The conversation list reloads on a
-- golf_conversation_participants change. A new channel is a row titled
-- "<team name> — Team Channel" with no last message. No push, e-mail or in-app
-- notification is sent: none of the triggers on golf_conversations or
-- golf_conversation_participants sends one, and the app notifies on a message,
-- which creating a channel does not write.
--
-- The gap. 20261110090200 puts a new member in the team's channel "if the team
-- has one". Only scripts/seed-demo-team-ops.ts:641 (service role) creates one,
-- so 11 of production's 12 teams have none and the trigger does nothing there.
-- Nothing stops two channels for one team either: idx_golf_conversations_
-- team_channel is not unique.
--
-- What this adds:
--   1. golf_conversations_one_team_channel_uq, a unique index on (team_id)
--      WHERE is_team_channel. A team has at most one channel. Rows with no
--      team (team_id NULL after a team is deleted: the foreign key is ON
--      DELETE SET NULL) never collide.
--   2. helm_private.golf_ensure_team_channel(p_team_id uuid) RETURNS uuid.
--      Returns the team's channel, creating it when there is none:
--        created_by  the user of the team's primary coach (golf_team_coach_
--                    staff.is_primary), else of the coach staffed first
--                    (created_at, then id). The column is NOT NULL with a
--                    foreign key to users, so a channel needs a real account,
--                    and created_by is what golf_conversation_created_by_me()
--                    trusts: the creator may add a teammate to the channel and
--                    remove a member from it (golf_participants_insert_v2,
--                    golf_participants_delete). That is a coach's power, so it
--                    goes to a coach and never to a player. Production today:
--                    9 teams have one primary coach, 1 has two (the earlier
--                    staff row wins), 2 have none (the coach staffed first).
--        title       '<golf_teams.name> — Team Channel', the form the seed
--                    script writes. Fairway and Clubhouse print the title of a
--                    group and fall back to "Team Group" / "Group" without one
--                    (conversation-kind.ts:56, Messages.tsx:128), and one login
--                    can coach two teams, so the title carries the team's name.
--                    It is not kept in step with a later rename of the team.
--        flags       is_team_channel = true and is_team_chat = true, as the
--                    seed script writes and the one production channel has.
--      A team with no staffed coach who has an account gets no channel and the
--      function returns NULL: there is nobody to own it. The channel is created
--      when the first coach is put on the staff.
--      When it creates the channel it fills it from the roster in the same
--      call: every active player with an account and every staffed coach with
--      an account. A channel that already exists is returned as it is; it is
--      not filled (that is the backfill's job, once).
--      Two callers at once: the INSERT is ON CONFLICT (team_id) WHERE
--      is_team_channel DO NOTHING, so the second waits for the first to commit,
--      inserts nothing, and reads the first one's channel. Checked with two
--      sessions on the local stack (2026-11-10).
--      SECURITY DEFINER, search_path = '', EXECUTE revoked from PUBLIC, anon
--      and authenticated: only the two trigger functions and the backfill call
--      it.
--   3. helm_private.golf_team_channel_join_member() and
--      helm_private.golf_team_channel_join_staff() (from 20261110090200) are
--      replaced, same names, same triggers: each now calls the ensure function
--      and then adds the row's own user to the channel it returns. Everything
--      else is as 20261110090200 left it: only a roster row that becomes
--      active, ON CONFLICT DO NOTHING, and the whole step inside BEGIN ...
--      EXCEPTION WHEN OTHERS THEN RAISE WARNING.
--
-- Not included (report):
--   * The existing teams. 20261110090500 creates their channels and fills them.
--   * Leaving. 20261110090400 removes a member who leaves the team.
--   * idx_golf_conversations_team_channel (team_id, is_team_channel) WHERE
--     is_team_channel = true is now redundant and is left in place: dropping
--     it takes ACCESS EXCLUSIVE on golf_conversations for no user-visible gain.
--   * Deleting the account that created a channel deletes the channel and its
--     messages (golf_conversations.created_by is ON DELETE CASCADE). That is
--     true of every conversation today. The next roster or staff write on the
--     team creates a new, empty channel.
--
-- LOCKS (pg_locks after each statement, local stack 2026-11-10): SHARE on
-- golf_conversations, once, from CREATE UNIQUE INDEX, held to the end of the
-- file. Writes to golf_conversations wait for the few milliseconds the file
-- takes (a new conversation, and the updated_at bump a send makes); reads do
-- not wait and are not waited for. The index is not built CONCURRENTLY:
-- that cannot run inside the transaction scripts/db/apply.mjs opens, and the
-- table is small (production: 23 rows, 2026-11-10). CREATE OR REPLACE FUNCTION
-- takes no table lock, and no trigger is created or dropped.
--
-- ORDER: after 20261110090200 (it replaces that file's two functions and keeps
-- its triggers), which itself needs 20261110090050 and 20261107090100. The
-- precondition below refuses to run without them, and refuses to build the
-- index while any team has two channels. No app deploy is needed before or
-- after. Then 20261110090400, then 20261110090500.
--
-- VERIFY: select 1 from pg_index where indexrelid = 'public.golf_conversations_one_team_channel_uq'::regclass and indrelid = 'public.golf_conversations'::regclass and indisunique and indisvalid and pg_get_indexdef(indexrelid) like '%(team_id) WHERE is_team_channel'; -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = 'helm_private.golf_ensure_team_channel(uuid)'::regprocedure and prorettype = 'uuid'::regtype and prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE'); -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_proc where oid in ('helm_private.golf_team_channel_join_member()'::regprocedure, 'helm_private.golf_team_channel_join_staff()'::regprocedure) and prosrc like '%golf_ensure_team_channel%' and prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE')) = 2; -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and ((tgrelid = 'public.golf_team_members'::regclass and tgname = 'golf_team_members_join_team_channel') or (tgrelid = 'public.golf_team_coach_staff'::regclass and tgname = 'golf_team_coach_staff_join_team_channel'))) = 2; -- noqa: LT05
-- VERIFY: select 1 where not exists (select 1 from public.golf_conversations where is_team_channel and team_id is not null group by team_id having count(*) > 1); -- noqa: LT05
--
-- ROLLBACK: ORDER: roll back 20261110090500 first (drop its function, which
-- calls the ensure function), then this file, then 20261110090200. Then, and
-- only then, the files those two trust (20261110090050, 20261107090100,
-- 20261110090700). 20261110090400 and 20261110090600 can stay. The file is
-- supabase/rollbacks/20261110090300_golf_team_channel_ensure.rollback.sql
-- (one transaction: puts back the two function bodies of 20261110090200, then
-- drops the ensure function and the index). Channels created in the meantime
-- stay, with the people in them; nothing marks them as created by a trigger
-- except a title ending in ' — Team Channel' and a created_at after the apply.
-- pgTAP: supabase/tests/rls/golf_team_channel_ensure.sql

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
  -- This file replaces 20261110090200's functions and relies on its triggers.
  IF to_regprocedure('helm_private.golf_team_channel_join_member()') IS NULL
     OR to_regprocedure('helm_private.golf_team_channel_join_staff()') IS NULL
     OR (
       SELECT count(*) FROM pg_trigger
       WHERE NOT tgisinternal
         AND ((tgrelid = 'public.golf_team_members'::regclass
               AND tgname = 'golf_team_members_join_team_channel')
           OR (tgrelid = 'public.golf_team_coach_staff'::regclass
               AND tgname = 'golf_team_coach_staff_join_team_channel'))
     ) <> 2 THEN
    RAISE EXCEPTION
      'apply 20261110090200 first: the team channel auto-join is missing';
  END IF;
  -- The channel flag must be trustworthy before anything is created from it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_conversations'
      AND policyname = 'golf_conversations_insert_team_channel_coach'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION
      'apply 20261110090050 first: any player can still create a team channel';
  END IF;
  IF has_column_privilege(
       'authenticated', 'public.golf_conversations', 'is_team_channel',
       'UPDATE')
     OR has_column_privilege(
       'anon', 'public.golf_conversations', 'is_team_channel', 'UPDATE') THEN
    RAISE EXCEPTION
      'apply 20261107090100 first: a member can still set is_team_channel';
  END IF;
  -- A clear message instead of a failed index build.
  IF EXISTS (
    SELECT 1 FROM public.golf_conversations
    WHERE is_team_channel AND team_id IS NOT NULL
    GROUP BY team_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'a team has two team channels: merge or unflag one before this file';
  END IF;
END $$;

-- 1. One channel per team -----------------------------------------------------

-- golf_conversations is small (production: 23 rows, 2026-11-10) and
-- CONCURRENTLY cannot run inside apply.mjs's transaction.
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX IF NOT EXISTS golf_conversations_one_team_channel_uq
ON public.golf_conversations (team_id) WHERE is_team_channel;

-- 2. The team's channel, created when there is none ---------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_ensure_team_channel(p_team_id uuid)
RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel uuid;
  v_creator uuid;
  v_team_name text;
BEGIN
  IF p_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_channel
  FROM public.golf_conversations AS c
  WHERE c.team_id = p_team_id AND c.is_team_channel
  LIMIT 1;
  IF v_channel IS NOT NULL THEN
    RETURN v_channel;
  END IF;

  -- The owner: the primary coach, else the coach staffed first. No coach with
  -- an account, no channel.
  SELECT gc.user_id INTO v_creator
  FROM public.golf_team_coach_staff AS s
  INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
  WHERE s.team_id = p_team_id AND gc.user_id IS NOT NULL
  ORDER BY coalesce(s.is_primary, false) DESC, s.created_at ASC, s.id ASC
  LIMIT 1;
  IF v_creator IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.name INTO v_team_name
  FROM public.golf_teams AS t
  WHERE t.id = p_team_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.golf_conversations (
    team_id, created_by, is_team_channel, is_team_chat, title
  )
  VALUES (
    p_team_id, v_creator, true, true,
    coalesce(nullif(btrim(v_team_name), '') || ' — ', '') || 'Team Channel'
  )
  ON CONFLICT (team_id) WHERE is_team_channel DO NOTHING
  RETURNING id INTO v_channel;

  IF v_channel IS NULL THEN
    -- Another transaction created it while this one waited. Its own call
    -- fills the channel; this caller adds its own user afterwards.
    SELECT c.id INTO v_channel
    FROM public.golf_conversations AS c
    WHERE c.team_id = p_team_id AND c.is_team_channel
    LIMIT 1;
    RETURN v_channel;
  END IF;

  -- Fill it from the roster: active players and staffed coaches with an account.
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
  SELECT
    v_channel,
    people.user_id
  FROM (
    SELECT gp.user_id
    FROM public.golf_team_members AS m
    INNER JOIN public.golf_players AS gp ON m.player_id = gp.id
    WHERE m.team_id = p_team_id
      AND m.status = 'active'::public.team_member_status
      AND gp.user_id IS NOT NULL
    UNION
    SELECT gc.user_id
    FROM public.golf_team_coach_staff AS s
    INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
    WHERE s.team_id = p_team_id AND gc.user_id IS NOT NULL
  ) AS people
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_channel;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_ensure_team_channel(uuid)
FROM public, anon, authenticated;

-- 3. The auto-join ensures the channel first ----------------------------------
-- Same names and triggers as 20261110090200; only the bodies change.

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_join_member()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel uuid;
BEGIN
  -- Active now, and not active before this statement.
  IF NEW.status IS DISTINCT FROM 'active'::public.team_member_status THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;
  -- Never fail the roster write: joining the team matters more than the channel.
  BEGIN
    v_channel := helm_private.golf_ensure_team_channel(NEW.team_id);
    IF v_channel IS NOT NULL THEN
      INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      SELECT
        v_channel,
        gp.user_id
      FROM public.golf_players AS gp
      WHERE gp.id = NEW.player_id
        AND gp.user_id IS NOT NULL
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team channel auto-join failed for team % player %: % (%)',
      NEW.team_id, NEW.player_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_join_member()
FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_join_staff()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel uuid;
BEGIN
  -- Never fail the staff write.
  BEGIN
    v_channel := helm_private.golf_ensure_team_channel(NEW.team_id);
    IF v_channel IS NOT NULL THEN
      INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      SELECT
        v_channel,
        gc.user_id
      FROM public.golf_coaches AS gc
      WHERE gc.id = NEW.coach_id
        AND gc.user_id IS NOT NULL
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team channel auto-join failed for team % coach %: % (%)',
      NEW.team_id, NEW.coach_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_join_staff()
FROM public, anon, authenticated;
