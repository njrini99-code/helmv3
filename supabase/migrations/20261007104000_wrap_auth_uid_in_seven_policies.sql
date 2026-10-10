-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.5 (performance
-- advisor).
-- Apply: npm run db:apply --
-- supabase/migrations/20261007104000_wrap_auth_uid_in_seven_policies.sql
-- Risk: LOW. Seven ALTER POLICY statements. Each expression is the live text
-- (pg_policies, 2026-10-07) with only auth.uid() replaced by (select
-- auth.uid()),
-- which makes Postgres evaluate it once per statement instead of once per row
-- (advisor auth_rls_initplan). The result is identical because auth.uid() is
-- STABLE and constant inside a statement.
--
-- Policies (table: policy):
--   baseball_players: baseball_players_select
--   baseball_settings_audit_log: baseball_settings_audit_log_insert
--   crm_stage_transitions: crm_stage_transitions_admin_read
--   golf_course_tees: golf_course_tees_update
--   golf_courses: golf_courses_update_authenticated
--   golf_rounds: golf_rounds_update
--   golf_rounds: golf_rounds_update_team
--
-- ROLLBACK: ALTER POLICY each of the seven back to the bare auth.uid() text.
-- It is the same text without the (select ...) wrapper, visible in this file.
--
-- VERIFY: select 1 where not exists (select 1 from pg_policies where schemaname
-- VERIFY: = 'public' and (tablename, policyname) in (('baseball_players',
-- VERIFY: 'baseball_players_select'), ('baseball_settings_audit_log',
-- VERIFY: 'baseball_settings_audit_log_insert'), ('crm_stage_transitions',
-- VERIFY: 'crm_stage_transitions_admin_read'), ('golf_course_tees',
-- VERIFY: 'golf_course_tees_update'), ('golf_courses',
-- VERIFY: 'golf_courses_update_authenticated'), ('golf_rounds',
-- VERIFY: 'golf_rounds_update'), ('golf_rounds', 'golf_rounds_update_team'))
-- VERIFY: and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check,
-- VERIFY: ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)');
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and (tablename, policyname) in (('baseball_players',
-- VERIFY: 'baseball_players_select'), ('baseball_settings_audit_log',
-- VERIFY: 'baseball_settings_audit_log_insert'), ('crm_stage_transitions',
-- VERIFY: 'crm_stage_transitions_admin_read'), ('golf_course_tees',
-- VERIFY: 'golf_course_tees_update'), ('golf_courses',
-- VERIFY: 'golf_courses_update_authenticated'), ('golf_rounds',
-- VERIFY: 'golf_rounds_update'), ('golf_rounds', 'golf_rounds_update_team'))) =
-- VERIFY: 7;

ALTER POLICY baseball_players_select ON public.baseball_players
USING (
    ((SELECT auth.uid()) = user_id)
    OR public.can_view_baseball_player(id)
    OR public.is_baseball_player_recruiting_discoverable(
        id, player_type, recruiting_activated
    )
);

ALTER POLICY baseball_settings_audit_log_insert
ON public.baseball_settings_audit_log
WITH CHECK (
    public.has_baseball_staff_capability(team_id, 'can_manage_settings'::text)
    AND (actor_user_id = (SELECT auth.uid()))
);

ALTER POLICY crm_stage_transitions_admin_read ON public.crm_stage_transitions
USING (
    EXISTS (
        SELECT 1
        FROM public.users
        WHERE
            users.id = (SELECT auth.uid())
            AND users.role = 'admin'::public.user_role
    )
);

ALTER POLICY golf_course_tees_update ON public.golf_course_tees
USING (public.is_golf_coach() OR public.is_super_admin())
WITH CHECK (
    (public.is_golf_coach() OR public.is_super_admin())
    AND (last_edited_by_user_id = (SELECT auth.uid()))
);

ALTER POLICY golf_courses_update_authenticated ON public.golf_courses
USING (
    ((SELECT auth.uid()) IS NOT NULL)
    AND (
        public.is_super_admin()
        OR ((created_by_user_id IS NOT NULL) AND public.is_golf_coach())
    )
)
WITH CHECK (
    ((SELECT auth.uid()) IS NOT NULL)
    AND (
        public.is_super_admin()
        OR ((created_by_user_id IS NOT NULL) AND public.is_golf_coach())
    )
);

ALTER POLICY golf_rounds_update ON public.golf_rounds
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_players
        WHERE
            golf_players.id = golf_rounds.player_id
            AND golf_players.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.golf_players
        WHERE
            golf_players.id = golf_rounds.player_id
            AND golf_players.user_id = (SELECT auth.uid())
    )
    AND ((team_id IS NULL) OR public.is_golf_team_player(team_id))
);

ALTER POLICY golf_rounds_update_team ON public.golf_rounds
USING (
    player_id IN (
        SELECT gtm.player_id
        FROM public.golf_team_members gtm
        JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
        JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
        WHERE
            gc.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
    )
)
WITH CHECK (
    player_id IN (
        SELECT gtm.player_id
        FROM public.golf_team_members gtm
        JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
        JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
        WHERE
            gc.user_id = (SELECT auth.uid())
            AND gtm.status = 'active'::public.team_member_status
    )
    AND ((team_id IS NULL) OR public.is_golf_team_coach(team_id))
);
