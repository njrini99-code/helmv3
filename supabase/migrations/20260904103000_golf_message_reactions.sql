-- RECONCILIATION FILE — reconstructed from the live production catalog, NOT
-- authored ahead of the change it describes.
--
-- On 2026-09-04 a golf-messaging feature (emoji reactions, @mentions, poll/
-- rsvp-style structured replies) was applied directly to production outside
-- this repo. It left three ledger rows with no corresponding migration file:
--
--     20260904103000  golf_message_reactions      <- THIS FILE
--     20260904120000  golf_messages_reply_to
--     20260904160000  golf_messaging_structured
--
-- and three live tables absent from src/lib/types/database.ts:
-- golf_message_mentions, golf_message_reactions, golf_message_responses
-- (Supabase audit §executive-summary finding 1, §3). This file's version
-- stamp is copied EXACTLY from the ledger row above (confirmed via
-- `list_migrations` before writing this file) so the file list and the
-- production ledger agree.
--
-- TABLE-TO-LEDGER-ROW MAPPING IS THIS FILE'S OWN INFERENCE, NOT A VERIFIED
-- FACT. The read-only catalog (`list_tables`) shows the END STATE of the
-- schema, not which CREATE TABLE statement ran inside which of the three
-- migration transactions. golf_message_reactions is assigned to THIS row
-- because the ledger name is a literal, exact match for the table name —
-- the other two rows' names ("_reply_to", "_structured") don't name a table
-- this cleanly, and are reconstructed in the other two files with the same
-- disclosure. If a more precise attribution is ever needed, it is not
-- recoverable from the catalog alone.
--
-- WHAT WAS AND WAS NOT OBSERVABLE:
--   - Columns, types, nullability, defaults, PK, and the FK constraints below
--     ARE the live catalog contents (`list_tables`, verbose, project
--     qmnssrrolpinvwjjnufo, read 2026-09-05). RLS is confirmed ENABLED on the
--     live table.
--   - RLS POLICIES were NOT observable through the read-only catalog call
--     used here (`list_tables`/`get_advisors` return no `pg_policies` detail,
--     and `execute_sql` was not used). Before trusting this table for local
--     development that exercises RLS, verify directly against production
--     (e.g. `select * from pg_policies where schemaname = 'public' and
--     tablename = 'golf_message_reactions';` via the Supabase SQL editor or a
--     read-only psql session) and add the real policies to a follow-up
--     migration. This file adds none — a table with RLS enabled and no
--     policy denies all non-service-role access, which is SAFE by default
--     but is almost certainly not what the shipped feature actually reads
--     with.
--   - INDEXES beyond the primary key were likewise not enumerated by
--     `list_tables`. Supabase's performance advisor separately flagged
--     `golf_message_reactions_user_id_fkey` as an UNINDEXED foreign key
--     (Supabase audit §2.1) — worth an index
--     (`CREATE INDEX ON golf_message_reactions (user_id);`) in a real
--     follow-up migration, not silently added here since this file's job is
--     to record what is live, not to change it.
--
-- THIS FILE MUST NOT BE APPLIED TO PRODUCTION. Every object below already
-- exists there. Its purpose is (a) a local `supabase db reset` producing a
-- schema that matches production, and (b) closing the gap between the
-- migrations directory and `supabase_migrations.schema_migrations` — running
-- it against production would be a no-op at best (IF NOT EXISTS throughout)
-- and is not something this audit's read-only scope permits regardless.
--
-- 2026-09-05 A3b follow-up: independently re-read against the live catalog
-- (`list_tables`/`list_migrations`, fresh session) — every column, default,
-- CHECK, and FK below still matches production exactly, and the ledger row
-- above still exists under this exact name/version. No content changed.

CREATE TABLE IF NOT EXISTS public.golf_message_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.golf_messages (id),
    user_id uuid NOT NULL REFERENCES auth.users (id),
    emoji text NOT NULL CHECK (
        char_length(emoji) >= 1 AND char_length(emoji) <= 16
    ),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golf_message_reactions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.golf_message_reactions IS
'Emoji reactions on a golf_messages row. Reconstructed from the live '
'production catalog 2026-09-05 — see this file''s header. RLS policies not '
'yet reconstructed; verify against production before relying on them locally.';
