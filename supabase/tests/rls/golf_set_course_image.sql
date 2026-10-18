-- pgTAP contract for public.golf_set_course_image
-- (20261016220000_golf_set_course_image.sql).
--
-- Owner decision 2026-10-16: any golf team member, coach or player, may set a
-- course photo on any course. golf_courses_update_authenticated is NOT widened
-- (a player must still be unable to edit anything else on a course), so the
-- write goes through a narrow SECURITY DEFINER function. This suite proves both
-- halves: the function lets members in and keeps everyone else out, and the
-- table itself still refuses a player's direct UPDATE.
--
-- Every refusal is paired with the permission it must not have taken away
-- (player, coach, super admin, and a library row with created_by_user_id NULL
-- all succeed), because a function that raises for everyone passes every
-- refusal check.
--
-- Plan arithmetic: 2 structural + 13 allowed (incl. evidence and hosts) + 11
-- refused + 2 direct-table = 28.

BEGIN;
\ir _helpers.sql

SELECT plan(28);

-- ============================================================================
-- Seed. Ids use the 0000...0161xxx range.
--   users:   coach 01, player 02 (active member), pending 03, outsider 04,
--            super admin 05
--   courses: A 0a (team-owned), B 0b (LIBRARY row, created_by_user_id NULL),
--            C 0c (soft-deleted)
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000161001', 'coach@setimage.test',    'authenticated'),
    ('00000000-0000-0000-0000-000000161002', 'player@setimage.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000161003', 'pending@setimage.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000161004', 'outsider@setimage.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000161005', 'admin@setimage.test',    'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-000000161201', 'Set Image Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id)
    VALUES ('00000000-0000-0000-0000-000000161301', 'Set Image Team', 'GSETIMG1',
            '00000000-0000-0000-0000-000000161201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-000000161401', '00000000-0000-0000-0000-000000161001',
            '00000000-0000-0000-0000-000000161201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-000000161301', '00000000-0000-0000-0000-000000161401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000161502', '00000000-0000-0000-0000-000000161002', 'Play', 'Er'),
    ('00000000-0000-0000-0000-000000161503', '00000000-0000-0000-0000-000000161003', 'Pend', 'Ing'),
    ('00000000-0000-0000-0000-000000161504', '00000000-0000-0000-0000-000000161004', 'Out',  'Sider')
  ON CONFLICT DO NOTHING;

  -- The outsider has no membership row at all; the pending player has one that
  -- is not active.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000161301', '00000000-0000-0000-0000-000000161502', 'active'),
    ('00000000-0000-0000-0000-000000161301', '00000000-0000-0000-0000-000000161503', 'pending')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_allowlist (user_id, email, note)
    VALUES ('00000000-0000-0000-0000-000000161005', 'admin@setimage.test', 'golf_set_course_image test')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.golf_courses (id, name, normalized_name, created_by_user_id) VALUES
    ('00000000-0000-0000-0000-00000016100a', 'Set Image Team Course', 'set image team course',
     '00000000-0000-0000-0000-000000161001'),
    ('00000000-0000-0000-0000-00000016100b', 'Set Image Library Course', 'set image library course', NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_courses (id, name, normalized_name, created_by_user_id, deleted_at)
    VALUES ('00000000-0000-0000-0000-00000016100c', 'Set Image Deleted Course', 'set image deleted course',
            '00000000-0000-0000-0000-000000161001', now())
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 1 — the function is SECURITY DEFINER with an empty search_path, and
-- anon cannot reach it. Supabase grants EXECUTE on new public functions to anon
-- by default, so this is the revoke that matters.
-- ============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'golf_set_course_image'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
  ),
  'golf_set_course_image is SECURITY DEFINER with search_path = ""'
);

SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.golf_set_course_image(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'public', 'public.golf_set_course_image(uuid, text)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated', 'public.golf_set_course_image(uuid, text)', 'EXECUTE'
  ),
  'golf_set_course_image is executable by authenticated and NOT by anon or '
  'PUBLIC'
);

-- ============================================================================
-- GROUP 2 — who may set a photo.
-- ============================================================================

-- An active player on a team, on a team-owned course.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161002", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/player.jpg')$$,
  'an active team player can set a course photo'
);
RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT image_url FROM public.golf_courses WHERE id = '00000000-0000-0000-0000-00000016100a'),
  'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/player.jpg',
  'the player''s photo URL landed on the course'
);

SELECT is(
  (SELECT (last_edited_by_user_id::text || '/' || last_edited_by_team_id::text)
     FROM public.golf_courses WHERE id = '00000000-0000-0000-0000-00000016100a'),
  '00000000-0000-0000-0000-000000161002/00000000-0000-0000-0000-000000161301',
  'last-edited attribution is the player and their team'
);

SELECT is(
  (SELECT name FROM public.golf_courses WHERE id = '00000000-0000-0000-0000-00000016100a'),
  'Set Image Team Course',
  'nothing but the photo and attribution changed (name untouched)'
);

SELECT is(
  (SELECT changes #>> '{image_url,to}'
     FROM public.golf_course_edit_history
    WHERE course_id = '00000000-0000-0000-0000-00000016100a'
      AND edited_by_user_id = '00000000-0000-0000-0000-000000161002'
      AND action = 'update'),
  'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/player.jpg',
  'the change was recorded in golf_course_edit_history for the player'
);

-- A coach.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161001", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/coach.jpg')$$,
  'a coach can set a course photo'
);
RESET role;
RESET request.jwt.claims;

-- A super admin who is neither a coach nor a team player.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161005", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/admin.jpg')$$,
  'a super admin can set a course photo'
);
RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT count(*)::int FROM public.golf_course_edit_history
    WHERE course_id = '00000000-0000-0000-0000-00000016100a'),
  3,
  'player, coach and super admin each left one history row'
);

-- A library row (created_by_user_id NULL): golf_courses_update_authenticated
-- refuses everyone but a super admin for these, the function must not.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161002", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100b'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100b/lib.jpg')$$,
  'a team player can set the photo of a library row (created_by_user_id NULL)'
);

-- Setting the identical URL again is a no-op: no second history row.
SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100b'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100b/lib.jpg')$$,
  'setting the same URL again does not raise'
);
RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT count(*)::int FROM public.golf_course_edit_history
    WHERE course_id = '00000000-0000-0000-0000-00000016100b'),
  1,
  'setting the same URL again wrote no second history row'
);

-- ============================================================================
-- GROUP 3 — who and what is refused.
-- ============================================================================

-- An authenticated user who is not on any team.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161004", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/out.jpg')$$,
  '42501',
  'not_a_team_member',
  'an authenticated non-member is refused'
);
RESET role;
RESET request.jwt.claims;

-- A player whose membership is still pending.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161003", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/pend.jpg')$$,
  '42501',
  'not_a_team_member',
  'a player with a pending (not active) membership is refused'
);
RESET role;
RESET request.jwt.claims;

-- Signed in as the authenticated role but with no user (no sub claim).
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/x.jpg')$$,
  '28000',
  'not_authenticated',
  'a call with no auth.uid() is refused'
);
RESET role;
RESET request.jwt.claims;

-- anon cannot execute the function at all.
SET LOCAL role TO anon;
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/anon.jpg')$$,
  '42501',
  NULL,
  'anon cannot execute golf_set_course_image'
);
RESET role;

-- Members only: the remaining refusals act as the active player.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000161002", "role": "authenticated"}';

SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100c'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100c/del.jpg')$$,
  'P0002',
  'course_not_found',
  'a soft-deleted course is refused'
);

-- Host pinning. The correct course path on a foreign host is refused, and so is
-- a lookalike that merely starts with an allowed host name.
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'https://evil.example/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/p.jpg')$$,
  '22023',
  'invalid_image_url',
  'a foreign host with the correct course path is refused'
);

SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'https://qmnssrrolpinvwjjnufo.supabase.co.evil.example/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/p.jpg')$$,
  '22023',
  'invalid_image_url',
  'a lookalike host that starts with the production host is refused'
);

-- Each allowed host is accepted (127.0.0.1:54321 is already exercised above).
SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'https://qmnssrrolpinvwjjnufo.supabase.co/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/prod.jpg')$$,
  'the production Supabase host is accepted'
);

SELECT lives_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://localhost:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/local.jpg')$$,
  'the local stack host http://localhost:54321 is accepted'
);

-- A URL that points into ANOTHER course's folder.
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://127.0.0.1:54321/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100b/other.jpg')$$,
  '22023',
  'invalid_image_url',
  'a URL in another course''s folder is refused'
);

-- Not a course-images URL at all.
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'javascript:alert(1)//storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/')$$,
  '22023',
  'invalid_image_url',
  'a non-http(s) URL is refused even if it carries the course folder text'
);

-- The course-folder text hidden behind another path or a query string.
SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://evil.example/x/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/p.jpg')$$,
  '22023',
  'invalid_image_url',
  'the storage path must follow the host directly (not be buried deeper in '
  'the path)'
);

SELECT throws_ok(
  $$SELECT public.golf_set_course_image('00000000-0000-0000-0000-00000016100a'::uuid,
    'http://evil.example/p.jpg?/storage/v1/object/public/course-images/courses/00000000-0000-0000-0000-00000016100a/')$$,
  '22023',
  'invalid_image_url',
  'the course-folder text cannot be smuggled in a query string'
);

-- ============================================================================
-- GROUP 4 — the table policy is untouched: a player still cannot UPDATE
-- golf_courses directly, not even image_url.
-- ============================================================================
WITH upd AS (
  UPDATE public.golf_courses
     SET image_url = 'http://evil.example/pwned.jpg'
   WHERE id = '00000000-0000-0000-0000-00000016100a'::uuid
  RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0,
  'a player still CANNOT UPDATE golf_courses.image_url directly (policy not widened)');

WITH upd AS (
  UPDATE public.golf_courses
     SET name = 'PLAYER RENAMED'
   WHERE id = '00000000-0000-0000-0000-00000016100b'::uuid
  RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0,
  'a player still CANNOT UPDATE other golf_courses columns on a library row');

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
