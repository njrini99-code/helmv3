-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). OWNER CALL OQ-68.
-- Apply: npm run db:apply --
-- supabase/migrations/20261025020200_golf_poll_payload_freeze.sql
-- Risk: LOW. Adds one BEFORE INSERT OR UPDATE trigger on golf_messages that
-- acts only on rows whose kind is or was 'poll'. Every other message path
-- (text, edits, deletes, pins) is untouched.
--
-- Why: golf_messages_update_v2 lets a sender rewrite any column of their own
-- message, so a poll's question and choices could be changed after votes are
-- in, or a closed poll reopened. And golf_messages_insert_v2 lets any member
-- insert kind = 'poll' with any payload. This keeps a poll what it was when
-- it was sent:
--   insert: payload v1 shape (question 1..140, 2..6 options o1..oN with
--           labels 1..60, multi boolean), closed_at null;
--   update: kind stays 'poll'; content, question, options, multi and
--           closes_at never change; closed_at may go from null to a time,
--           never back and never to another time. Pins and read flags stay
--           allowed.
--   delete: the app's real soft delete (deleteMessage) is allowed:
--           is_deleted false -> true, with content kept or set to '' and
--           payload kept or set to NULL, and nothing else of the poll changed
--           in that write. An undelete is refused, and a deleted poll stays
--           as it was deleted.
-- Refusals are P0001 with HINT golf_poll_shape (insert) or golf_poll_frozen
-- (update), which the app reads as its send (CH-7028) and close (CH-7027)
-- failures. Only requests with a JWT role other than service_role are
-- checked: service_role (support fixes) and sessions without a JWT role (the
-- database owner's own maintenance) pass.
-- Order: none.
-- Desired schema: supabase/schemas/functions/public.sql,
-- supabase/schemas/functions/95_grants.sql, supabase/schemas/triggers/golf.sql.
--
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname =
-- VERIFY:   'golf_messages_poll_freeze' and tgrelid =
-- VERIFY:   'public.golf_messages'::regclass and not tgisinternal);
-- VERIFY: select 1 where exists (select 1 from pg_proc where proname =
-- VERIFY:   'golf_messages_poll_freeze' and pronamespace =
-- VERIFY:   'public'::regnamespace and not prosecdef and proconfig @>
-- VERIFY:   array['search_path=""']);
-- VERIFY: select 1 where not has_function_privilege('authenticated',
-- VERIFY:   'public.golf_messages_poll_freeze()', 'EXECUTE') and not
-- VERIFY:   has_function_privilege('anon',
-- VERIFY:   'public.golf_messages_poll_freeze()', 'EXECUTE');
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_messages_poll_freeze ON
-- ROLLBACK:   public.golf_messages;
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_messages_poll_freeze();

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_messages_poll_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_opts jsonb;
  v_role text := (SELECT auth.role());
BEGIN
  -- Support fixes (service_role) and the owner's own sessions (no JWT role) pass.
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.kind IS DISTINCT FROM 'poll' THEN
      RETURN NEW;
    END IF;
    v_opts := NEW.payload->'options';
    IF NEW.payload IS NULL
       OR (NEW.payload->>'v') IS DISTINCT FROM '1'
       OR char_length(coalesce(NEW.payload->>'question', '')) NOT BETWEEN 1 AND 140
       OR jsonb_typeof(v_opts) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_opts) NOT BETWEEN 2 AND 6
       OR jsonb_typeof(NEW.payload->'multi') IS DISTINCT FROM 'boolean'
       OR (NEW.payload->>'closed_at') IS NOT NULL THEN
      RAISE EXCEPTION 'Not a poll this app can draw'
        USING ERRCODE = 'P0001', HINT = 'golf_poll_shape';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_opts) WITH ORDINALITY AS e(o, i)
      WHERE (e.o->>'id') IS DISTINCT FROM ('o' || e.i)
         OR char_length(coalesce(e.o->>'label', '')) NOT BETWEEN 1 AND 60
    ) THEN
      RAISE EXCEPTION 'Not a poll this app can draw'
        USING ERRCODE = 'P0001', HINT = 'golf_poll_shape';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.kind IS DISTINCT FROM 'poll' AND NEW.kind IS DISTINCT FROM 'poll' THEN
    RETURN NEW;
  END IF;
  IF OLD.kind IS DISTINCT FROM NEW.kind THEN
    RAISE EXCEPTION 'A message cannot become or stop being a poll'
      USING ERRCODE = 'P0001', HINT = 'golf_poll_frozen';
  END IF;

  -- A deleted poll stays deleted, and stays as it was deleted.
  IF coalesce(OLD.is_deleted, false) THEN
    IF NOT coalesce(NEW.is_deleted, false)
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.payload IS DISTINCT FROM OLD.payload THEN
      RAISE EXCEPTION 'A deleted poll cannot be changed'
        USING ERRCODE = 'P0001', HINT = 'golf_poll_frozen';
    END IF;
    RETURN NEW;
  END IF;

  -- The app's soft delete: content kept or cleared, payload kept or cleared, nothing else of the poll.
  IF coalesce(NEW.is_deleted, false) THEN
    IF (NEW.content IS DISTINCT FROM OLD.content AND NEW.content IS DISTINCT FROM '')
       OR (NEW.payload IS DISTINCT FROM OLD.payload AND NEW.payload IS NOT NULL) THEN
      RAISE EXCEPTION 'A poll cannot be changed after it is sent'
        USING ERRCODE = 'P0001', HINT = 'golf_poll_frozen';
    END IF;
    RETURN NEW;
  END IF;

  -- An open poll: only closed_at may change, once, from null to a time.
  IF NEW.content IS DISTINCT FROM OLD.content
     OR (NEW.payload - 'closed_at') IS DISTINCT FROM (OLD.payload - 'closed_at')
     OR ((OLD.payload->>'closed_at') IS NOT NULL
         AND (NEW.payload->>'closed_at') IS DISTINCT FROM (OLD.payload->>'closed_at')) THEN
    RAISE EXCEPTION 'A poll cannot be changed after it is sent'
      USING ERRCODE = 'P0001', HINT = 'golf_poll_frozen';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.golf_messages_poll_freeze() IS
'Clubhouse polls (P-2): a poll is inserted only in payload v1 shape and never '
'changes after it is sent, except closed_at set once and the app''s soft '
'delete (content and payload kept or cleared). Refusals are P0001 with HINT '
'golf_poll_shape or golf_poll_frozen. Checks only requests with a JWT role '
'other than service_role. Held 20261025020200.';

REVOKE ALL ON FUNCTION public.golf_messages_poll_freeze()
FROM public, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'golf_messages_poll_freeze'
      AND tgrelid = 'public.golf_messages'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER golf_messages_poll_freeze
      BEFORE INSERT OR UPDATE ON public.golf_messages
      FOR EACH ROW EXECUTE FUNCTION public.golf_messages_poll_freeze();
  END IF;
END;
$$;
