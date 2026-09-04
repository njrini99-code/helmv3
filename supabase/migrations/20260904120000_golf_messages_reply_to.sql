-- REPLY / QUOTE — spec §30.
--
-- A self-reference on golf_messages. Deliberately NOT a separate table: a
-- reply IS a message, and modelling the link as a column keeps every existing
-- read, RLS policy, realtime subscription and pagination path working
-- unchanged. A join table would have needed its own policies duplicating the
-- ones golf_messages already has.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a message that somebody replied TO
-- must not delete their reply — the reply is their words, not the quoted
-- author's, and cascading here would let anyone erase other people's messages
-- by deleting their own. The quote degrades to "Original message deleted";
-- the reply survives.
--
-- No RLS change is needed or wanted. Access is already governed by the row's
-- conversation, and `reply_to_id` is only ever rendered by first fetching the
-- referenced message through that same policy — so a reply pointing at a
-- message in another conversation resolves to nothing rather than leaking it.
-- The application never trusts the pointer to grant a read.

ALTER TABLE public.golf_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid
  REFERENCES public.golf_messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.golf_messages.reply_to_id IS
  'The message this one replies to (spec §30). Self-reference, ON DELETE SET '
  'NULL so deleting a quoted message never deletes the replies to it. Confers '
  'NO read access: the quoted row is fetched through golf_messages RLS like '
  'any other, so a pointer into another conversation resolves to nothing.';

-- Partial: only replies carry the column, and the read is always
-- "the replies to this message".
CREATE INDEX IF NOT EXISTS golf_messages_reply_to_idx
  ON public.golf_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;
