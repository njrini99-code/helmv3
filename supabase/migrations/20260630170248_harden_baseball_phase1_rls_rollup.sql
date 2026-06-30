-- Normalize final BaseballHelm Phase 1 RLS replay state for the consolidated
-- pgTAP roll-up. Earlier migrations define the intended predicates; this
-- forward-only migration closes grants/policies that can drift after replay.

-- The production baseline grants default EXECUTE directly to anon for new
-- functions. Revoke both PUBLIC and anon so the helper contract is explicit.
REVOKE ALL ON FUNCTION public.get_my_baseball_player_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_baseball_team_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_baseball_staff_capability(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_baseball_player(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_baseball_player(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_baseball_team_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_baseball_lift_group(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_baseball_player_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_baseball_team_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_baseball_staff_capability(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_baseball_player(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_baseball_player(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_baseball_team_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_baseball_lift_group(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON TABLE public.baseball_staff_invitations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.baseball_stat_uploads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.baseball_staff_invitations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.baseball_stat_uploads TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.baseball_practices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practices ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practices_select" ON public.baseball_practices';
    EXECUTE $p$CREATE POLICY "baseball_practices_select" ON public.baseball_practices
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_team_staff(team_id)
        OR (status = 'published' AND public.is_baseball_team_member(team_id))
      )$p$;
  END IF;

  IF to_regclass('public.baseball_practice_blocks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practice_blocks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_blocks_select" ON public.baseball_practice_blocks';
    EXECUTE $p$CREATE POLICY "baseball_practice_blocks_select" ON public.baseball_practice_blocks
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_team_staff(team_id)
        OR (
          public.is_baseball_team_member(team_id)
          AND EXISTS (
            SELECT 1
            FROM public.baseball_practices p
            WHERE p.id = baseball_practice_blocks.practice_id
              AND p.status = 'published'
          )
        )
      )$p$;
  END IF;

  IF to_regclass('public.baseball_practice_attendance') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practice_attendance ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_attendance_select" ON public.baseball_practice_attendance';
    EXECUTE $p$CREATE POLICY "baseball_practice_attendance_select" ON public.baseball_practice_attendance
      FOR SELECT TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR player_id = public.get_my_baseball_player_id()
      )$p$;
  END IF;
END $$;
