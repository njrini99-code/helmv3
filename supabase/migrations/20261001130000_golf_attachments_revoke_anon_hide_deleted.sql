-- STATUS: WRITTEN — HOLD — NOT APPLIED
--
-- Swap audit F-11 (docs/clubhouse/held/data/message-attachments-hardening.md).
--
-- 1. anon holds every table privilege on golf_message_attachments. RLS limits
--    the rows today (all three policies are TO authenticated), so this is
--    defence in depth: a signed-out caller has no reason to touch the table.
-- 2. The SELECT policy shows a conversation member the attachments of a
--    message its sender deleted. The message body is hidden, its files are
--    not. The policy now also requires the message not to be deleted.
--
-- Live impact (read-only, 2026-10-01): 14 attachment rows; 2 sit on deleted
-- messages and stop being readable. INSERT and DELETE policies unchanged.
-- No data changes.
--
-- Forward-only and idempotent. Not applied by the swap-audit branch; the
-- owner applies it after review (supabase/migrations/HELD.md).
--
-- VERIFY after apply:
--   SELECT count(*) FROM information_schema.role_table_grants
--    WHERE table_schema = 'public'
--      AND table_name = 'golf_message_attachments'
--      AND grantee = 'anon';                                   -- 0
--   SELECT qual FROM pg_policies
--    WHERE tablename = 'golf_message_attachments'
--      AND cmd = 'SELECT';            -- contains: is_deleted IS NOT TRUE

BEGIN;

REVOKE ALL ON public.golf_message_attachments FROM anon;

DROP POLICY IF EXISTS "Users can view attachments in their conversations"
ON public.golf_message_attachments;

CREATE POLICY "Users can view attachments in their conversations"
ON public.golf_message_attachments
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_messages AS m
        INNER JOIN public.golf_conversation_participants AS cp
            ON m.conversation_id = cp.conversation_id
        WHERE
            m.id = golf_message_attachments.message_id
            AND cp.user_id = (SELECT auth.uid())
            AND m.is_deleted IS NOT TRUE
    )
);

COMMIT;
