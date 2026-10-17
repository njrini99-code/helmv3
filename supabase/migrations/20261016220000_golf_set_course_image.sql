-- STATUS: WRITTEN, NOT APPLIED. The owner merges and applies this as part of a
-- batch.
-- Apply: npm run db:apply -- supabase/migrations/20261016220000_golf_set_course_image.sql
-- Risk: LOW. One new SECURITY DEFINER function, no table, policy or grant on an
-- existing object changes. It can only write golf_courses.image_url and one
-- golf_course_edit_history row.
--
-- PURPOSE: any golf team member (a coach or a player on a team) can set the
-- photo of any course, library rows included. Owner decision, 2026-10-16.
-- Before this, the write was coach-only: setCourseImageUrl went through
-- updateCourse, which the app gates with requireCoachActor and the database
-- gates with golf_courses_update_authenticated (a player is refused, and a
-- library row, created_by_user_id NULL, needs a super admin). A player who
-- attached a photo in round setup uploaded the file, then watched the write
-- silently not land.
--
-- WHY A FUNCTION AND NOT A WIDER POLICY: golf_courses_update_authenticated
-- stays exactly as it is. A policy cannot say "this UPDATE may change
-- image_url and nothing else", so widening it would let a player rename a
-- course or edit anything else on the row. This function is the narrow path:
-- it validates the caller and the URL, then updates image_url plus the
-- last-edited attribution columns and nothing more.
--
-- WHO MAY CALL IT (authenticated only; anon has no EXECUTE):
--   * a player with an ACTIVE golf_team_members row (golf_players.user_id =
--     auth.uid(), status = 'active'), or
--   * a coach: public.is_golf_coach() (any golf_coaches row, which includes
--     every golf_team_coach_staff coach). This is the same predicate the
--     course-library coach gate already uses, so no coach loses the ability
--     they had before, or
--   * public.is_super_admin().
--
-- WHAT IT CHECKS, in this order, each failing with a distinct SQLSTATE the
-- server action maps to a short message:
--   28000  not signed in                              (auth.uid() is NULL)
--   42501  not a team member, coach or super admin
--   22023  p_image_url is not <allowed host>/storage/v1/object/public/
--          course-images/courses/<p_course_id>/<file>, with the storage path
--          directly after the host and no query or fragment. Allowed hosts:
--          https://qmnssrrolpinvwjjnufo.supabase.co (production; the project
--          ref is not a secret) and the local stack's http://127.0.0.1:54321
--          and http://localhost:54321. Library rows are shared across teams, so
--          the host is pinned here and not only in the server action: a direct
--          RPC call cannot point a course photo at an outside server. A new
--          Supabase project or a custom storage domain means updating this list.
--   P0002  the course does not exist or is soft-deleted (deleted_at set)
--
-- WHAT IT WRITES: golf_courses.image_url, last_edited_by_user_id,
-- last_edited_by_team_id, last_edited_at; and one golf_course_edit_history row
-- (action 'update', changes {"image_url": {"from": ..., "to": ...}}, the shape
-- appendCourseHistory writes). The history insert happens inside the function
-- because the table's INSERT policy would pass for the caller anyway, but the
-- function should not depend on that. Setting the same URL again is a no-op:
-- no write, no history row. edited_by_team_id is best effort: the caller's
-- oldest active team as a player, else a team they coach, else NULL.
--
-- NOT CHANGED: removeCourseImage (clearing a photo) stays coach-only through
-- updateCourse. Nothing else about golf_courses writes changes.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_set_course_image(uuid, text);
-- Photos already set stay set. The app then fails closed: a player's photo
-- write is refused again, as it was before.
--
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname = 'golf_set_course_image' and
-- VERIFY: p.prosecdef and p.proconfig = array['search_path=""']) = 1;
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.golf_set_course_image(uuid, text)', 'EXECUTE')
-- VERIFY: and has_function_privilege('authenticated',
-- VERIFY: 'public.golf_set_course_image(uuid, text)', 'EXECUTE');
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and tablename = 'golf_courses' and cmd = 'UPDATE') = 1;

CREATE OR REPLACE FUNCTION public.golf_set_course_image(
  p_course_id uuid,
  p_image_url text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_member  boolean;
  v_team_id uuid;
  v_old_url text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_member :=
    EXISTS (
      SELECT 1
      FROM public.golf_team_members gtm
      JOIN public.golf_players gp ON gp.id = gtm.player_id
      WHERE gp.user_id = v_uid
        AND gtm.status = 'active'::public.team_member_status
    )
    OR public.is_golf_coach()
    OR public.is_super_admin();

  IF NOT v_member THEN
    RAISE EXCEPTION 'not_a_team_member' USING ERRCODE = '42501';
  END IF;

  IF p_course_id IS NULL
     OR p_image_url IS NULL
     OR length(p_image_url) > 2048
     OR p_image_url !~ (
          '^(https://qmnssrrolpinvwjjnufo\.supabase\.co|http://127\.0\.0\.1:54321|http://localhost:54321)'
          || '/storage/v1/object/public/course-images/courses/'
          || p_course_id::text
          || '/[^?#[:space:]]+$'
        )
  THEN
    RAISE EXCEPTION 'invalid_image_url' USING ERRCODE = '22023';
  END IF;

  SELECT gc.image_url
    INTO v_old_url
    FROM public.golf_courses gc
   WHERE gc.id = p_course_id
     AND gc.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_url IS NOT DISTINCT FROM p_image_url THEN
    RETURN;
  END IF;

  -- Attribution team, best effort: oldest active team as a player, else a team
  -- the caller coaches, else NULL.
  SELECT t.team_id
    INTO v_team_id
    FROM (
      SELECT gtm.team_id, 0 AS rank, gtm.joined_at AS at
        FROM public.golf_team_members gtm
        JOIN public.golf_players gp ON gp.id = gtm.player_id
       WHERE gp.user_id = v_uid
         AND gtm.status = 'active'::public.team_member_status
      UNION ALL
      SELECT gtcs.team_id, 1 AS rank, gtcs.created_at AS at
        FROM public.golf_team_coach_staff gtcs
        JOIN public.golf_coaches gco ON gco.id = gtcs.coach_id
       WHERE gco.user_id = v_uid
    ) t
   ORDER BY t.rank, t.at NULLS LAST
   LIMIT 1;

  UPDATE public.golf_courses
     SET image_url               = p_image_url,
         last_edited_by_user_id  = v_uid,
         last_edited_by_team_id  = v_team_id,
         last_edited_at          = now()
   WHERE id = p_course_id;

  INSERT INTO public.golf_course_edit_history
    (course_id, edited_by_user_id, edited_by_team_id, action, changes)
  VALUES (
    p_course_id,
    v_uid,
    v_team_id,
    'update',
    jsonb_build_object(
      'image_url',
      jsonb_build_object('from', to_jsonb(v_old_url), 'to', to_jsonb(p_image_url))
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.golf_set_course_image(uuid, text) IS
  'Sets golf_courses.image_url for a course. Callable by an active golf team member, any coach, or a super admin (owner decision 2026-10-16). Updates only image_url plus last-edited attribution and writes a golf_course_edit_history row; does not widen golf_courses_update_authenticated. Errors: 28000 not signed in, 42501 not a member, 22023 bad URL, P0002 course missing or soft-deleted.';

-- Supabase's default privileges grant EXECUTE on new public functions to anon,
-- so revoke it explicitly.
REVOKE ALL ON FUNCTION public.golf_set_course_image(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_set_course_image(uuid, text) TO authenticated;

-- ACL assertion: the migration fails loudly on grant drift.
DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.golf_set_course_image(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'golf_set_course_image must not be executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.golf_set_course_image(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'golf_set_course_image must be executable by authenticated';
  END IF;
END
$assert$;
