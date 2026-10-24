-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Apply: npm run db:apply --
-- supabase/migrations/20261025020000_golf_message_responses_update_scope.sql
-- Risk: LOW. Replaces one policy with a stricter one; no data changes.
--
-- Why: golf_message_responses_update on production checks only
-- user_id = auth.uid(). An UPDATE can therefore move a person's own vote row
-- onto a message_id in a conversation they are not in, and someone who has
-- left a group can still change their old vote. Poll votes (Clubhouse P-2,
-- PR #2362) only ever upsert on (message_id, user_id), so requiring
-- membership on both sides of the UPDATE, as golf_message_responses_insert
-- already does, changes nothing the app does. Review of PR #2362, should-fix 1.
-- Order: after 20261024090000 or on its own; each creates the policy only if
-- it is missing, and this file first drops a policy that lacks the
-- membership check.
--
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_message_responses' AND policyname = 'golf_message_responses_update' AND with_check LIKE '%golf_conversation_has_me%' AND qual LIKE '%golf_conversation_has_me%';
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_message_responses' HAVING count(*) = 4;
-- ROLLBACK: DROP POLICY golf_message_responses_update ON public.golf_message_responses; then CREATE POLICY golf_message_responses_update ON public.golf_message_responses FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

SET lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_message_responses'
      AND policyname = 'golf_message_responses_update'
      AND (coalesce(with_check, '') NOT LIKE '%golf_conversation_has_me%'
        OR coalesce(qual, '') NOT LIKE '%golf_conversation_has_me%')
  ) THEN
    DROP POLICY golf_message_responses_update ON public.golf_message_responses;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_message_responses'
      AND policyname = 'golf_message_responses_update'
  ) THEN
    CREATE POLICY golf_message_responses_update
      ON public.golf_message_responses
      FOR UPDATE TO authenticated
      USING (
        user_id = (SELECT auth.uid()) AND EXISTS (
          SELECT 1 FROM public.golf_messages m
          WHERE m.id = golf_message_responses.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
        )
      )
      WITH CHECK (
        user_id = (SELECT auth.uid()) AND EXISTS (
          SELECT 1 FROM public.golf_messages m
          WHERE m.id = golf_message_responses.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
        )
      );
  END IF;
END;
$$;
