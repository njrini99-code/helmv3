-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Apply: npm run db:apply --
-- supabase/migrations/20261024090000_golf_message_responses_access.sql
-- Risk: LOW. On production every statement below is a no-op: each object it
-- creates already exists there (catalog read 2026-10-24) and each block is
-- guarded on its own name.
--
-- Why: Clubhouse polls (PR #2362, handoff 4.34.2) write a vote as the voter's
-- own golf_message_responses row (an upsert on message_id + user_id) and read
-- the thread's votes live. The reconstructed 20260904160000 created the table
-- with RLS on but none of the access contract production has, so on a fresh
-- database (local stack, a branch, CI) every vote failed:
--   - no policies, so RLS refused every read and write (42501);
--   - no UNIQUE (message_id, user_id), so the upsert's ON CONFLICT had no
--     arbiter (42P10);
--   - not in the supabase_realtime publication, so no live tally;
--   - foreign keys without ON DELETE CASCADE, so deleting a message or a user
--     with votes failed where production removes the votes.
-- This is the same repair 20260908160000 made for golf_message_reactions.
-- supabase/schemas already declares all of it (golf/20_constraints.sql:250,
-- policies/golf.sql:775-786, golf/95_grants.sql:351); this repairs the
-- migration replay, not the desired schema.
--
-- Production, read 2026-10-24 (catalog only): constraints
-- golf_message_responses_unique UNIQUE (message_id, user_id),
-- golf_message_responses_message_id_fkey and _user_id_fkey ON DELETE CASCADE;
-- policies golf_message_responses_select / _insert / _update / _delete, all
-- for authenticated, bodies as below except _update, whose production body
-- checks only user_id; in supabase_realtime; anon holds no grant. This file
-- creates _update with the same membership check as _insert (a fresh database
-- gets the stricter body); held 20261025020000 brings that body to
-- production, where this file leaves the existing policy alone.
--
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_message_responses' HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_constraint WHERE conname = 'golf_message_responses_unique';
-- VERIFY: SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'golf_message_responses';
-- ROLLBACK: none on production, where nothing changes. Do not drop the
-- already-live access contract to undo this reconciliation; locally, reset
-- the stack.

SET lock_timeout = '3s';

ALTER TABLE public.golf_message_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golf_message_responses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_message_responses
TO authenticated;

DO $$
DECLARE
  v_fk record;
BEGIN
  -- One vote per person per message: the poll upsert's conflict target.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_message_responses'::regclass
      AND contype = 'u'
      AND conname = 'golf_message_responses_unique'
  ) THEN
    ALTER TABLE public.golf_message_responses
      ADD CONSTRAINT golf_message_responses_unique UNIQUE (message_id, user_id);
  END IF;

  -- Votes go with their message and their voter, as in production. Only a
  -- foreign key that does not already cascade is restated.
  FOR v_fk IN
    SELECT c.conname, a.attname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.golf_message_responses'::regclass
      AND c.contype = 'f'
      AND c.confdeltype <> 'c'
      AND a.attname IN ('message_id', 'user_id')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.golf_message_responses DROP CONSTRAINT %I',
      v_fk.conname
    );
    IF v_fk.attname = 'message_id' THEN
      ALTER TABLE public.golf_message_responses
        ADD CONSTRAINT golf_message_responses_message_id_fkey
        FOREIGN KEY (message_id) REFERENCES public.golf_messages (id)
        ON DELETE CASCADE;
    ELSE
      ALTER TABLE public.golf_message_responses
        ADD CONSTRAINT golf_message_responses_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users (id)
        ON DELETE CASCADE;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_responses'
    AND policyname = 'golf_message_responses_select') THEN
    CREATE POLICY golf_message_responses_select
      ON public.golf_message_responses
      FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.golf_messages m
          WHERE m.id = golf_message_responses.message_id
            AND public.golf_conversation_has_me(m.conversation_id))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_responses'
    AND policyname = 'golf_message_responses_insert') THEN
    CREATE POLICY golf_message_responses_insert
      ON public.golf_message_responses
      FOR INSERT TO authenticated WITH CHECK (
        user_id = (SELECT auth.uid()) AND EXISTS (
          SELECT 1 FROM public.golf_messages m
          WHERE m.id = golf_message_responses.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_responses'
    AND policyname = 'golf_message_responses_update') THEN
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_responses'
    AND policyname = 'golf_message_responses_delete') THEN
    CREATE POLICY golf_message_responses_delete
      ON public.golf_message_responses
      FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'golf_message_responses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_message_responses;
  END IF;
END;
$$;

