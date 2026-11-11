-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). New behaviour, not a
-- security fix; applied separately from them.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090200_golf_team_channel_auto_join.sql
-- Risk: LOW-MEDIUM. No data changes when applied (no backfill). Adds two AFTER
-- ROW triggers, on golf_team_members and golf_team_coach_staff. Each can only
-- add a participant row to a conversation flagged is_team_channel for that
-- row's own team, and neither can fail the roster write it rides on: any error
-- is caught and raised as a WARNING.
-- App change needed: NONE. The conversation list already reloads on a
-- golf_conversation_participants change.
--
-- The gap (owner requirement, 2026-11-10: once a player joins a team they are
-- in its team channel). Nothing does that today, at main (743cb23a1) or at the
-- build production serves (d0f467a73):
--   join by code: teams.ts:430 (RPC golf_join_team_with_code) or :433.
--     Writes the roster row only.
--   coach approves a request: teams.ts:1356 (acceptJoinRequest).
--     Writes the roster row only.
--   set active again: team-management.ts:336 (d0f467a73: :242).
--     Writes status only.
--   staff: golf_team_coach_staff rows. No conversation write.
--   No trigger on either table touches conversations, the Messages screens
--   never insert the viewer, and after 20261110090000 a member cannot add
--   themself. Production, 2026-11-10 (read-only): 12 teams, 1 has a team
--   channel; on that team 1 of 8 active players and 2 of 3 staffed coaches are
--   not in it.
--
-- What this adds:
--   1. helm_private.golf_team_channel_join_member(), AFTER INSERT OR UPDATE OF
--      status ON golf_team_members, for a row that is 'active' now and was not
--      before the statement (a new active row, or pending / inactive / removed
--      to active). If the player has a user_id, that user gets a participant
--      row in every conversation with team_id = the row's team and
--      is_team_channel = true, ON CONFLICT (conversation_id, user_id) DO
--      NOTHING. A team with no channel: nothing happens. An update that leaves
--      status 'active' adds nobody, so a member the channel's creator removed
--      is not put back by an unrelated roster edit.
--   2. helm_private.golf_team_channel_join_staff(), AFTER INSERT ON
--      golf_team_coach_staff: the same for the coach's user.
--   Both are SECURITY DEFINER (the participant INSERT policy admits only a
--   conversation's creator), search_path = '', EXECUTE revoked from PUBLIC,
--   anon and authenticated; a trigger fires without the caller holding EXECUTE.
--   The insert runs inside BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING,
--   as helm_private.golf_live_broadcast does, so joining a team, approving a
--   request or changing a status succeeds whatever happens to the channel row.
--   A new member reads the channel's whole history; that is what "in the
--   channel" means here (no per-member watermark).
--
-- Not included, on purpose (report):
--   * No backfill. Existing members who are not in their channel stay out until
--     a separate, approved file adds them.
--   * No trigger on golf_players.user_id. Every player row is created with its
--     user_id (onboarding.ts:447, :594); nothing links an account to a roster
--     row afterwards, and production has 0 active roster rows without an
--     account.
--   * Nothing creates a team channel (only scripts/seed-demo-team-ops.ts:641
--     does, with the service role), and creating one does not pull in the
--     current roster. 11 of 12 production teams have none.
--   * Leaving is untouched: going inactive or being removed from the team does
--     not remove the participant row, here or in any other conversation.
--
-- LOCKS (pg_locks after each statement, local stack 2026-11-10): SHARE ROW
-- EXCLUSIVE on golf_team_members, then on golf_team_coach_staff, each once,
-- from CREATE OR REPLACE TRIGGER. Roster and staff writes wait for the few
-- milliseconds the file takes; reads do not wait and are not waited for, which
-- matters on golf_team_members: nearly every Golf policy reads it. The
-- precondition reads golf_conversations, golf_team_coach_staff and golf_coaches
-- (ACCESS SHARE, which waits for and blocks nothing but a schema change). (DROP
-- TRIGGER IF EXISTS, which an earlier draft used, takes ACCESS EXCLUSIVE
-- whenever the trigger exists, so on every re-apply; on a first apply, with
-- nothing to drop, it takes only a brief ACCESS SHARE. CREATE OR REPLACE
-- TRIGGER takes SHARE ROW EXCLUSIVE in both cases.)
--
-- ORDER: after 20261110090050 and 20261107090100, and the precondition below
-- refuses to run without them. These triggers trust is_team_channel:
-- 20261110090050 lets only a coach of the team create a flagged row, and
-- 20261107090100 stops a member changing the flag on an existing one. Without
-- both, a player could flag a conversation of their own and have every new team
-- member delivered into it. Apply 20261110090700 before this file too: it
-- bounds who a coach may put on a roster, and from this file on a roster row
-- carries its player into the team channel. (That one is not a precondition:
-- its name sorts later, and a fresh `supabase db reset` applies files by name.)
-- No app deploy is needed before or after.
--
-- The precondition also refuses to run (security review 2026-11-10, item 5;
-- migration review, should-fix 2) when:
--   * a row flagged is_team_channel has no team, or a creator who is not a
--     staffed coach of its team. Such a row was flagged before the two files
--     above closed the flag, and its creator would receive every new member.
--   * a team has two flagged rows (20261110090300 makes that impossible; here
--     it would put a new member in both).
--   * golf_team_members.status is not public.team_member_status. The trigger
--     functions compare status with that type outside their exception block,
--     so with another type every roster write that sets a status would fail.
--   Production, read-only, 2026-11-10: 1 channel, team set, creator staffed on
--   that team, no team with two; status is team_member_status.
--
-- VERIFY: select 1 from pg_trigger where tgrelid = 'public.golf_team_members'::regclass and tgname = 'golf_team_members_join_team_channel' and not tgisinternal and tgenabled = 'O' and (tgtype & 2) = 0 and (tgtype & 4) = 4 and (tgtype & 16) = 16; -- noqa: LT05
-- VERIFY: select 1 from pg_trigger where tgrelid = 'public.golf_team_coach_staff'::regclass and tgname = 'golf_team_coach_staff_join_team_channel' and not tgisinternal and tgenabled = 'O' and (tgtype & 2) = 0 and (tgtype & 4) = 4; -- noqa: LT05
-- VERIFY: select 1 where (select count(*) from pg_proc where oid in ('helm_private.golf_team_channel_join_member()'::regprocedure, 'helm_private.golf_team_channel_join_staff()'::regprocedure) and prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE')) = 2; -- noqa: LT05
--
-- ROLLBACK: (one transaction; rows the triggers added stay, and can be told
-- apart by nothing: remove them by hand if needed). ORDER: roll back
-- 20261110090500's function and then 20261110090300 (its rollback file) first:
-- 20261110090300 replaced these two function bodies and its ensure function is
-- what they call. This file is rolled back BEFORE 20261110090050,
-- 20261107090100 and 20261110090700, whose rules it trusts:
--   drop trigger if exists golf_team_coach_staff_join_team_channel
--     on public.golf_team_coach_staff;
--   drop trigger if exists golf_team_members_join_team_channel
--     on public.golf_team_members;
--   drop function if exists helm_private.golf_team_channel_join_staff();
--   drop function if exists helm_private.golf_team_channel_join_member();
-- pgTAP: supabase/tests/rls/golf_team_channel_auto_join.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  v_bad integer;
BEGIN
  IF to_regclass('public.golf_team_members') IS NULL
     OR to_regclass('public.golf_team_coach_staff') IS NULL
     OR to_regclass('public.golf_conversations') IS NULL
     OR to_regclass('public.golf_conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'a roster or conversation table is missing';
  END IF;
  -- The trigger functions compare status with this type outside their
  -- exception block: with another type every roster write would fail.
  IF (SELECT a.atttypid FROM pg_attribute AS a
      WHERE a.attrelid = 'public.golf_team_members'::regclass
        AND a.attname = 'status' AND NOT a.attisdropped)
     IS DISTINCT FROM to_regtype('public.team_member_status')::oid THEN
    RAISE EXCEPTION
      'golf_team_members.status is not public.team_member_status';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'helm_private') THEN
    RAISE EXCEPTION 'schema helm_private is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_conversation_participants'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (conversation_id, user_id)'
  ) THEN
    RAISE EXCEPTION
      'golf_conversation_participants has no UNIQUE (conversation_id, user_id)';
  END IF;
  -- These triggers trust is_team_channel. Refuse to run until it can be trusted.
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
  -- The flag can be trusted from now on. The rows that already carry it were
  -- written before that: check them too.
  SELECT count(*) INTO v_bad
  FROM public.golf_conversations AS c
  WHERE c.is_team_channel
    AND (c.team_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.golf_team_coach_staff AS s
        INNER JOIN public.golf_coaches AS gc ON s.coach_id = gc.id
        WHERE s.team_id = c.team_id AND gc.user_id = c.created_by));
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      '% team channel row(s) have no team or a creator who is not a staffed coach of it: fix or unflag them first',
      v_bad;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.golf_conversations
    WHERE is_team_channel AND team_id IS NOT NULL
    GROUP BY team_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'a team has two team channels: merge or unflag one before this file';
  END IF;
END $$;

-- 1. A player whose roster row becomes active ---------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_join_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Active now, and not active before this statement.
  IF NEW.status IS DISTINCT FROM 'active'::public.team_member_status THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;
  -- Never fail the roster write: joining the team matters more than the channel row.
  BEGIN
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    SELECT c.id, gp.user_id
    FROM public.golf_players AS gp
    INNER JOIN public.golf_conversations AS c
      ON c.team_id = NEW.team_id AND c.is_team_channel = true
    WHERE gp.id = NEW.player_id
      AND gp.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team channel auto-join failed for team % player %: % (%)',
      NEW.team_id, NEW.player_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_join_member()
FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_team_members_join_team_channel
AFTER INSERT OR UPDATE OF status ON public.golf_team_members
FOR EACH ROW
WHEN (new.status = 'active')
EXECUTE FUNCTION helm_private.golf_team_channel_join_member();

-- 2. A coach who is put on the team's staff -----------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_join_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Never fail the staff write.
  BEGIN
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    SELECT c.id, gc.user_id
    FROM public.golf_coaches AS gc
    INNER JOIN public.golf_conversations AS c
      ON c.team_id = NEW.team_id AND c.is_team_channel = true
    WHERE gc.id = NEW.coach_id
      AND gc.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team channel auto-join failed for team % coach %: % (%)',
      NEW.team_id, NEW.coach_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_join_staff()
FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_team_coach_staff_join_team_channel
AFTER INSERT ON public.golf_team_coach_staff
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_team_channel_join_staff();
