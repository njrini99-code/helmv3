-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix,
-- ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090050_golf_conversations_team_channel_coach_only.sql
-- Risk: LOW. No data changes. It narrows who may INSERT a conversation flagged
-- is_team_channel: only a coach of that team. No app code sets the flag at
-- main (743cb23a1) or at the build production serves (d0f467a73); only
-- scripts/seed-demo-team-ops.ts:641 does, with the service role, which
-- bypasses RLS.
-- App change needed: NONE.
--
-- This is the second half of what 20261110090000 carried until the migration
-- review of 2026-11-10 (should-fix 1). One file took ACCESS EXCLUSIVE on
-- golf_conversation_participants and then on golf_conversations. Every inbox
-- read locks those two tables in the opposite order (the list RPC,
-- golf_conversations_select_v2 and _update_v2 through user_conversation_ids(),
-- and the updated_at bump after a send), so a request arriving in between could
-- deadlock with the file. Split by table, each file holds ACCESS EXCLUSIVE on
-- one table only and no cycle can form: a session waiting on this file's lock
-- holds nothing this file needs.
--
-- The hole (security review 2026-11-10, item A2, deferred by the
-- 20261107090100 header):
--   golf_conversations_insert_v2 lets any team player INSERT a conversation
--   with is_team_channel = true (and any signed-in user with team_id NULL).
--   Such a row lists first for everyone its creator adds (the list RPC orders
--   by is_team_channel) and they cannot hide it (conversation-hide.ts refuses a
--   channel). Once 20261110090200 is applied the flag also decides where new
--   team members are put, so who may set it matters more.
--
-- The fix:
--   golf_conversations_insert_team_channel_coach, a RESTRICTIVE INSERT policy:
--   a row with is_team_channel = true needs a team_id the caller coaches
--   (is_golf_team_coach). Restrictive and separate on purpose: 20261107090100
--   drops and recreates the permissive golf_conversations_insert_v2, so a
--   clause added there would be undone by whichever of the two files ran
--   second. A restrictive policy is ANDed with it in either order. The service
--   role bypasses RLS, so the seed script is unaffected.
--
-- Not changed: changing is_team_channel on an existing row is closed by
-- 20261107090100 (column grants and identity guard), not here.
--
-- LOCKS (pg_locks before commit, local stack 2026-11-10): ACCESS EXCLUSIVE on
-- golf_conversations, once (DROP / CREATE POLICY needs it), and no other
-- table: the policy's check calls a function and names no table. Reads and
-- writes of golf_conversations wait from the lock to the commit, a few
-- milliseconds; lock_timeout gives up after 3s with nothing changed. Apply
-- off-peak and run it again if it times out.
--
-- ORDER: independent of 20261110090000, of the four 202611070900xx files and
-- of any app deploy. Apply before 20261110090200 (it trusts is_team_channel),
-- whose precondition refuses to run without this file.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversations' and policyname = 'golf_conversations_insert_team_channel_coach' and permissive = 'RESTRICTIVE' and cmd = 'INSERT' and position('is_team_channel' in with_check) > 0 and position('is_golf_team_coach' in with_check) > 0; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversations' and policyname = 'golf_conversations_insert_v2' and cmd = 'INSERT' and permissive = 'PERMISSIVE'; -- noqa: LT05
--
-- ROLLBACK: (one transaction; re-opens the hole). ORDER: roll back
-- 20261110090500's function, 20261110090300 and 20261110090200 first, in that
-- order. While they are live they trust is_team_channel, and without this
-- policy any team player can flag a conversation of their own as the team's
-- channel:
--   drop policy if exists golf_conversations_insert_team_channel_coach
--     on public.golf_conversations;
-- pgTAP: supabase/tests/rls/golf_team_chat_self_join.sql (shared with
-- 20261110090000: one fixture, both policies)

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF to_regclass('public.golf_conversations') IS NULL THEN
    RAISE EXCEPTION 'public.golf_conversations is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_conversations'
      AND column_name = 'is_team_channel'
  ) THEN
    RAISE EXCEPTION 'golf_conversations.is_team_channel is missing';
  END IF;
  IF to_regprocedure('public.is_golf_team_coach(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_golf_team_coach(uuid) is missing';
  END IF;
END $$;

-- Only a coach of the team creates its team channel ---------------------------

DROP POLICY IF EXISTS golf_conversations_insert_team_channel_coach
ON public.golf_conversations;
CREATE POLICY golf_conversations_insert_team_channel_coach
ON public.golf_conversations
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
    is_team_channel IS NOT TRUE
    OR (team_id IS NOT NULL AND public.is_golf_team_coach(team_id))
);
