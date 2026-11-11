-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix,
-- ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261107090000_golf_participants_column_grants.sql
-- Risk: LOW-MEDIUM. No data changes. Every column the app writes keeps its
-- grant (greps in docs/clubhouse/messages-v2/DATA.md section 3 and the
-- 2026-11-07 sweep: hidden_at, notification_level + muted_until, last_read_at,
-- and nothing else). A writer that touches any other column of this table, or
-- upserts into it, would now get 42501.
-- App change needed: NONE.
--
-- The hole (confirmed on production and staging from pg_policies /
-- column_privileges, 2026-11-07):
--   golf_participants_update is `USING / WITH CHECK (user_id = auth.uid())` and
--   `authenticated` holds UPDATE on EVERY column. So a signed-in user can run
--     UPDATE golf_conversation_participants
--     SET conversation_id = '<any conversation uuid>'
--     WHERE user_id = auth.uid()
--   and their own row now makes them a member of that conversation. Membership
--   is what every messaging policy trusts (user_conversation_ids(),
--   golf_conversation_has_me()), so they can then read its messages, post in
--   it, and read its golf-attachments storage objects (storage policy:
--   folder[2] in user_conversation_ids()). Many members are minors.
--   20260807030000 closed only the INSERT path.
--
-- The fix:
--   1. Column grants: UPDATE is revoked from authenticated and anon, then
--      granted back on the four columns the app writes. A table-level REVOKE
--      also clears any column-level grant, so this file can be re-run.
--   2. golf_participants_identity_guard, a BEFORE UPDATE trigger that refuses a
--      change to id, conversation_id, user_id or joined_at for authenticated
--      and anon sessions. It matters if someone later widens the grant. It is
--      keyed on current_user (not the JWT claim), so definer functions, the
--      table owner and service_role (which do not run as authenticated/anon)
--      pass, and an ON DELETE action cannot trip it.
--   3. authenticated also loses TRUNCATE, MAINTAIN, TRIGGER and REFERENCES
--      (both reviews, 2026-11-10). It keeps SELECT, INSERT, DELETE and the four
--      column UPDATEs. TRUNCATE ignores RLS; TRIGGER lets its holder attach any
--      trigger function it may execute; MAINTAIN is VACUUM / ANALYZE / REINDEX
--      / CLUSTER. None is reachable through PostgREST, so this is defence in
--      depth. Nothing needs them (local stack with every migration applied,
--      2026-11-10): no foreign key references this table, and REFERENCES is
--      only checked when a constraint is CREATED, for the role creating it (the
--      checks themselves run as the table owner); authenticated and anon own no
--      table and cannot create one in public; no function, cron job or client
--      path truncates, maintains or puts a trigger on this table.
--   4. anon loses every privilege on this table (defence in depth: RLS is the
--      only thing keeping anon out today).
--
-- Not touched: policies (unchanged), the AFTER triggers
-- (golf_participants_read_mark, *_read_marks_on_leave and, once 20261031150000
-- is applied, the pin triggers; all SECURITY DEFINER or unaffected by column
-- grants).
--
-- LOCKS (pg_locks after each statement, local stack 2026-11-10): SHARE ROW
-- EXCLUSIVE on golf_conversation_participants, once, from CREATE OR REPLACE
-- TRIGGER. Writes to the table wait for the few milliseconds the file takes;
-- reads do not wait and are not waited for. GRANT and REVOKE take no table
-- lock. (DROP TRIGGER IF EXISTS, which an earlier draft used, takes ACCESS
-- EXCLUSIVE even when the trigger does not exist.)
--
-- ORDER: first of the Messages package. Independent of the others; apply before
-- 20261031150000 (pins) so its triggers sit on the hardened table. No app
-- deploy is needed before or after.
--
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_conversation_participants', 'UPDATE') and not has_table_privilege('anon', 'public.golf_conversation_participants', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_conversation_participants', 'last_read_at', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_conversation_participants', 'notification_level', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_conversation_participants', 'muted_until', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_conversation_participants', 'hidden_at', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where not has_column_privilege('authenticated', 'public.golf_conversation_participants', 'conversation_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversation_participants', 'user_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversation_participants', 'id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversation_participants', 'joined_at', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 from pg_trigger where tgrelid = 'public.golf_conversation_participants'::regclass and tgname = 'golf_participants_identity_guard' and not tgisinternal; -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_conversation_participants', 'TRUNCATE, MAINTAIN, TRIGGER, REFERENCES') and has_table_privilege('authenticated', 'public.golf_conversation_participants', 'SELECT') and has_table_privilege('authenticated', 'public.golf_conversation_participants', 'INSERT') and has_table_privilege('authenticated', 'public.golf_conversation_participants', 'DELETE'); -- noqa: LT05
--
-- ROLLBACK: (one transaction; re-opens the hole, use only to restore a broken
-- writer while a fix is prepared):
--   drop trigger if exists golf_participants_identity_guard
--     on public.golf_conversation_participants;
--   drop function if exists public.golf_participants_identity_guard();
--   grant update on public.golf_conversation_participants to authenticated;
--   -- authenticated also held TRUNCATE, MAINTAIN, TRIGGER and REFERENCES, and
--   -- anon held ALL. Nothing uses either; do not restore them unless
--   -- something proves a need:
--   -- grant truncate, maintain, trigger, references
--   --   on public.golf_conversation_participants to authenticated;
--   -- grant all on public.golf_conversation_participants to anon;
-- pgTAP: supabase/tests/rls/golf_participants_column_grants.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.golf_conversation_participants') IS NULL THEN
    RAISE EXCEPTION 'public.golf_conversation_participants is missing';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['id', 'conversation_id', 'user_id', 'joined_at',
      'last_read_at', 'notification_level', 'muted_until', 'hidden_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'golf_conversation_participants'
        AND column_name = v_col
    ) THEN
      RAISE EXCEPTION 'golf_conversation_participants.% is missing', v_col;
    END IF;
  END LOOP;
END $$;

-- 1. Grants -------------------------------------------------------------------

REVOKE UPDATE ON public.golf_conversation_participants
FROM public, anon, authenticated;
GRANT UPDATE (last_read_at, notification_level, muted_until, hidden_at)
ON public.golf_conversation_participants TO authenticated;
-- TRUNCATE ignores RLS, and none of these four is used by a client session.
-- The trailing noqa is for sqlfluff 4.4.0, whose Postgres grammar has no
-- MAINTAIN (new in Postgres 17) and so cannot parse this statement.
REVOKE TRUNCATE, MAINTAIN, TRIGGER, REFERENCES  -- noqa: PRS
ON public.golf_conversation_participants FROM public, authenticated;
REVOKE ALL ON public.golf_conversation_participants FROM anon;

-- 2. Identity guard -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.golf_participants_identity_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only client sessions are held to this. service_role, the table owner and
  -- SECURITY DEFINER functions run as other roles and pass.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'A participant row cannot be moved' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.golf_participants_identity_guard()
FROM public, anon;

CREATE OR REPLACE TRIGGER golf_participants_identity_guard
BEFORE UPDATE ON public.golf_conversation_participants
FOR EACH ROW
WHEN (
    old.id IS DISTINCT FROM new.id
    OR old.conversation_id IS DISTINCT FROM new.conversation_id
    OR old.user_id IS DISTINCT FROM new.user_id
    OR old.joined_at IS DISTINCT FROM new.joined_at
)
EXECUTE FUNCTION public.golf_participants_identity_guard();
