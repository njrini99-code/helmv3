-- #652 fix: break the mutual-recursion cycle between baseball_announcements
-- and baseball_announcement_recipients (42P17 in prod logs).
--
-- LIVE-VERIFIED (2026-07-02, pg_policies): baseball_announcements_select_player
-- EXISTS-subqueries baseball_announcement_recipients, while
-- baseball_ann_recipients_select_coach / _insert / _delete EXISTS-subquery
-- baseball_announcements back -> circular. baseball_ann_recipients_select_player
-- (qual: player_id = get_my_player_id()) is NOT part of the cycle -- left untouched.
--
-- Fix: three SECURITY DEFINER STABLE helpers (search_path='') break the cycle by
-- resolving the cross-table check inside a function instead of a correlated
-- subquery evaluated under the caller's RLS.

CREATE OR REPLACE FUNCTION public.baseball_announcement_has_recipients(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
  );
$$;

CREATE OR REPLACE FUNCTION public.baseball_announcement_is_recipient(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
      AND player_id = public.get_my_player_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.baseball_is_announcement_coach(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_baseball_team_coach(a.team_id)
  FROM public.baseball_announcements a
  WHERE a.id = p_announcement_id;
$$;

REVOKE ALL ON FUNCTION public.baseball_announcement_has_recipients(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.baseball_announcement_is_recipient(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.baseball_is_announcement_coach(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.baseball_announcement_has_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.baseball_announcement_is_recipient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.baseball_is_announcement_coach(uuid) TO authenticated;

-- Recreate baseball_announcements_select_player using the helpers (same
-- visibility semantics: team member AND (no recipients row OR is a recipient)).
DROP POLICY IF EXISTS "baseball_announcements_select_player" ON public.baseball_announcements;
CREATE POLICY "baseball_announcements_select_player" ON public.baseball_announcements
  FOR SELECT TO authenticated
  USING (
    is_baseball_team_member(team_id)
    AND (
      NOT public.baseball_announcement_has_recipients(id)
      OR public.baseball_announcement_is_recipient(id)
    )
  );

-- Recreate the three recursive recipients policies using the coach helper.
-- EXACT names -- a misspelled DROP silently no-ops and leaves the recursion live.
DROP POLICY IF EXISTS "baseball_ann_recipients_select_coach" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_select_coach" ON public.baseball_announcement_recipients
  FOR SELECT TO authenticated
  USING (public.baseball_is_announcement_coach(announcement_id));

DROP POLICY IF EXISTS "baseball_ann_recipients_insert" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_insert" ON public.baseball_announcement_recipients
  FOR INSERT TO authenticated
  WITH CHECK (public.baseball_is_announcement_coach(announcement_id));

DROP POLICY IF EXISTS "baseball_ann_recipients_delete" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_delete" ON public.baseball_announcement_recipients
  FOR DELETE TO authenticated
  USING (public.baseball_is_announcement_coach(announcement_id));

-- baseball_ann_recipients_select_player is untouched (non-recursive, not part
-- of the cycle) -- do not DROP or recreate it here.

-- Rollback:
--   -- restore original (recursive) policies verbatim, or re-apply this file's
--   -- DROP POLICY statements followed by the ORIGINAL correlated-subquery
--   -- CREATE POLICY bodies (see PR #652 investigation notes / pg_policies
--   -- snapshot dated 2026-07-02 in DB_READINESS_PACKET_2026-07-02.md).
--   DROP FUNCTION IF EXISTS public.baseball_announcement_has_recipients(uuid);
--   DROP FUNCTION IF EXISTS public.baseball_announcement_is_recipient(uuid);
--   DROP FUNCTION IF EXISTS public.baseball_is_announcement_coach(uuid);
