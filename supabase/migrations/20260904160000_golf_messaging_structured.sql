-- MESSAGING COMPLETION — structured Helm objects, mentions, pins, mute.
--
-- One migration because these are one feature: a message stops being only text.
-- Splitting them would create an ordering dependency between files that all
-- touch golf_messages and all ship together.
--
-- DESIGN NOTE that governs everything below: a structured message IS a message.
-- It rides golf_messages, so every existing read, RLS policy, realtime
-- subscription, pagination path, reaction, reply and search continues to work
-- on it unchanged. The alternative — a parallel table of "team objects" — would
-- have needed its own copy of every one of those, and would have put half a
-- conversation outside the conversation.

-- ── 1. What KIND of message this is ────────────────────────────────────────
-- 'text' is the default and the overwhelming majority. Everything else is a
-- real Helm object rendered as a card; `system` is an event narrated in the
-- thread ("Coach moved practice to 3:30") with no bubble and no author.
ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';

-- A CHECK, not an enum: adding a kind later is a one-line constraint swap
-- rather than an ALTER TYPE that locks the table.
ALTER TABLE public.golf_messages
DROP CONSTRAINT IF EXISTS golf_messages_kind_check;
ALTER TABLE public.golf_messages
ADD CONSTRAINT golf_messages_kind_check CHECK (
    kind IN (
        'text', 'system', 'practice', 'event', 'rsvp', 'poll', 'travel'
    )
);

-- The object itself. NULL for ordinary text, which is why this is not NOT NULL.
ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS payload jsonb;

-- A structured message must carry its object, and a text message must not
-- pretend to be one. Without this a client could post kind='rsvp' with no
-- payload and every reader would render an empty card.
ALTER TABLE public.golf_messages
DROP CONSTRAINT IF EXISTS golf_messages_payload_matches_kind;
ALTER TABLE public.golf_messages
ADD CONSTRAINT golf_messages_payload_matches_kind CHECK (
    (kind = 'text' AND payload IS NULL)
    OR (
        kind <> 'text' AND payload IS NOT NULL
    )
);

COMMENT ON COLUMN public.golf_messages.kind IS
'What this message IS. Default text. Structured kinds render as Helm objects '
'(practice/event/rsvp/poll/travel) and MUST carry a payload; system messages '
'render as centred narration with no bubble and no author.';

-- ── 2. Answers to an RSVP or a poll ────────────────────────────────────────
-- One row per person per message, and the unique constraint is what makes
-- changing your mind an UPDATE rather than a second vote. Held in the database
-- rather than trusted to the client, exactly like reactions.
CREATE TABLE IF NOT EXISTS public.golf_message_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL
    REFERENCES public.golf_messages (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- 'going'/'maybe'/'cant' for an RSVP, an option key for a poll,
    -- 'ack' for a travel acknowledgement.
    choice text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT golf_message_responses_unique UNIQUE (message_id, user_id),
    CONSTRAINT golf_message_responses_choice_len CHECK (
        char_length(choice) BETWEEN 1 AND 64
    )
);

CREATE INDEX IF NOT EXISTS golf_message_responses_message_idx
ON public.golf_message_responses (message_id);

ALTER TABLE public.golf_message_responses ENABLE ROW LEVEL SECURITY;

-- Access follows the MESSAGE, same as reactions — golf_conversation_has_me is
-- the helper 20260904103000 added for exactly this shape.
DROP POLICY IF EXISTS golf_message_responses_select
ON public.golf_message_responses;
CREATE POLICY golf_message_responses_select ON public.golf_message_responses
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.golf_messages AS m
        WHERE
            m.id = golf_message_responses.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
    )
);

-- INSERT/UPDATE pin user_id to the caller. Without it a participant could
-- answer a poll as somebody else.
DROP POLICY IF EXISTS golf_message_responses_insert
ON public.golf_message_responses;
CREATE POLICY golf_message_responses_insert ON public.golf_message_responses
FOR INSERT TO authenticated
WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.golf_messages AS m
        WHERE
            m.id = golf_message_responses.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
    )
);

DROP POLICY IF EXISTS golf_message_responses_update
ON public.golf_message_responses;
CREATE POLICY golf_message_responses_update ON public.golf_message_responses
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_message_responses_delete
ON public.golf_message_responses;
CREATE POLICY golf_message_responses_delete ON public.golf_message_responses
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.golf_message_responses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.golf_message_responses TO authenticated;

-- ── 3. Mentions ────────────────────────────────────────────────────────────
-- Stored rather than re-parsed from content, because mentions drive
-- NOTIFICATION semantics: "mentions only" has to be answerable by a query, not
-- by running a regex over every message at delivery time. It also survives a
-- rename — the row points at a user id, not at the text that produced it.
CREATE TABLE IF NOT EXISTS public.golf_message_mentions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL
    REFERENCES public.golf_messages (id) ON DELETE CASCADE,
    -- NULL for a broadcast mention (@team / @all); set for a person.
    mentioned_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
    mention_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT golf_message_mentions_type_check
    CHECK (mention_type IN ('user', 'team', 'all')),
    -- A user mention needs a target; a broadcast must not have one.
    CONSTRAINT golf_message_mentions_target_check CHECK (
        (mention_type = 'user' AND mentioned_user_id IS NOT NULL)
        OR (mention_type <> 'user' AND mentioned_user_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS golf_message_mentions_message_idx
ON public.golf_message_mentions (message_id);
-- "what mentioned me" is the notification query, so it gets its own index.
CREATE INDEX IF NOT EXISTS golf_message_mentions_user_idx
ON public.golf_message_mentions (mentioned_user_id)
WHERE mentioned_user_id IS NOT NULL;

ALTER TABLE public.golf_message_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_message_mentions_select
ON public.golf_message_mentions;
CREATE POLICY golf_message_mentions_select ON public.golf_message_mentions
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.golf_messages AS m
        WHERE
            m.id = golf_message_mentions.message_id
            AND public.golf_conversation_has_me(m.conversation_id)
    )
);

-- Only the message's OWN author may attach mentions to it. Anyone else writing
-- rows here could manufacture a notification from a message they did not send.
DROP POLICY IF EXISTS golf_message_mentions_insert
ON public.golf_message_mentions;
CREATE POLICY golf_message_mentions_insert ON public.golf_message_mentions
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.golf_messages AS m
        WHERE
            m.id = golf_message_mentions.message_id
            AND m.sender_id = (SELECT auth.uid())
    )
);

REVOKE ALL ON public.golf_message_mentions FROM anon;
GRANT SELECT, INSERT ON public.golf_message_mentions TO authenticated;

-- ── 4. Pinned messages ─────────────────────────────────────────────────────
-- Columns on the message, not a table: a pin is a property of a message, and
-- one conversation has few of them. `pinned_by` is kept so the thread can say
-- who pinned it and so an unpin can be permission-checked later.
ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS pinned_by uuid
REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS golf_messages_pinned_idx
ON public.golf_messages (conversation_id, pinned_at DESC)
WHERE pinned_at IS NOT NULL;

-- ── 5. Per-conversation notification level ─────────────────────────────────
-- On the participant row, because muting is a property of YOUR membership of a
-- conversation, not of the conversation itself. Coach muting a thread must not
-- mute it for the whole team.
ALTER TABLE public.golf_conversation_participants
ADD COLUMN IF NOT EXISTS notification_level text NOT NULL DEFAULT 'all';

ALTER TABLE public.golf_conversation_participants
DROP CONSTRAINT IF EXISTS golf_participants_notification_level_check;
ALTER TABLE public.golf_conversation_participants
ADD CONSTRAINT golf_participants_notification_level_check
CHECK (notification_level IN ('all', 'mentions', 'muted'));

-- A timed mute. NULL means the level is indefinite; a past timestamp means the
-- mute has lapsed and delivery should treat the row as 'all' again. Expiry is
-- evaluated at READ time rather than by a job — a cron that has not run yet
-- would leave someone silently muted.
ALTER TABLE public.golf_conversation_participants
ADD COLUMN IF NOT EXISTS muted_until timestamptz;

COMMENT ON COLUMN public.golf_conversation_participants.notification_level IS
'YOUR delivery preference for this conversation: all | mentions | muted. '
'Per-participant, never per-conversation. With muted_until set, the level '
'lapses back to all once that timestamp passes — evaluated on read, so a '
'stalled job can never leave somebody permanently silent.';

-- ── 6. Realtime ────────────────────────────────────────────────────────────
-- Votes and mentions must land without a refresh, same as reactions.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE
            pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'golf_message_responses'
    ) THEN
        ALTER PUBLICATION supabase_realtime
        ADD TABLE public.golf_message_responses;
    END IF;
END $$;
