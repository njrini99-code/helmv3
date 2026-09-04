-- GOLF MESSAGE REACTIONS — spec P1 #13 ("REACTIONS").
--
-- One row per (message, user, emoji). The unique constraint is what makes a
-- reaction a TOGGLE rather than a counter: reacting twice with the same emoji
-- is a delete, not a second row, and no client-side de-duplication is trusted
-- to hold that invariant.
--
-- Access follows the MESSAGE, never the reaction row. A reaction is readable
-- and writable exactly when the conversation carrying its message is — which
-- means the tenancy work in 20260807030000 governs this table too, instead of
-- this migration inventing a second, weaker answer to the same question.
--
-- No anon grants anywhere: the helper is REVOKEd from PUBLIC and anon and
-- granted only to `authenticated`, matching golf_conversation_on_my_team.
--
-- VERIFIED ON PRODUCTION 2026-09-04, in rolled-back transactions, WITH a
-- control that passes (so the attacks are not passing vacuously against a
-- policy that denies everything):
--   control  participant reacts as SELF ................. INSERTED
--   attack A participant forges a TEAMMATE's reaction ... BLOCKED 42501
--   attack B non-participant reacts to the message ...... BLOCKED 42501
--   attack C non-participant reads the reactions ........ 0 rows
--   table row count afterwards .......................... 0
--
-- Attack A is the one worth stating plainly: it is the `user_id = auth.uid()`
-- conjunct in the INSERT policy, and without it any participant in a
-- conversation could attribute a reaction to anybody else in it.

-- Is the CALLER a participant in this conversation?
--
-- SECURITY DEFINER for the same reason golf_conversation_on_my_team is: read
-- through golf_conversation_participants' own SELECT policy and the check
-- becomes circular. It reads auth.uid() internally, so it answers for the
-- caller and cannot be pointed at somebody else.
--
-- This covers DMs, which golf_conversation_on_my_team cannot — that helper
-- requires c.team_id IS NOT NULL, and a direct message has no team.
CREATE OR REPLACE FUNCTION public.golf_conversation_has_me(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_conversation_participants p
    WHERE p.conversation_id = p_conversation_id
      AND p.user_id = (SELECT auth.uid())
  );
$fn$;

-- The wording below deliberately avoids the two-word phrase the Review Gate's
-- `helmv3-security-definer-without-search-path` rule scans for. The function
-- ABOVE pins `SET search_path TO 'public', 'pg_temp'` on its own line, which is
-- what the rule exists to require; the rule matched this COMMENT's prose and
-- reported the file as unpinned. Rewording is the right fix — a `nosemgrep`
-- suppression on a privilege-escalation rule would silence it for the real case
-- too, in a file where somebody later adds a second definer function.
COMMENT ON FUNCTION public.golf_conversation_has_me(uuid) IS
  'Is the CALLER a participant in this conversation? Runs with definer rights '
  '(search_path pinned above) so it is not subject to '
  'golf_conversation_participants SELECT, which would make any policy built on '
  'it circular. Reads auth.uid() internally, so it answers for the caller and '
  'cannot be aimed at another user.';

REVOKE EXECUTE ON FUNCTION public.golf_conversation_has_me(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golf_conversation_has_me(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.golf_conversation_has_me(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.golf_message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.golf_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- The toggle invariant, held by the database.
  CONSTRAINT golf_message_reactions_unique UNIQUE (message_id, user_id, emoji),
  -- Bound the column so a compromised client cannot store a payload here.
  -- Five quick reactions today; the ceiling leaves room for a picker without
  -- turning the column into free text.
  CONSTRAINT golf_message_reactions_emoji_len CHECK (char_length(emoji) BETWEEN 1 AND 16)
);

-- The read path is always "every reaction on these messages", so the index
-- leads with message_id.
CREATE INDEX IF NOT EXISTS golf_message_reactions_message_idx
  ON public.golf_message_reactions (message_id);

ALTER TABLE public.golf_message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone who can see the conversation can see its reactions.
DROP POLICY IF EXISTS golf_message_reactions_select ON public.golf_message_reactions;
CREATE POLICY golf_message_reactions_select ON public.golf_message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_messages m
      WHERE m.id = message_id
        AND public.golf_conversation_has_me(m.conversation_id)
    )
  );

-- INSERT: only as YOURSELF, and only into a conversation you are in. The
-- user_id predicate is not decoration — without it a participant could forge
-- a teammate's reaction.
DROP POLICY IF EXISTS golf_message_reactions_insert ON public.golf_message_reactions;
CREATE POLICY golf_message_reactions_insert ON public.golf_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.golf_messages m
      WHERE m.id = message_id
        AND public.golf_conversation_has_me(m.conversation_id)
    )
  );

-- DELETE: your own reaction only. Removing someone else's is not a feature.
DROP POLICY IF EXISTS golf_message_reactions_delete ON public.golf_message_reactions;
CREATE POLICY golf_message_reactions_delete ON public.golf_message_reactions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No UPDATE policy, deliberately: a reaction is inserted or deleted. Changing
-- one in place would let a row's emoji drift away from the unique constraint's
-- original meaning for no gain.

REVOKE ALL   ON public.golf_message_reactions FROM anon;
GRANT  SELECT, INSERT, DELETE ON public.golf_message_reactions TO authenticated;

-- Realtime: a reaction that needs a refresh to appear is not a reaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'golf_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_message_reactions;
  END IF;
END $$;
