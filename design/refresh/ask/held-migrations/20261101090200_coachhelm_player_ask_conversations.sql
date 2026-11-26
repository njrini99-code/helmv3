-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- HM3 (Ask lane, AK10a). Written 4 Nov 2026 in the wiring pass from 02-PLAN §13.1 and §16, which named this file but
-- never wrote it. Name kept as planned (20261101090200).
--
-- What: a player's own Ask history.
--   1. golf_coachhelm_chat_conversations.coach_id loses NOT NULL; new player_id uuid NULL (golf_players, cascade).
--   2. CHECK exactly one owner: (coach_id IS NULL) <> (player_id IS NULL). Every row today has coach_id set and no
--      player_id, so every row stays valid.
--   3. player policies, one per command, beside the untouched coach policies chat_conversations_coach_only and
--      chat_messages_coach_only (baseline 20260527000000:18520, :18524; both FOR ALL on coach_id = current_coach_id(),
--      which a NULL coach_id never matches, so a coach can never read a player's chat and a player never a coach's).
--   4. an index for the player's history list.
-- Not touched: golf_coachhelm_llm_calls (coach_id and player_id are both nullable today), the turn unique index
-- (20260725180000), grants (20260725210000: anon revoked; authenticated SELECT, INSERT, UPDATE, DELETE).
-- The one non-additive step is dropping NOT NULL on coach_id; the one-owner CHECK replaces it, so no row can be
-- ownerless. Idempotent.
-- Until applied: player Ask (coachhelm_player_ask_v1, off) runs without saved history: each visit is a new chat held in
-- the client only, the history button is absent, and a player chat= link opens a new chat.
--
-- ROLLBACK: delete from public.golf_coachhelm_chat_conversations where player_id is not null;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_messages_player_select on public.golf_coachhelm_chat_messages;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_messages_player_insert on public.golf_coachhelm_chat_messages;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_messages_player_update on public.golf_coachhelm_chat_messages;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_messages_player_delete on public.golf_coachhelm_chat_messages;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_conversations_player_select on public.golf_coachhelm_chat_conversations;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_conversations_player_insert on public.golf_coachhelm_chat_conversations;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_conversations_player_update on public.golf_coachhelm_chat_conversations;
-- ROLLBACK: drop policy if exists golf_coachhelm_chat_conversations_player_delete on public.golf_coachhelm_chat_conversations;
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations drop constraint if exists golf_coachhelm_chat_conversations_one_owner;
-- ROLLBACK: drop index if exists public.golf_coachhelm_chat_conversations_player_idx;
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations drop column if exists player_id;
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations alter column coach_id set not null;
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'golf_coachhelm_chat_conversations' AND column_name = 'player_id');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'golf_coachhelm_chat_conversations' AND column_name = 'coach_id' AND is_nullable = 'YES');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'golf_coachhelm_chat_conversations_one_owner');
-- VERIFY: SELECT 1 WHERE (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_chat_conversations' AND policyname LIKE '%_player_%') = 4;
-- VERIFY: SELECT 1 WHERE (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_chat_messages' AND policyname LIKE '%_player_%') = 4;
-- VERIFY: SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM public.golf_coachhelm_chat_conversations WHERE (coach_id IS NULL) = (player_id IS NULL));
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_coachhelm_chat_conversations', 'SELECT');

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.golf_coachhelm_chat_conversations
  ADD COLUMN IF NOT EXISTS player_id uuid NULL REFERENCES public.golf_players(id) ON DELETE CASCADE;

ALTER TABLE public.golf_coachhelm_chat_conversations ALTER COLUMN coach_id DROP NOT NULL;

DO $hm3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_chat_conversations'::regclass
      AND conname = 'golf_coachhelm_chat_conversations_one_owner'
  ) THEN
    ALTER TABLE public.golf_coachhelm_chat_conversations ADD CONSTRAINT golf_coachhelm_chat_conversations_one_owner
      CHECK ((coach_id IS NULL) <> (player_id IS NULL));
  END IF;
END
$hm3$;

CREATE INDEX IF NOT EXISTS golf_coachhelm_chat_conversations_player_idx
  ON public.golf_coachhelm_chat_conversations (player_id, updated_at DESC)
  WHERE player_id IS NOT NULL;

-- Conversations: the signed-in player's own rows only.
DROP POLICY IF EXISTS golf_coachhelm_chat_conversations_player_select ON public.golf_coachhelm_chat_conversations;
CREATE POLICY golf_coachhelm_chat_conversations_player_select ON public.golf_coachhelm_chat_conversations
  FOR SELECT TO authenticated
  USING (coach_id IS NULL AND player_id = public.current_player_id());

DROP POLICY IF EXISTS golf_coachhelm_chat_conversations_player_insert ON public.golf_coachhelm_chat_conversations;
CREATE POLICY golf_coachhelm_chat_conversations_player_insert ON public.golf_coachhelm_chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (coach_id IS NULL AND player_id = public.current_player_id());

DROP POLICY IF EXISTS golf_coachhelm_chat_conversations_player_update ON public.golf_coachhelm_chat_conversations;
CREATE POLICY golf_coachhelm_chat_conversations_player_update ON public.golf_coachhelm_chat_conversations
  FOR UPDATE TO authenticated
  USING (coach_id IS NULL AND player_id = public.current_player_id())
  WITH CHECK (coach_id IS NULL AND player_id = public.current_player_id());

DROP POLICY IF EXISTS golf_coachhelm_chat_conversations_player_delete ON public.golf_coachhelm_chat_conversations;
CREATE POLICY golf_coachhelm_chat_conversations_player_delete ON public.golf_coachhelm_chat_conversations
  FOR DELETE TO authenticated
  USING (coach_id IS NULL AND player_id = public.current_player_id());

-- Messages: rows of a conversation the signed-in player owns.
DROP POLICY IF EXISTS golf_coachhelm_chat_messages_player_select ON public.golf_coachhelm_chat_messages;
CREATE POLICY golf_coachhelm_chat_messages_player_select ON public.golf_coachhelm_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.golf_coachhelm_chat_conversations c
    WHERE c.id = golf_coachhelm_chat_messages.conversation_id
      AND c.coach_id IS NULL AND c.player_id = public.current_player_id()
  ));

DROP POLICY IF EXISTS golf_coachhelm_chat_messages_player_insert ON public.golf_coachhelm_chat_messages;
CREATE POLICY golf_coachhelm_chat_messages_player_insert ON public.golf_coachhelm_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.golf_coachhelm_chat_conversations c
    WHERE c.id = golf_coachhelm_chat_messages.conversation_id
      AND c.coach_id IS NULL AND c.player_id = public.current_player_id()
  ));

DROP POLICY IF EXISTS golf_coachhelm_chat_messages_player_update ON public.golf_coachhelm_chat_messages;
CREATE POLICY golf_coachhelm_chat_messages_player_update ON public.golf_coachhelm_chat_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.golf_coachhelm_chat_conversations c
    WHERE c.id = golf_coachhelm_chat_messages.conversation_id
      AND c.coach_id IS NULL AND c.player_id = public.current_player_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.golf_coachhelm_chat_conversations c
    WHERE c.id = golf_coachhelm_chat_messages.conversation_id
      AND c.coach_id IS NULL AND c.player_id = public.current_player_id()
  ));

DROP POLICY IF EXISTS golf_coachhelm_chat_messages_player_delete ON public.golf_coachhelm_chat_messages;
CREATE POLICY golf_coachhelm_chat_messages_player_delete ON public.golf_coachhelm_chat_messages
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.golf_coachhelm_chat_conversations c
    WHERE c.id = golf_coachhelm_chat_messages.conversation_id
      AND c.coach_id IS NULL AND c.player_id = public.current_player_id()
  ));

COMMIT;
