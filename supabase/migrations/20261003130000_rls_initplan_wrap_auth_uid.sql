-- Fix the 7 Supabase performance-advisor auth_rls_initplan findings.
--
-- Each policy below called auth.uid() bare, so Postgres re-evaluated it for
-- every row scanned. Wrapping it as (SELECT auth.uid()) turns it into an
-- InitPlan that runs once per statement. auth.uid() is STABLE within a
-- statement, so the result is identical; only the plan changes.
--
-- Each policy is recreated with the SAME name, table, command, roles,
-- permissiveness, USING and WITH CHECK as production (read from pg_policy on
-- 2026-10-03, project qmnssrrolpinvwjjnufo). The only textual change is
-- auth.uid() -> (SELECT auth.uid()). Helper calls (is_golf_coach(),
-- is_super_admin(), can_view_baseball_player(), ...) are left as they are.
-- DROP POLICY discards a policy comment, so the two golf_rounds comments are
-- re-issued verbatim. The other five have no comment in production.
--
-- Runs as one transaction (db:apply / the Management API wrap the file), so
-- there is no window in which a table is missing its policy.
--
-- ROLLBACK: re-run the same DROP POLICY / CREATE POLICY pairs with bare
-- auth.uid() in place of (SELECT auth.uid()); the original text is in
-- supabase/schemas/policies/{baseball,golf,shared}.sql at the parent commit.
-- No row, grant or column is touched.
--
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname = 'public' and (tablename, policyname) in (('baseball_players', 'baseball_players_select'), ('baseball_settings_audit_log', 'baseball_settings_audit_log_insert'), ('crm_stage_transitions', 'crm_stage_transitions_admin_read'), ('golf_course_tees', 'golf_course_tees_update'), ('golf_courses', 'golf_courses_update_authenticated'), ('golf_rounds', 'golf_rounds_update'), ('golf_rounds', 'golf_rounds_update_team'))) = 7; -- noqa: LT05
-- VERIFY: select 1 where not exists (select 1 from pg_policies where schemaname = 'public' and (tablename, policyname) in (('baseball_players', 'baseball_players_select'), ('baseball_settings_audit_log', 'baseball_settings_audit_log_insert'), ('crm_stage_transitions', 'crm_stage_transitions_admin_read'), ('golf_course_tees', 'golf_course_tees_update'), ('golf_courses', 'golf_courses_update_authenticated'), ('golf_rounds', 'golf_rounds_update'), ('golf_rounds', 'golf_rounds_update_team')) and (regexp_replace(coalesce(qual, '') || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%')); -- noqa: LT05
-- VERIFY: select 1 from pg_policy where polrelid = 'public.golf_rounds'::regclass and polname = 'golf_rounds_update_team' and obj_description(oid, 'pg_policy') is not null; -- noqa: LT05

SET lock_timeout = '5s';

-- baseball_players ----------------------------------------------------------
DROP POLICY IF EXISTS "baseball_players_select" ON "public"."baseball_players";
CREATE POLICY "baseball_players_select" ON "public"."baseball_players"
FOR SELECT TO "authenticated"
USING (
    (
        ((SELECT "auth"."uid"() AS "uid") = "user_id")
        OR "public"."can_view_baseball_player"("id")
        OR "public"."is_baseball_player_recruiting_discoverable"(
            "id", "player_type", "recruiting_activated"
        )
    )
);

-- baseball_settings_audit_log -----------------------------------------------
DROP POLICY IF EXISTS "baseball_settings_audit_log_insert"
ON "public"."baseball_settings_audit_log";
CREATE POLICY "baseball_settings_audit_log_insert"
ON "public"."baseball_settings_audit_log"
FOR INSERT TO "authenticated"
WITH CHECK (
    (
        "public"."has_baseball_staff_capability"(
            "team_id", 'can_manage_settings'::"text"
        )
        AND ("actor_user_id" = (SELECT "auth"."uid"() AS "uid"))
    )
);

-- crm_stage_transitions -----------------------------------------------------
DROP POLICY IF EXISTS "crm_stage_transitions_admin_read"
ON "public"."crm_stage_transitions";
CREATE POLICY "crm_stage_transitions_admin_read"
ON "public"."crm_stage_transitions"
FOR SELECT TO "authenticated"
USING (
    (EXISTS (
        SELECT 1
        FROM "public"."users"
        WHERE (
            ("users"."id" = (SELECT "auth"."uid"() AS "uid"))
            AND ("users"."role" = 'admin'::"public"."user_role")
        )
    ))
);

-- golf_course_tees ----------------------------------------------------------
DROP POLICY IF EXISTS "golf_course_tees_update" ON "public"."golf_course_tees";
CREATE POLICY "golf_course_tees_update" ON "public"."golf_course_tees"
FOR UPDATE TO "authenticated"
USING (("public"."is_golf_coach"() OR "public"."is_super_admin"()))
WITH CHECK (
    (
        ("public"."is_golf_coach"() OR "public"."is_super_admin"())
        AND ("last_edited_by_user_id" = (SELECT "auth"."uid"() AS "uid"))
    )
);

-- golf_courses --------------------------------------------------------------
DROP POLICY IF EXISTS "golf_courses_update_authenticated"
ON "public"."golf_courses";
CREATE POLICY "golf_courses_update_authenticated" ON "public"."golf_courses"
FOR UPDATE TO "authenticated"
USING (
    (
        ((SELECT "auth"."uid"() AS "uid") IS NOT NULL)
        AND (
            "public"."is_super_admin"()
            OR (("created_by_user_id" IS NOT NULL) AND "public"."is_golf_coach"())
        )
    )
)
WITH CHECK (
    (
        ((SELECT "auth"."uid"() AS "uid") IS NOT NULL)
        AND (
            "public"."is_super_admin"()
            OR (("created_by_user_id" IS NOT NULL) AND "public"."is_golf_coach"())
        )
    )
);

-- golf_rounds: player self-update -------------------------------------------
DROP POLICY IF EXISTS "golf_rounds_update" ON "public"."golf_rounds";
CREATE POLICY "golf_rounds_update" ON "public"."golf_rounds"
FOR UPDATE TO "authenticated"
USING (
    (EXISTS (
        SELECT 1
        FROM "public"."golf_players"
        WHERE (
            ("golf_players"."id" = "golf_rounds"."player_id")
            AND ("golf_players"."user_id" = (SELECT "auth"."uid"() AS "uid"))
        )
    ))
)
WITH CHECK (
    (
        (EXISTS (
            SELECT 1
            FROM "public"."golf_players"
            WHERE (
                ("golf_players"."id" = "golf_rounds"."player_id")
                AND ("golf_players"."user_id" = (SELECT "auth"."uid"() AS "uid"))
            )
        ))
        AND (("team_id" IS NULL) OR "public"."is_golf_team_player"("team_id"))
    )
);

COMMENT ON POLICY "golf_rounds_update" ON "public"."golf_rounds" IS
'Player may update their own round. WITH CHECK pins the resulting team_id to a team they actually play for. Present in production since before 2026-08-08 but absent from every migration until now.';

-- golf_rounds: coach update -------------------------------------------------
DROP POLICY IF EXISTS "golf_rounds_update_team" ON "public"."golf_rounds";
CREATE POLICY "golf_rounds_update_team" ON "public"."golf_rounds"
FOR UPDATE TO "authenticated"
USING (
    ("player_id" IN (
        SELECT "gtm"."player_id"
        FROM (("public"."golf_team_members" "gtm"
            INNER JOIN "public"."golf_team_coach_staff" "gtcs"
                ON (("gtcs"."team_id" = "gtm"."team_id")))
            INNER JOIN "public"."golf_coaches" "gc"
                ON (("gc"."id" = "gtcs"."coach_id")))
        WHERE (
            ("gc"."user_id" = (SELECT "auth"."uid"() AS "uid"))
            AND ("gtm"."status" = 'active'::"public"."team_member_status")
        )
    ))
)
WITH CHECK (
    (
        ("player_id" IN (
            SELECT "gtm"."player_id"
            FROM (("public"."golf_team_members" "gtm"
                INNER JOIN "public"."golf_team_coach_staff" "gtcs"
                    ON (("gtcs"."team_id" = "gtm"."team_id")))
                INNER JOIN "public"."golf_coaches" "gc"
                    ON (("gc"."id" = "gtcs"."coach_id")))
            WHERE (
                ("gc"."user_id" = (SELECT "auth"."uid"() AS "uid"))
                AND ("gtm"."status" = 'active'::"public"."team_member_status")
            )
        ))
        AND (("team_id" IS NULL) OR "public"."is_golf_team_coach"("team_id"))
    )
);

COMMENT ON POLICY "golf_rounds_update_team" ON "public"."golf_rounds" IS
'Coach may update a round for a player on a team they staff. WITH CHECK also pins the resulting team_id to a team the coach staffs, so a round cannot be moved onto another squad''s books (added 2026-08-08).';
