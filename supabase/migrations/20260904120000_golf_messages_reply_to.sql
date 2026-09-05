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
--   - `golf_messages.reply_to_id` is assigned to THIS migration because the
--     ledger name ("golf_messages_reply_to") names that exact column.
--   - `golf_message_mentions` (the table) is ALSO assigned here rather than
--     to 20260904160000_golf_messaging_structured.sql, on the reasoning that
--     an @mention is most often attached to a reply ("replying to X and
--     looping in Y"), so bundling reply-threading with mention-tracking in
--     one change is a plausible single unit of work. This is a guess, not a
--     verified fact — the live catalog cannot say which of these three
--     migrations actually created golf_message_mentions.
--
-- WHAT WAS AND WAS NOT OBSERVABLE (golf_message_mentions):
--   - Columns/types/nullability/defaults/PK/FKs below are the live catalog
--     contents (`list_tables`, verbose, project qmnssrrolpinvwjjnufo, read
--     2026-09-05). RLS is confirmed ENABLED live.
--   - RLS POLICIES were not observable through the read-only catalog call
--     used here. Verify directly against production
--     (`select * from pg_policies where tablename = 'golf_message_mentions';`)
--     before relying on this table's access control locally. No policies are
--     added by this file.
--   - INDEXES beyond the primary key were not enumerated by `list_tables`.
--     Supabase's performance advisor did not separately flag an unindexed FK
--     here (unlike golf_message_reactions/golf_message_responses), but that
--     is not proof one exists — it was simply not in the sampled top-N list
--     this audit pulled. Check `pg_indexes` directly if this matters.
--
-- WHAT WAS AND WAS NOT OBSERVABLE (golf_messages.reply_to_id):
--   - The column (uuid, nullable, no stored default) AND its foreign key —
--     `golf_messages_reply_to_id_fkey`, self-referential, `reply_to_id ->
--     golf_messages(id)` — are both confirmed live via `list_tables`'
--     `foreign_key_constraints` for `public.golf_messages` (verbose read,
--     project qmnssrrolpinvwjjnufo, 2026-09-05). Reconstructed exactly below.
--
-- THIS FILE MUST NOT BE APPLIED TO PRODUCTION. Every object below already
-- exists there; it exists for a local `supabase db reset` and the ledger.

ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.golf_messages (id);

COMMENT ON COLUMN public.golf_messages.reply_to_id IS
'Message this one replies to, if any (self-referential FK). Reconstructed '
'from the live production catalog 2026-09-05 — see this file''s header.';

CREATE TABLE IF NOT EXISTS public.golf_message_mentions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.golf_messages (id),
    mentioned_user_id uuid REFERENCES auth.users (id),
    mention_type text NOT NULL CHECK (
        mention_type = any(ARRAY['user'::text, 'team'::text, 'all'::text])
    ),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golf_message_mentions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.golf_message_mentions IS
'@mentions attached to a golf_messages row (user/team/all). Reconstructed '
'from the live production catalog 2026-09-05 — see this file''s header. RLS '
'policies not yet reconstructed; verify against production before relying '
'on them locally.';
