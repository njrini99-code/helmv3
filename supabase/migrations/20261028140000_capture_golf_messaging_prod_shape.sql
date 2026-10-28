-- STATUS: WRITTEN, NOT APPLIED. Replay capture: production already has every
-- object below (verified read-only 2026-10-28), so applying it there changes
-- nothing. See HELD.md (row 20261028140000) and
-- docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW on production (every step is guarded and finds its object already
-- in place, so it takes no lock beyond the catalog reads). On a fresh replay or
-- the staging project it adds two RLS policies, two CHECKs, six FK delete
-- rules, five indexes and renames three CHECKs.
--
-- Why: the messaging tables were reconstructed in
-- 20260904103000_golf_message_reactions.sql and
-- 20260904120000_golf_messages_reply_to.sql from what was observable at the
-- time. Production carries more than those files create: golf_message_mentions
-- has its insert and select policies (a replayed database has RLS on and no
-- policy, so @mentions fail), a target CHECK, cascade deletes and two indexes;
-- golf_messages has the payload/kind CHECK, SET NULL on pinned_by and
-- reply_to_id, and the pinned and reply-to indexes; reactions and responses
-- name their length CHECKs *_emoji_len and *_choice_len and cascade on delete.
-- Every definition below is copied from production's catalog, which is also
-- what supabase/schemas/golf/** and supabase/schemas/policies/golf.sql hold.
--
-- ROLLBACK: none needed on production (nothing changes there). On a replayed
-- ROLLBACK: database: drop policy golf_message_mentions_insert and
-- ROLLBACK: golf_message_mentions_select, drop the five indexes named below,
-- ROLLBACK: drop golf_messages_payload_matches_kind and
-- ROLLBACK: golf_message_mentions_target_check. The renames and delete rules
-- ROLLBACK: need no undo.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'golf_message_mentions'
-- VERIFY: and policyname = 'golf_message_mentions_insert';
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'golf_message_mentions'
-- VERIFY: and policyname = 'golf_message_mentions_select';
-- VERIFY: select 1 from pg_constraint
-- VERIFY: where conname = 'golf_messages_payload_matches_kind';
-- VERIFY: select 1 from pg_constraint
-- VERIFY: where conname = 'golf_message_mentions_target_check';
-- VERIFY: select 1 from pg_constraint
-- VERIFY: where conname = 'golf_messages_reply_to_id_fkey'
-- VERIFY: and confdeltype = 'n';
-- VERIFY: select 1 from pg_indexes where schemaname = 'public'
-- VERIFY: and indexname = 'golf_messages_reply_to_idx';

SET LOCAL lock_timeout = '5s';

-- 1. CHECK names and the two CHECKs production has that a replay lacks.
DO $capture$
BEGIN
  -- Production's names for the same length and type rules.
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_message_reactions'::regclass
               AND conname = 'golf_message_reactions_emoji_check')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_message_reactions'::regclass
               AND conname = 'golf_message_reactions_emoji_len') THEN
    ALTER TABLE public.golf_message_reactions
      RENAME CONSTRAINT golf_message_reactions_emoji_check
      TO golf_message_reactions_emoji_len;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_message_responses'::regclass
               AND conname = 'golf_message_responses_choice_check')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_message_responses'::regclass
               AND conname = 'golf_message_responses_choice_len') THEN
    ALTER TABLE public.golf_message_responses
      RENAME CONSTRAINT golf_message_responses_choice_check
      TO golf_message_responses_choice_len;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_message_mentions'::regclass
               AND conname = 'golf_message_mentions_mention_type_check')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_message_mentions'::regclass
               AND conname = 'golf_message_mentions_type_check') THEN
    ALTER TABLE public.golf_message_mentions
      RENAME CONSTRAINT golf_message_mentions_mention_type_check
      TO golf_message_mentions_type_check;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.golf_message_mentions'::regclass
                   AND conname = 'golf_message_mentions_target_check') THEN
    ALTER TABLE public.golf_message_mentions
      ADD CONSTRAINT golf_message_mentions_target_check CHECK (
        ((mention_type = 'user'::text) AND (mentioned_user_id IS NOT NULL))
        OR ((mention_type <> 'user'::text) AND (mentioned_user_id IS NULL))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.golf_messages'::regclass
                   AND conname = 'golf_messages_payload_matches_kind') THEN
    ALTER TABLE public.golf_messages
      ADD CONSTRAINT golf_messages_payload_matches_kind CHECK (
        ((kind = 'text'::text) AND (payload IS NULL))
        OR ((kind <> 'text'::text) AND (payload IS NOT NULL))
      );
  END IF;
END
$capture$;

-- 2. Delete rules. A foreign key whose delete rule differs from production's
-- is dropped and re-added with production's definition. confdeltype:
-- 'c' cascade, 'n' set null.
DO $capture$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('public.golf_message_mentions', 'golf_message_mentions_message_id_fkey', 'c',
       'FOREIGN KEY (message_id) REFERENCES public.golf_messages(id) ON DELETE CASCADE'),
      ('public.golf_message_mentions', 'golf_message_mentions_mentioned_user_id_fkey', 'c',
       'FOREIGN KEY (mentioned_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('public.golf_message_reactions', 'golf_message_reactions_message_id_fkey', 'c',
       'FOREIGN KEY (message_id) REFERENCES public.golf_messages(id) ON DELETE CASCADE'),
      ('public.golf_message_reactions', 'golf_message_reactions_user_id_fkey', 'c',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('public.golf_messages', 'golf_messages_pinned_by_fkey', 'n',
       'FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('public.golf_messages', 'golf_messages_reply_to_id_fkey', 'n',
       'FOREIGN KEY (reply_to_id) REFERENCES public.golf_messages(id) ON DELETE SET NULL')
    ) AS v(tbl, conname, deltype, def)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE conrelid = fk.tbl::regclass
                 AND conname = fk.conname
                 AND confdeltype = fk.deltype) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', fk.tbl, fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tbl, fk.conname, fk.def);
  END LOOP;
END
$capture$;

-- 3. Indexes production has (the tables are small; on production every one
-- already exists, so nothing is built).
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_message_mentions_message_idx
ON public.golf_message_mentions USING btree (message_id);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_message_mentions_user_idx
ON public.golf_message_mentions USING btree (mentioned_user_id)
WHERE (mentioned_user_id IS NOT NULL);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_message_responses_message_idx
ON public.golf_message_responses USING btree (message_id);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_messages_pinned_idx
ON public.golf_messages USING btree (conversation_id, pinned_at DESC)
WHERE (pinned_at IS NOT NULL);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_messages_reply_to_idx
ON public.golf_messages USING btree (reply_to_id)
WHERE (reply_to_id IS NOT NULL);

-- 4. Mention policies: a sender records mentions on their own message, and a
-- conversation member reads the mentions on messages they can see. Created
-- only when missing, so production (which has both) is not locked.
DO $capture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public'
                   AND tablename = 'golf_message_mentions'
                   AND policyname = 'golf_message_mentions_insert') THEN
    CREATE POLICY golf_message_mentions_insert ON public.golf_message_mentions
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.golf_messages m
        WHERE m.id = golf_message_mentions.message_id
          AND m.sender_id = (SELECT auth.uid() AS uid)
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public'
                   AND tablename = 'golf_message_mentions'
                   AND policyname = 'golf_message_mentions_select') THEN
    CREATE POLICY golf_message_mentions_select ON public.golf_message_mentions
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.golf_messages m
        WHERE m.id = golf_message_mentions.message_id
          AND public.golf_conversation_has_me(m.conversation_id)
      ));
  END IF;
END
$capture$;

-- 5. Production gives anon nothing on this table.
REVOKE ALL ON TABLE public.golf_message_mentions FROM anon;
