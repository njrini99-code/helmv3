-- ============================================================================
-- golf_announcement_addressed_to_me() — breaks the announcements RLS cycle
-- ----------------------------------------------------------------------------
-- Issue #1229. Prerequisite for 20260802120000.
--
-- A policy body IS subject to RLS on the tables it references. An announcements
-- SELECT policy that sub-selects golf_announcement_recipients therefore
-- triggers that table's own policies — and golf_ann_recipients_select_coaches
-- sub-selects golf_announcements right back, so Postgres raises
-- `42P17: infinite recursion detected in policy for relation
-- "golf_announcements"` and EVERY announcement read fails.
--
-- Definer rights run as the owner, which bypasses RLS on the recipients table
-- and cuts the cycle.
--
-- The function deliberately takes NO user argument and reads auth.uid()
-- itself, so an authenticated caller can only ever ask "is this addressed to
-- ME" — it cannot be used to probe another player's targeting.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.golf_announcement_addressed_to_me(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.golf_announcement_recipients r
      WHERE r.announcement_id = p_announcement_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.golf_announcement_recipients r
      JOIN public.golf_players p ON p.id = r.player_id
      WHERE r.announcement_id = p_announcement_id
        AND p.user_id = (SELECT auth.uid())
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.golf_announcement_addressed_to_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_announcement_addressed_to_me(uuid) TO authenticated;

COMMENT ON FUNCTION public.golf_announcement_addressed_to_me(uuid) IS
  'True when the announcement is all-team (no recipient rows) or addressed to the calling user. Definer rights break the golf_announcements <-> golf_announcement_recipients RLS cycle. Answers only about auth.uid().';
