-- RECONCILIATION FILE — reconstructed from the live production catalog, NOT
-- authored ahead of the change it describes. See
-- 20260904103000_golf_message_reactions.sql's header for the full context of
-- the 2026-09-04 undocumented golf-messaging change this file is one third of
-- (reactions / reply-to / structured), including the "TABLE-TO-LEDGER-ROW
-- MAPPING IS THIS FILE'S OWN INFERENCE" disclosure, which applies here too.
-- Version stamp copied exactly from the production ledger (`list_migrations`,
-- confirmed before writing this file).
--
-- THIS FILE'S OWN INFERENCE FOR THIS ROW SPECIFICALLY:
--   - `golf_messages.kind` / `.payload` / `.pinned_at` / `.pinned_by` are
--     assigned to THIS migration because "structured" directly names what
--     `kind` (a closed set of message shapes: text/system/practice/event/
--     rsvp/poll/travel) + `payload` (jsonb) together are — a structured
--     message type, as opposed to plain text.
--   - `golf_message_responses` (the table) is assigned here rather than to
--     20260904120000_golf_messages_reply_to.sql, on the reasoning that a
--     `choice` column is the concrete data a `kind = 'poll'` or `kind =
--     'rsvp'` message collects — the two ship together in spirit even if
--     they may not have shipped in the same literal transaction. This is a
--     guess, not a verified fact — the live catalog cannot say which of the
--     three migrations actually created golf_message_responses.
--
-- WHAT WAS AND WAS NOT OBSERVABLE (golf_messages.kind/.payload/.pinned_at/.pinned_by):
--   - All four columns, `kind`'s CHECK constraint and default, and the
--     `golf_messages_pinned_by_fkey` (`pinned_by -> auth.users(id)`) are
--     confirmed live via `list_tables`' `foreign_key_constraints` for
--     `public.golf_messages` (verbose read, project qmnssrrolpinvwjjnufo,
--     2026-09-05). Reconstructed exactly below.
--
-- WHAT WAS AND WAS NOT OBSERVABLE (golf_message_responses):
--   - Columns/types/nullability/defaults/PK/FKs below are the live catalog
--     contents (same read). RLS is confirmed ENABLED live.
--   - RLS POLICIES were not observable through the read-only catalog call
--     used here. Verify directly against production
--     (`select * from pg_policies where tablename = 'golf_message_responses';`)
--     before relying on this table's access control locally. No policies are
--     added by this file.
--   - INDEXES beyond the primary key were not enumerated by `list_tables`.
--     Supabase's performance advisor separately flagged
--     `golf_message_responses_user_id_fkey` as an UNINDEXED foreign key
--     (Supabase audit §2.1) — worth an index
--     (`CREATE INDEX ON golf_message_responses (user_id);`) in a real
--     follow-up migration, not silently added here since this file's job is
--     to record what is live, not to change it.
--
-- THIS FILE MUST NOT BE APPLIED TO PRODUCTION. Every object below already
-- exists there; it exists for a local `supabase db reset` and the ledger.

ALTER TABLE public.golf_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text'::text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES auth.users (id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_messages'::regclass
      AND conname = 'golf_messages_kind_check'
  ) THEN
    ALTER TABLE public.golf_messages
      ADD CONSTRAINT golf_messages_kind_check
      CHECK (kind = ANY (ARRAY['text'::text, 'system'::text, 'practice'::text, 'event'::text, 'rsvp'::text, 'poll'::text, 'travel'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_messages.kind IS
'Structured message shape (text/system/practice/event/rsvp/poll/travel). '
'Reconstructed from the live production catalog 2026-09-05 — see this '
'file''s header.';
COMMENT ON COLUMN public.golf_messages.payload IS
'Structured data for non-text kinds (poll options, rsvp state, travel '
'details, etc). Reconstructed from the live production catalog 2026-09-05.';

CREATE TABLE IF NOT EXISTS public.golf_message_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.golf_messages (id),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  choice text NOT NULL CHECK (char_length(choice) >= 1 AND char_length(choice) <= 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golf_message_responses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.golf_message_responses IS
'A user''s response/choice to a structured (poll/rsvp) golf_messages row. '
'Reconstructed from the live production catalog 2026-09-05 — see this '
'file''s header. RLS policies not yet reconstructed; verify against '
'production before relying on them locally.';
