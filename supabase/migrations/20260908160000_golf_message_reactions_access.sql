-- Reconcile the reaction access contract observed in production on 2026-09-08.
-- The reconstructed 20260904103000 table omitted its helper, policies,
-- indexes, and realtime publication. Fresh databases must support the same
-- authenticated reaction behavior as production. Existing policies are kept.
-- supabase/schemas already declares this helper, its grants, policies and
-- indexes; this repairs the migration replay, not the desired schema.
-- VERIFIED: SELECT * FROM pg_policies WHERE tablename = 'golf_message_reactions';
-- SELECT * FROM pg_publication_tables WHERE tablename = 'golf_message_reactions';
-- ROLLBACK: local verification wraps this twice in a transaction and rolls it
-- back. Do not remove the already-live production access contract to undo a
-- reconciliation; the app can roll back independently without dropping data.

CREATE OR REPLACE FUNCTION public.golf_conversation_has_me(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.golf_conversation_participants p
    WHERE p.conversation_id = p_conversation_id
      AND p.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.golf_conversation_has_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_conversation_has_me(uuid) TO authenticated, service_role;

ALTER TABLE public.golf_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golf_message_reactions FROM anon;
GRANT SELECT, INSERT, DELETE ON public.golf_message_reactions TO authenticated;
GRANT ALL ON public.golf_message_reactions TO service_role;

-- Both indexes already exist in production; replay creates them on a fresh
-- table. Supabase wraps migrations in a transaction, precluding CONCURRENTLY.
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX IF NOT EXISTS golf_message_reactions_unique
  ON public.golf_message_reactions (message_id, user_id, emoji);
-- Existing production index; fresh-database replay only (same reason above).
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_message_reactions_message_idx
  ON public.golf_message_reactions (message_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.golf_message_reactions'::regclass
    AND conname = 'golf_message_reactions_unique') THEN
    ALTER TABLE public.golf_message_reactions ADD CONSTRAINT golf_message_reactions_unique
      UNIQUE USING INDEX golf_message_reactions_unique;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_reactions' AND policyname = 'golf_message_reactions_select') THEN
    CREATE POLICY golf_message_reactions_select ON public.golf_message_reactions
      FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.golf_messages m
          WHERE m.id = golf_message_reactions.message_id
            AND public.golf_conversation_has_me(m.conversation_id))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_reactions' AND policyname = 'golf_message_reactions_insert') THEN
    CREATE POLICY golf_message_reactions_insert ON public.golf_message_reactions
      FOR INSERT TO authenticated WITH CHECK (
        user_id = (SELECT auth.uid()) AND EXISTS (
          SELECT 1 FROM public.golf_messages m
          WHERE m.id = golf_message_reactions.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_message_reactions' AND policyname = 'golf_message_reactions_delete') THEN
    CREATE POLICY golf_message_reactions_delete ON public.golf_message_reactions
      FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public' AND tablename = 'golf_message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_message_reactions;
  END IF;
END;
$$;

COMMENT ON TABLE public.golf_message_reactions IS
  'Message reactions visible to conversation participants; each user manages their own reactions.';
