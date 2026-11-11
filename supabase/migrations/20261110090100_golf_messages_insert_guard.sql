-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix, ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- supabase/migrations/20261110090100_golf_messages_insert_guard.sql
-- Risk: LOW. No data changes, no grant or policy change. One BEFORE INSERT trigger on golf_messages that acts on client
-- sessions only. For every insert the app makes it changes nothing: none sends created_at or kind = 'system', and every
-- reply it sends was already checked against the same conversation (sweep below).
-- App change needed: NONE.
--
-- The holes (security review 2026-11-10, item A3; each reproduced on the local stack by the pgTAP file below):
--   golf_messages_insert_v2 is `sender_id = auth.uid() AND conversation_id IN user_conversation_ids(...)`. The caller
--   chooses every other column, and the 20261107090100 guards cover UPDATE only. So a member of a conversation can INSERT:
--   * created_at years ahead: the conversation comes back for every member who hid it (the list RPC shows a hidden row
--     again when a message is newer than hidden_at), stays unread, and that message sorts as its newest for good. NULL does
--     the same (ORDER BY created_at DESC puts NULL first). A past date slips a message in above what was already read.
--   * kind = 'system': a notice that reads as the app speaking ("Coach removed ...").
--   * reply_to_id pointing at a message in another conversation; only the app checks it (validateGolfReplyTarget).
--
-- What the app sends on INSERT, at main (743cb23a1) and at the build production serves (d0f467a73); swept 2026-11-10
-- over src/**, scripts/**, supabase/functions/**. All three run as the signed-in user:
--   sendMessage                      messages.ts:170 (d0f467a73: :158)   id?, conversation_id, sender_id, content, read,
--                                                                        reply_to_id?, notify_anyway? (main only)
--   sendGolfMessageWithAttachments   message-attachments.ts:140 (both)   the same, plus has_attachments
--   sendGolfPoll                     message-polls.ts:97 (main only)     the same, plus kind = 'poll' and payload
--   created_at: never sent. The optimistic row's time is local to the screen; the send is a server action, there is no
--     offline queue, and a transport retry reruns the same action (same client id), so every stored date is the column
--     default now().
--   kind: 'poll' or absent ('text'). Nothing in the repository writes 'system' to golf_messages, as any role.
--     Production, 2026-11-10: 620 text, 4 poll, 0 system.
--   reply_to_id: both senders call validateGolfReplyTarget (src/lib/golf/message-replies.ts:16) first, which requires
--     the target in the same conversation, read with the sender's own session. Production holds 0 replies.
--   The service role back-dates the demo team's messages (scripts/seed-demo-team-ops.ts:755,
--   scripts/refresh-golf-demo-realism.ts:262). It is not a client session and passes.
--
-- The fix: golf_messages_insert_guard(), BEFORE INSERT, for authenticated and anon sessions only (keyed on current_user,
-- like the 20261107090x00 guards, so the service role, the table owner and SECURITY DEFINER code pass):
--   1. created_at := now(). Overridden, not refused. For the app this is exactly the default it already gets. A refusal
--      window was the alternative and is worse on both counts: it can fail a real send when a client's clock is wrong
--      (none sends a date today, but a guard that can only cost messages is the wrong shape), and it still lets a sender
--      place a message minutes ahead, again and again. Correcting NEW without an error is what
--      golf_messages_notify_anyway_guard already does on this table.
--   2. kind = 'system' raises 42501. The other kinds are untouched ('poll' has its own shape trigger).
--   3. A reply_to_id whose message is not in NEW.conversation_id raises 42501. The lookup runs as the sender, under RLS:
--      a sender who may insert into the conversation can read every message in it, so a real reply always finds its
--      target, deleted or not; a target in another conversation (visible to the sender or not) or one that does not exist
--      is refused. The missing-target case used to fail on the foreign key (23503); the send fails either way, and
--      message-attachments.ts:45 already treats 23xxx and 42501 alike.
--   No WHEN clause: the date rule has to see every client insert, NULL included.
--
-- Left out on purpose (report):
--   * golf_conversations.updated_at stays client-writable. Every writer sends the server action's clock; a clamp is a
--     second trigger on the busiest messaging table for a nuisance, not a leak (the list orders by the last message).
--   * pinned_at, pinned_by, edited_at, is_deleted and read are still the caller's choice on INSERT. Nothing reads the pin
--     columns yet; decide them with the pins work.
--   * kinds 'practice', 'event', 'rsvp', 'travel': no writer exists at either version; the redesign owns that decision.
--
-- ORDER: independent of every other file; no app deploy before or after. Sits naturally after 20261107090100.
--
-- VERIFY: select 1 from pg_trigger where tgrelid = 'public.golf_messages'::regclass and tgname = 'golf_messages_insert_guard' and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 4) = 4 and (tgtype & 16) = 0 and tgenabled = 'O';
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_messages_insert_guard()'::regprocedure and not prosecdef and proconfig = array['search_path=""'] and not has_function_privilege('anon', oid, 'EXECUTE');
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_messages_insert_guard()'::regprocedure and position('current_user' in prosrc) > 0 and position('reply_to_id' in prosrc) > 0 and position('system' in prosrc) > 0 and position('created_at' in prosrc) > 0;
--
-- ROLLBACK: (one transaction; re-opens the holes, use only to restore a broken sender while a fix is prepared):
--   drop trigger if exists golf_messages_insert_guard on public.golf_messages;
--   drop function if exists public.golf_messages_insert_guard();
-- pgTAP: supabase/tests/rls/golf_messages_insert_guard.sql

SET lock_timeout = '3s';

DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.golf_messages') IS NULL THEN
    RAISE EXCEPTION 'public.golf_messages is missing';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['id', 'conversation_id', 'sender_id',
      'created_at', 'kind', 'reply_to_id'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'golf_messages'
        AND column_name = v_col
    ) THEN
      RAISE EXCEPTION 'golf_messages.% is missing', v_col;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.golf_messages_insert_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Client sessions only. service_role, the table owner and definer functions pass
  -- (the demo seed back-dates messages; a server may one day post a system notice).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- 1. The date is the server's: the same value the column default gives every send.
  NEW.created_at := now();

  -- 2. A system notice is not a client's to send.
  IF NEW.kind = 'system' THEN
    RAISE EXCEPTION 'A system message cannot be sent from a client session'
      USING ERRCODE = '42501';
  END IF;

  -- 3. A reply quotes a message in its own conversation. Read as the sender (RLS
  --    applies): a member sees every message of the conversation they are sending in.
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.golf_messages AS r
    WHERE r.id = NEW.reply_to_id
      AND r.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'A reply must quote a message in the same conversation'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.golf_messages_insert_guard() FROM public, anon;

DROP TRIGGER IF EXISTS golf_messages_insert_guard ON public.golf_messages;
CREATE TRIGGER golf_messages_insert_guard
BEFORE INSERT ON public.golf_messages
FOR EACH ROW
EXECUTE FUNCTION public.golf_messages_insert_guard();
