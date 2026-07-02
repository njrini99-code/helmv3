-- Fix #652: baseball_announcements <-> baseball_announcement_recipients RLS
-- infinite recursion (42P17), confirmed still live via direct pg_policies
-- query. baseball_announcements_select_player EXISTS-subqueries
-- baseball_announcement_recipients, while baseball_ann_recipients_select_coach
-- / _insert / _delete each subquery back to baseball_announcements — a mutual
-- cycle. baseball_ann_recipients_select_player (qual: player_id =
-- get_my_player_id()) is non-recursive and is the only recipients policy left
-- completely untouched below.
--
-- Fix: three SECURITY DEFINER STABLE helper functions (search_path pinned,
-- REVOKE ALL FROM public/anon, EXECUTE granted only to authenticated) replace
-- the cross-table subqueries inside policy quals. Calling a SECURITY DEFINER
-- function from within a policy is the proven pattern already used
-- elsewhere in this schema (is_baseball_team_coach, is_baseball_team_member,
-- get_my_player_id, is_baseball_team_coach_v2 are all SECURITY DEFINER and do
-- internal lookups without recursion) — it breaks the cycle because the
-- inner lookup runs under the function's own evaluation context rather than
-- re-entering the calling table's policy.
--
-- Same-file amendment (optional per the DB readiness packet, approved):
-- baseball_announcements and baseball_announcement_recipients each carry two
-- permissive SELECT policies (coach + player) — a multiple_permissive_policies
-- advisor finding, confirmed live. Since every policy on both tables is being
-- touched anyway, this migration collapses each pair into one OR'd policy.
--
-- Preserves exact visibility semantics: coach sees all team announcements/
-- recipients; player sees team-broadcast announcements (no recipients row)
-- OR announcements where they're a named recipient. INSERT/UPDATE/DELETE
-- policies on baseball_announcements are unchanged (already scoped by
-- team_id directly, no recursion). Additive-only: functions + policy
-- replacements, no table/column changes, no anon grants.

-- ----------------------------------------------------------------------------
-- 1. Helper functions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.baseball_announcement_has_recipients(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.baseball_announcement_is_recipient(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
      AND player_id = public.get_my_player_id()
  );
$function$;

CREATE OR REPLACE FUNCTION public.baseball_is_announcement_coach(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcements a
    WHERE a.id = p_announcement_id
      AND public.is_baseball_team_coach(a.team_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.baseball_announcement_has_recipients(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.baseball_announcement_has_recipients(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.baseball_announcement_is_recipient(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.baseball_announcement_is_recipient(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.baseball_is_announcement_coach(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.baseball_is_announcement_coach(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. baseball_announcements — collapse coach+player SELECT into one policy
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_announcements_select_coach" ON public.baseball_announcements;
DROP POLICY IF EXISTS "baseball_announcements_select_player" ON public.baseball_announcements;
DROP POLICY IF EXISTS "baseball_announcements_select" ON public.baseball_announcements;
CREATE POLICY "baseball_announcements_select" ON public.baseball_announcements
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_coach(team_id)
    OR (
      public.is_baseball_team_member(team_id)
      AND (
        NOT public.baseball_announcement_has_recipients(id)
        OR public.baseball_announcement_is_recipient(id)
      )
    )
  );

-- baseball_announcements_insert / _update / _delete are unchanged (already
-- scoped by team_id directly via is_baseball_team_coach — no recipients
-- subquery, not part of the recursion cycle, not touched here).

-- ----------------------------------------------------------------------------
-- 3. baseball_announcement_recipients — collapse coach+player SELECT into one
--    policy (using the helper in place of the announcements subquery);
--    recreate insert/delete via the helper. baseball_ann_recipients_select_
--    player's non-recursive qual (player_id = get_my_player_id()) is folded
--    into the new combined policy unchanged.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_ann_recipients_select_coach" ON public.baseball_announcement_recipients;
DROP POLICY IF EXISTS "baseball_ann_recipients_select_player" ON public.baseball_announcement_recipients;
DROP POLICY IF EXISTS "baseball_ann_recipients_select" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_select" ON public.baseball_announcement_recipients
  FOR SELECT TO authenticated
  USING (
    player_id = public.get_my_player_id()
    OR public.baseball_is_announcement_coach(announcement_id)
  );

DROP POLICY IF EXISTS "baseball_ann_recipients_insert" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_insert" ON public.baseball_announcement_recipients
  FOR INSERT TO authenticated
  WITH CHECK (public.baseball_is_announcement_coach(announcement_id));

DROP POLICY IF EXISTS "baseball_ann_recipients_delete" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_delete" ON public.baseball_announcement_recipients
  FOR DELETE TO authenticated
  USING (public.baseball_is_announcement_coach(announcement_id));

-- Rollback: git revert this migration's commit. The three helper functions
-- are new (safe to drop); the old recursive policies would need to be
-- reinstated from 20260527000000_prod_public_baseline.sql (:17675-17718) if
-- ever actually desired — not recommended, this is what caused #652.
