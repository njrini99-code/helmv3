-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). OWNER CALL OQ-68.
-- Apply: npm run db:apply --
-- supabase/migrations/20261025020100_golf_poll_vote_guard.sql
-- Risk: LOW. Adds one BEFORE trigger on golf_message_responses. Rows on
-- messages that are not polls (kind <> 'poll', e.g. a future rsvp) pass
-- untouched. Cascaded deletes (a message or a user removed) pass.
--
-- Why: Clubhouse polls (P-2, handoff 4.34.2) enforce "closed means closed"
-- only in the app; RLS cannot read golf_messages.payload, so a hand-written
-- request could still vote on, change, or take back a vote on a closed or
-- ended poll, or store a choice the poll does not offer. And a former member
-- can take back their old vote: the DELETE policy checks only the row's own
-- user_id, and a DELETE that reads no column is not filtered by the SELECT
-- policy (build-plan review S-10). This trigger refuses:
--   42501, no hint    the caller is not in the poll's conversation
--                     (public.golf_conversation_has_me), on INSERT, UPDATE
--                     and DELETE
--   golf_poll_closed  closed_at set, or closes_at passed
--   golf_poll_deleted the poll message is soft-deleted
--   golf_poll_choice  unknown option id, a repeat, several on a
--                     single-answer poll, or a vote moved to another
--                     message or user
-- SECURITY DEFINER with search_path = '', so it reads the poll (and its
-- conversation_id) by primary key whatever the caller can see; EXECUTE is
-- revoked from PUBLIC, anon and authenticated (a trigger function is not
-- called directly). Only requests with a JWT role other than service_role
-- are checked: service_role (support fixes) and sessions without a JWT role
-- (the database owner's own maintenance) pass.
-- Order: after 20261024090000 on any fresh database (the table's policies
-- and unique pair); on production either order.
-- Desired schema: supabase/schemas/functions/public.sql,
-- supabase/schemas/functions/95_grants.sql, supabase/schemas/triggers/golf.sql.
--
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname =
-- VERIFY:   'golf_message_responses_poll_guard' and tgrelid =
-- VERIFY:   'public.golf_message_responses'::regclass and not tgisinternal);
-- VERIFY: select 1 where exists (select 1 from pg_proc where proname =
-- VERIFY:   'golf_message_responses_poll_guard' and pronamespace =
-- VERIFY:   'public'::regnamespace and prosecdef and proconfig @>
-- VERIFY:   array['search_path=""']);
-- VERIFY: select 1 where not has_function_privilege('authenticated',
-- VERIFY:   'public.golf_message_responses_poll_guard()', 'EXECUTE') and not
-- VERIFY:   has_function_privilege('anon',
-- VERIFY:   'public.golf_message_responses_poll_guard()', 'EXECUTE');
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_message_responses_poll_guard ON
-- ROLLBACK:   public.golf_message_responses;
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_message_responses_poll_guard();

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_message_responses_poll_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row      public.golf_message_responses%ROWTYPE;
  v_kind     text;
  v_conv     uuid;
  v_payload  jsonb;
  v_deleted  boolean;
  v_closes   timestamptz;
  v_ids      text[];
  v_picked   text[];
  v_role     text := (SELECT auth.role());
BEGIN
  -- Support fixes (service_role) and the owner's own sessions (no JWT role) pass.
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Cascades from a deleted message or user pass.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- A vote stays on its poll and with its voter. A move onto a conversation the caller is not in is refused as RLS
  -- would refuse it (42501); any other move off or onto a poll is P0001.
  IF TG_OP = 'UPDATE'
     AND (NEW.message_id IS DISTINCT FROM OLD.message_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.golf_messages m
      WHERE m.id IN (OLD.message_id, NEW.message_id) AND m.kind = 'poll'
    ) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.golf_messages m
      WHERE m.id = NEW.message_id AND public.golf_conversation_has_me(m.conversation_id)
    ) THEN
      RAISE EXCEPTION 'Only people in this conversation can vote on its polls'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'A vote stays on its poll'
      USING ERRCODE = 'P0001', HINT = 'golf_poll_choice';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT m.kind, m.conversation_id, m.payload, coalesce(m.is_deleted, false)
    INTO v_kind, v_conv, v_payload, v_deleted
  FROM public.golf_messages m
  WHERE m.id = v_row.message_id;

  -- Not a poll (or no such message: the foreign key refuses the write).
  IF v_kind IS DISTINCT FROM 'poll' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only someone in the conversation may vote, change or take back a vote.
  IF NOT public.golf_conversation_has_me(v_conv) THEN
    RAISE EXCEPTION 'Only people in this conversation can vote on its polls'
      USING ERRCODE = '42501';
  END IF;

  IF v_deleted THEN
    RAISE EXCEPTION 'This poll was deleted'
      USING ERRCODE = 'P0001', HINT = 'golf_poll_deleted';
  END IF;

  BEGIN
    v_closes := (v_payload->>'closes_at')::timestamptz;
  EXCEPTION WHEN others THEN
    v_closes := NULL;  -- the app reads a bad date as no end, so does this
  END;

  IF (v_payload->>'closed_at') IS NOT NULL
     OR (v_closes IS NOT NULL AND v_closes <= now()) THEN
    RAISE EXCEPTION 'This poll is closed'
      USING ERRCODE = 'P0001', HINT = 'golf_poll_closed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT coalesce(array_agg(o->>'id'), ARRAY[]::text[])
    INTO v_ids
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_payload->'options') = 'array'
         THEN v_payload->'options' ELSE '[]'::jsonb END
  ) AS o;

  v_picked := string_to_array(NEW.choice, ',');

  IF v_picked IS NULL
     OR cardinality(v_picked) = 0
     OR NOT (v_picked <@ v_ids)
     OR cardinality(v_picked) <> (SELECT count(DISTINCT x) FROM unnest(v_picked) AS x)
     OR (coalesce((v_payload->>'multi')::boolean, false) = false
         AND cardinality(v_picked) > 1) THEN
    RAISE EXCEPTION 'That choice is not on this poll'
      USING ERRCODE = 'P0001', HINT = 'golf_poll_choice';
  END IF;

  RETURN NEW;
END;
$$;

-- The words SECURITY DEFINER below are comment text, not a function option:
-- the function above already pins search_path = '', so the semgrep finding on
-- that line is a false positive.
COMMENT ON FUNCTION public.golf_message_responses_poll_guard() IS
'Clubhouse polls (P-2): a vote is refused when the caller is not in the '
'poll''s conversation (42501), the poll is deleted, closed or ended, or the '
'choice is not one the poll offers (P0001 with HINT golf_poll_deleted, '
'golf_poll_closed, golf_poll_choice). '
-- nosemgrep: helmv3-security-definer-without-search-path
'SECURITY DEFINER so it reads the poll by primary key; checks only requests '
'with a JWT role other than service_role. Held 20261025020100.';

REVOKE ALL ON FUNCTION public.golf_message_responses_poll_guard()
FROM public, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'golf_message_responses_poll_guard'
      AND tgrelid = 'public.golf_message_responses'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER golf_message_responses_poll_guard
      BEFORE INSERT OR UPDATE OR DELETE ON public.golf_message_responses
      FOR EACH ROW EXECUTE FUNCTION public.golf_message_responses_poll_guard();
  END IF;
END;
$$;
