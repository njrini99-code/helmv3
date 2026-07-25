-- ===========================================================================
-- Fix: the idempotent user-turn upsert never worked
-- ===========================================================================
-- `golf_coachhelm_chat_messages_conv_turn_uniq` was created PARTIAL:
--
--   ... (conversation_id, role, client_turn_id) WHERE client_turn_id IS NOT NULL
--
-- PostgREST's `on_conflict=` can only name columns; it cannot carry the index
-- predicate. So `ON CONFLICT (conversation_id, role, client_turn_id)` found no
-- matching arbiter and Postgres raised
--
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- on EVERY send that carried a client_turn_id — which is every send the client
-- makes. The chat's idempotency has therefore never been in effect in
-- production, and the throw surfaced as a 500 on the send endpoint.
--
-- Dropping the predicate is safe, and is what the constraint was always meant
-- to be: Postgres treats NULLs as DISTINCT in a unique index, so rows with a
-- null client_turn_id (legacy turns, synthetic tool-ledger rows) remain
-- unconstrained exactly as before. Only real turn ids are deduplicated.
-- ===========================================================================

DROP INDEX IF EXISTS public.golf_coachhelm_chat_messages_conv_turn_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS golf_coachhelm_chat_messages_conv_turn_uniq
  ON public.golf_coachhelm_chat_messages (conversation_id, role, client_turn_id);

COMMENT ON INDEX public.golf_coachhelm_chat_messages_conv_turn_uniq IS
  'Idempotency arbiter for the user-turn upsert. Deliberately NOT partial: PostgREST on_conflict cannot express an index predicate, and a partial index made every idempotent send fail. Null client_turn_id rows stay unconstrained because Postgres treats NULLs as distinct.';
