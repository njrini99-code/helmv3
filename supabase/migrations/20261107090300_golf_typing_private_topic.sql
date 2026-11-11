-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- PRIORITY: privacy fix, ships ahead of the Messages redesign.
-- Apply:
--   npm run db:apply -- \
--     supabase/migrations/20261107090300_golf_typing_private_topic.sql
-- Risk: LOW. Additive: one helper function and two policies on
-- realtime.messages for a NEW topic family, golf-typing:<conversation uuid>.
-- Nothing existing changes shape. The old public topic keeps working until
-- the clients move.
--
-- The hole (2026-11-07): typing runs on the PUBLIC broadcast topic
-- `golf-conversation:<conversation id>`
-- (src/hooks/golf/use-golf-messages.ts:965, :1100-1115;
-- use-typing-by-conversation.ts). A public channel needs no authorization,
-- so anyone holding the anon key and a conversation UUID can listen to who
-- is typing, and anyone can send `{userId, isTyping}` as someone else. The
-- topic also carries postgres_changes for older Fairway clients, which is
-- why the new private topic has its own name.
--
-- The fix: realtime.messages policies for `golf-typing:<uuid>`. Receive
-- (SELECT) and send (INSERT) both require membership in that conversation
-- (golf_conversation_has_me). Same shape as golf_live_receive /
-- golf_pins_receive.
--
-- APP CHANGE NEEDED (ships with, or after, this migration; the old topic
-- keeps working in the meantime):
--   * src/hooks/golf/use-golf-messages.ts (:965 subscribe, :1033-1062
--     receive, :1100-1115 send) and
--     src/clubhouse/screens/messages/use-typing-by-conversation.ts:
--     subscribe with
--       supabase.channel(`golf-typing:${conversationId}`,
--         { config: { private: true } })
--     after `await supabase.realtime.setAuth()` (as
--     use-conversation-pins.ts:153 does), send/receive event `typing`.
--   * Keep the old public topic until Fairway and Clubhouse both ship the
--     switch. Realtime cannot turn that topic private: public channels
--     bypass authorization, so the spoofing/snooping on
--     `golf-conversation:*` ends only when the last client stops using it
--     (then consider disabling "allow public access" for the project's
--     Realtime).
--   * Known remaining gap: inside a private topic a member can still send
--     another member's `userId` in the payload (the policy sees the topic,
--     not the payload). The client should show typing for the sender it can
--     see only as "someone in this chat is typing" or accept that spoof
--     within a conversation the attacker is already in.
--
-- PRECONDITION (as 20261025050100 / 20261031150000): before production,
-- join `golf-typing:<id>` from a second client WITHOUT config.private and
-- confirm nothing arrives; then join privately as a non-member and confirm
-- it is refused.
-- Realtime policies are not part of supabase/schemas (golf_live_receive is
-- not mirrored there either); only the helper is.
--
-- ORDER: any time; independent of M1-M3.
--
-- VERIFY: select 1 where
-- VERIFY:   to_regprocedure('public.golf_typing_topic_allowed(text)')
-- VERIFY:   is not null
-- VERIFY:   and has_function_privilege(
-- VERIFY:     'authenticated', 'public.golf_typing_topic_allowed(text)',
-- VERIFY:     'execute')
-- VERIFY:   and not has_function_privilege(
-- VERIFY:     'anon', 'public.golf_typing_topic_allowed(text)', 'execute');
-- VERIFY: select 1 where (
-- VERIFY:   select count(*) from pg_policies
-- VERIFY:   where schemaname = 'realtime' and tablename = 'messages'
-- VERIFY:   and policyname in ('golf_typing_receive', 'golf_typing_send')
-- VERIFY: ) = 2;
-- VERIFY: select 1 where public.golf_typing_topic_allowed(null) = false
-- VERIFY:   and public.golf_typing_topic_allowed('golf-typing:not-a-uuid')
-- VERIFY:   = false;
--
-- ROLLBACK: (one transaction; typing then has no private topic, the clients
--   fall back to the public one):
--   drop policy if exists golf_typing_send on realtime.messages;
--   drop policy if exists golf_typing_receive on realtime.messages;
--   drop function if exists public.golf_typing_topic_allowed(text);
-- pgTAP: supabase/tests/rls/golf_typing_private_topic.sql

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('public.golf_conversation_has_me(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.golf_conversation_has_me(uuid) is missing';
  END IF;
  IF to_regprocedure('realtime.topic()') IS NULL THEN
    RAISE EXCEPTION 'realtime.topic() is missing';
  END IF;
END $$;

-- DEFINER because the membership read goes through
-- golf_conversation_participants, and a policy on realtime.messages must not
-- depend on the caller's RLS there. Pair every definer with the revoke
-- (anon_surface_guard.sql).
CREATE OR REPLACE FUNCTION public.golf_typing_topic_allowed(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m text[];
BEGIN
  IF p_topic IS NULL THEN
    RETURN false;
  END IF;
  m := regexp_match(p_topic,
    '^golf-typing:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$');
  IF m IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.golf_conversation_has_me(m[1]::uuid);
END $$;

REVOKE ALL ON FUNCTION public.golf_typing_topic_allowed(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_typing_topic_allowed(text)
TO authenticated, service_role;

DROP POLICY IF EXISTS golf_typing_receive ON realtime.messages;
CREATE POLICY golf_typing_receive ON realtime.messages
FOR SELECT TO authenticated
USING (
    realtime.messages.extension = 'broadcast'
    AND public.golf_typing_topic_allowed((SELECT realtime.topic()))
);

DROP POLICY IF EXISTS golf_typing_send ON realtime.messages;
CREATE POLICY golf_typing_send ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND public.golf_typing_topic_allowed((SELECT realtime.topic()))
);
