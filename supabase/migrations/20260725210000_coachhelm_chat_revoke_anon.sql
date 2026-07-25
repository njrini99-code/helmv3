-- ===========================================================================
-- CoachHelm chat — take `anon` off the conversation tables
-- ===========================================================================
-- Supabase's default privileges hand `anon` every table privilege on anything
-- created in `public`, and a GRANT is additive — only a REVOKE takes something
-- away. `golf_coachhelm_chat_conversations` and `golf_coachhelm_chat_messages`
-- were both sitting at `anon=arwdDxtm`.
--
-- Be precise about the severity: RLS is enabled on both tables and each has a
-- single policy scoped to `authenticated`, so an anonymous request selects no
-- rows today. This is lost defence-in-depth, not an open door — and it is the
-- second layer that stops a future policy written against `public` (which
-- includes anon, and one already exists on the action-runs table) from
-- becoming a read of every coach's conversations.
--
-- It matters more now than it did last week: these tables previously held
-- prose. They now hold `ui_parts` — the full typed record of every answer,
-- including the measurements, player names and action payloads behind it.
--
-- The same reasoning already applies to `golf_coachhelm_action_runs`, hardened
-- in 20260725170000. This extends it to the two tables that migration left.
--
-- Idempotent: REVOKE on an already-revoked privilege is a no-op, and the
-- GRANTs restate exactly what the application needs.
-- ===========================================================================

REVOKE ALL ON public.golf_coachhelm_chat_conversations FROM anon;
REVOKE ALL ON public.golf_coachhelm_chat_messages FROM anon;

-- TRUNCATE, REFERENCES and TRIGGER are never needed by a request-scoped
-- client. DELETE is: a coach can delete their own conversation.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.golf_coachhelm_chat_conversations FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.golf_coachhelm_chat_messages FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_coachhelm_chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_coachhelm_chat_messages TO authenticated;
