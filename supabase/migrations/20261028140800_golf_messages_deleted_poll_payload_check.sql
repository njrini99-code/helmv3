-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). Owner applies.
-- Risk: LOW. Widens one CHECK on golf_messages so that a deleted non-text
-- message may have a NULL payload. Every row that passes today still passes.
--
-- Why: production's golf_messages_payload_matches_kind (captured in
-- 20261028140000) requires a payload on every non-text row. The app's soft
-- delete of a golf poll (deleteMessage in src/app/actions/messages.ts) clears
-- the payload with the text, which 20261025020200_golf_poll_payload_freeze
-- (applied 2026-10-25) allows. Against production's CHECK that write fails,
-- so a coach could not delete a poll. Found when the from-empty replay ran
-- supabase/tests/rls/golf_poll_payload_freeze.sql with the CHECK in place.
-- Production has no deleted non-text row today (read-only, 2026-10-28).
--
-- Locks: dropping and re-adding the CHECK takes ACCESS EXCLUSIVE on
-- golf_messages until commit, including the validation scan. The table is
-- small (613 rows, under 0.5 MB on 2026-10-28), so the lock lasts
-- milliseconds; lock_timeout makes a busy table fail the file instead of
-- queueing writes. The swap runs only while the old definition is in
-- place, so a second apply does nothing.
-- Desired schema: supabase/schemas/golf/10_tables.sql.
--
-- ROLLBACK: alter table public.golf_messages drop constraint
-- ROLLBACK: golf_messages_payload_matches_kind; alter table
-- ROLLBACK: public.golf_messages add constraint
-- ROLLBACK: golf_messages_payload_matches_kind check (((kind = 'text') and
-- ROLLBACK: (payload is null)) or ((kind <> 'text') and (payload is not
-- ROLLBACK: null))); only while no deleted non-text row has a NULL payload.
--
-- VERIFY: select 1 from pg_constraint
-- VERIFY: where conrelid = 'public.golf_messages'::regclass
-- VERIFY: and conname = 'golf_messages_payload_matches_kind'
-- VERIFY: and convalidated
-- VERIFY: and pg_get_constraintdef(oid) like '%is_deleted%';

SET LOCAL lock_timeout = '5s';

DO $swap$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.golf_messages'::regclass
               AND conname = 'golf_messages_payload_matches_kind'
               AND pg_get_constraintdef(oid) NOT LIKE '%is_deleted%') THEN
    ALTER TABLE public.golf_messages
      DROP CONSTRAINT golf_messages_payload_matches_kind;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.golf_messages'::regclass
                   AND conname = 'golf_messages_payload_matches_kind') THEN
    ALTER TABLE public.golf_messages
      ADD CONSTRAINT golf_messages_payload_matches_kind CHECK (
        ((kind = 'text'::text) AND (payload IS NULL))
        OR ((kind <> 'text'::text)
          AND ((payload IS NOT NULL) OR (is_deleted IS TRUE)))
      );
  END IF;
END
$swap$;
