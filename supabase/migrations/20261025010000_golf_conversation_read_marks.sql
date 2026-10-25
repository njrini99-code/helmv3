-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Apply: npm run db:apply --
-- supabase/migrations/20261025010000_golf_conversation_read_marks.sql
-- Risk: LOW. Additive only: one new table with RLS, one RLS helper, one
-- reader function, two AFTER triggers on golf_conversation_participants
-- (WHEN-guarded, so mute and hide updates never fire them), and a one-time
-- baseline insert. No existing object changes shape. The app reads the new
-- function only when it exists and degrades to names-only when it doesn't.
--
-- Why: Clubhouse Seen by (premium features P-1, handoff 4.34.1). Who has seen
-- a message is last_read_at >= created_at and needs nothing new. WHEN each
-- person first saw it cannot be read from last_read_at, which moves forward
-- on every open. This keeps one row per open that saw at least one new
-- message from someone else (golf_record_read_mark), so the first mark at or
-- after a message's created_at is exactly when that person first saw it.
-- Rows are kept 120 days; the reader answers for messages up to 30 days old,
-- so a pruned mark can never be the first one after a message it answers for.
-- A baseline row per participant (is_baseline) records what was already
-- seen when the log started, so messages from before the log read as seen
-- without a time instead of with a wrong one.
--
-- Who may read marks (golf_read_marks_visible): your own; in a direct thread
-- (two participants) the other person's; in a team conversation, every
-- member's if you are a member and on that team's coaching staff. Players
-- never read teammates' marks in a group. Nobody writes marks directly:
-- authenticated has SELECT only; the triggers write with definer rights.
--
-- VERIFY: SELECT 1 FROM pg_class WHERE oid = 'public.golf_conversation_read_marks'::regclass AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_conversation_read_marks' AND policyname = 'golf_read_marks_select' HAVING count(*) = 1;
-- VERIFY: SELECT 1 WHERE has_table_privilege('authenticated', 'public.golf_conversation_read_marks', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.golf_conversation_read_marks', 'INSERT') AND NOT has_table_privilege('anon', 'public.golf_conversation_read_marks', 'SELECT');
-- VERIFY: SELECT 1 FROM pg_trigger WHERE tgname = 'golf_participants_read_mark' AND tgrelid = 'public.golf_conversation_participants'::regclass AND NOT tgisinternal;
-- VERIFY: SELECT 1 FROM pg_trigger WHERE tgname = 'golf_participants_read_marks_on_leave' AND tgrelid = 'public.golf_conversation_participants'::regclass AND NOT tgisinternal;
-- VERIFY: SELECT 1 FROM pg_proc WHERE oid = 'public.golf_read_marks_visible(uuid, uuid)'::regprocedure AND prosecdef AND NOT has_function_privilege('anon', oid, 'EXECUTE');
-- VERIFY: SELECT 1 FROM pg_proc WHERE oid = 'public.golf_message_seen_times(uuid)'::regprocedure AND NOT prosecdef AND has_function_privilege('authenticated', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE');
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_participants_read_mark ON public.golf_conversation_participants; DROP TRIGGER IF EXISTS golf_participants_read_marks_on_leave ON public.golf_conversation_participants; DROP FUNCTION IF EXISTS public.golf_message_seen_times(uuid); DROP FUNCTION IF EXISTS public.golf_record_read_mark(); DROP FUNCTION IF EXISTS public.golf_forget_read_marks(); DROP TABLE IF EXISTS public.golf_conversation_read_marks; DROP FUNCTION IF EXISTS public.golf_read_marks_visible(uuid, uuid);
-- After apply: npm run db:types (adds the table and the function to src/lib/types/database.ts).

SET lock_timeout = '3s';

-- 1. The log.
CREATE TABLE IF NOT EXISTS public.golf_conversation_read_marks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL
    REFERENCES public.golf_conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.users (id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL,
  is_baseline boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.golf_conversation_read_marks IS
'One row per time a participant''s last_read_at advanced past at least one '
'new message from someone else (golf_record_read_mark), plus one baseline row '
'per participant from when the log started. The first mark at or after a '
'message''s created_at is when that person first saw it (Clubhouse Seen by, '
'P-1). Kept 120 days. Written only by triggers; members read through RLS.';

-- The table is created empty in this migration, so a plain build takes no time; CONCURRENTLY cannot run inside
-- the migration transaction.
-- Reader range scan (golf_message_seen_times) and the per-user prune.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_read_marks_conv_read_at
  ON public.golf_conversation_read_marks (conversation_id, read_at)
  INCLUDE (user_id, is_baseline);
-- Covers the user_id foreign key (cascade on user delete; advisor rule).
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_read_marks_user_id
  ON public.golf_conversation_read_marks (user_id);
-- At most one baseline per participant: makes the baseline insert idempotent.
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_read_marks_baseline
  ON public.golf_conversation_read_marks (conversation_id, user_id)
  WHERE is_baseline;

ALTER TABLE public.golf_conversation_read_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golf_conversation_read_marks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golf_conversation_read_marks TO authenticated;
GRANT ALL ON public.golf_conversation_read_marks TO service_role;

-- 2. Who may read whose marks. Definer rights so the policy never re-enters
-- golf_conversation_participants' own RLS (the recursion trap the group
-- membership migration documents), and so the staff check can read
-- golf_team_coach_staff and golf_coaches regardless of the caller's grants.
CREATE OR REPLACE FUNCTION public.golf_read_marks_visible(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    p_user_id = (SELECT auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.golf_conversation_participants me
        WHERE me.conversation_id = p_conversation_id
          AND me.user_id = (SELECT auth.uid())
      )
      AND (
        (SELECT count(*) FROM public.golf_conversation_participants p
          WHERE p.conversation_id = p_conversation_id) = 2
        OR EXISTS (
          SELECT 1
          FROM public.golf_conversations c
          JOIN public.golf_team_coach_staff s ON s.team_id = c.team_id
          JOIN public.golf_coaches gc ON gc.id = s.coach_id
          WHERE c.id = p_conversation_id
            AND c.team_id IS NOT NULL
            AND gc.user_id = (SELECT auth.uid())
        )
      )
    );
$$;

COMMENT ON FUNCTION public.golf_read_marks_visible(uuid, uuid) IS
'May the CALLER read p_user_id''s read marks in this conversation? Own marks; '
'the other person''s in a two-person thread; everyone''s in a team '
'conversation the caller belongs to and coaches. Reads auth.uid() itself, so '
'it answers only for the caller. Policy helper for golf_conversation_read_marks.';

REVOKE EXECUTE ON FUNCTION public.golf_read_marks_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_read_marks_visible(uuid, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'golf_conversation_read_marks'
    AND policyname = 'golf_read_marks_select') THEN
    CREATE POLICY golf_read_marks_select
      ON public.golf_conversation_read_marks
      FOR SELECT TO authenticated
      USING (public.golf_read_marks_visible(conversation_id, user_id));
  END IF;
END;
$$;

-- 3. Writing marks. Fires only when last_read_at moves forward (the WHEN
-- clause), so mute, hide and other participant updates never reach it.
-- Writes a mark only if a message from someone else was created in
-- (OLD.last_read_at, NEW.last_read_at]: any other advance can be nobody's
-- first sight of anything, so it carries no information.
CREATE OR REPLACE FUNCTION public.golf_record_read_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- A member can write any last_read_at on their own row (golf_participants_update is own-row only), so a forged
  -- future time is clamped to the database clock before it is stored or compared (changelog P-01).
  v_at timestamptz := LEAST(NEW.last_read_at, now());
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.golf_messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.sender_id <> NEW.user_id
      AND NOT COALESCE(m.is_deleted, false)
      AND m.created_at <= v_at
      AND (OLD.last_read_at IS NULL OR m.created_at > OLD.last_read_at)
  ) THEN
    INSERT INTO public.golf_conversation_read_marks (conversation_id, user_id, read_at)
    VALUES (NEW.conversation_id, NEW.user_id, v_at);
  END IF;

  -- Retention, kept small and index-backed: only this person's marks here.
  DELETE FROM public.golf_conversation_read_marks r
  WHERE r.conversation_id = NEW.conversation_id
    AND r.user_id = NEW.user_id
    AND r.read_at < now() - interval '120 days';

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.golf_record_read_mark() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_participants_read_mark
  AFTER UPDATE OF last_read_at ON public.golf_conversation_participants
  FOR EACH ROW
  WHEN (NEW.last_read_at IS NOT NULL
        AND (OLD.last_read_at IS NULL OR NEW.last_read_at > OLD.last_read_at))
  EXECUTE FUNCTION public.golf_record_read_mark();

-- 4. Leaving a conversation takes your marks with you.
CREATE OR REPLACE FUNCTION public.golf_forget_read_marks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.golf_conversation_read_marks r
  WHERE r.conversation_id = OLD.conversation_id
    AND r.user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.golf_forget_read_marks() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER golf_participants_read_marks_on_leave
  AFTER DELETE ON public.golf_conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.golf_forget_read_marks();

-- 5. The reader: when each member first saw one message. Invoker rights, so
-- the marks' RLS decides whose rows come back (a player gets their own; a
-- coach on the team gets everyone's) and golf_messages' RLS requires the
-- caller to be in the conversation. exact = false means "had seen it by the
-- time the log started": the app shows Seen without a time.
CREATE OR REPLACE FUNCTION public.golf_message_seen_times(p_message_id uuid)
RETURNS TABLE (user_id uuid, seen_at timestamptz, exact boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT ON (r.user_id)
    r.user_id, r.read_at AS seen_at, NOT r.is_baseline AS exact
  FROM public.golf_messages m
  JOIN public.golf_conversation_read_marks r
    ON r.conversation_id = m.conversation_id
   AND r.read_at >= m.created_at
  WHERE m.id = p_message_id
    AND r.user_id <> m.sender_id
    AND m.created_at >= now() - interval '30 days'
  ORDER BY r.user_id, r.read_at;
$$;

COMMENT ON FUNCTION public.golf_message_seen_times(uuid) IS
'When each member first saw this message (the first read mark at or after its '
'created_at), for messages up to 30 days old. Invoker rights: '
'golf_conversation_read_marks RLS decides whose rows return. exact = false: '
'seen before the log began, time unknown. Clubhouse Seen by (P-1).';

REVOKE EXECUTE ON FUNCTION public.golf_message_seen_times(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_message_seen_times(uuid) TO authenticated, service_role;

-- 6. Baseline: what each participant had already seen when the log started.
-- Only recent readers matter (the reader answers for 30 days). Idempotent
-- through uq_golf_read_marks_baseline.
INSERT INTO public.golf_conversation_read_marks
  (conversation_id, user_id, read_at, is_baseline)
SELECT p.conversation_id, p.user_id, LEAST(p.last_read_at, now()), true
FROM public.golf_conversation_participants p
WHERE p.last_read_at IS NOT NULL
  AND p.last_read_at >= now() - interval '30 days'
ON CONFLICT (conversation_id, user_id) WHERE is_baseline DO NOTHING;
