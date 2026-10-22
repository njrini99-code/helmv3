-- pgTAP contracts for
-- 20261017101500_golf_announcement_acks_select_team_scope.sql and
-- 20261017101600_golf_announcement_attachments_same_team.sql
-- (security review 2026-10-16, S5). The recipient policies and the task DELETE
-- policy come from 20261017101000 (applied); this suite pins all six together.
--
-- Six coach policies on golf_announcement_acknowledgements,
-- golf_announcement_recipients and golf_announcement_tasks compared the
-- announcement's team with itself, so any account with a golf_coaches row
-- anywhere passed them. The suite acts as real users through
-- request.jwt.claims: a coach staffed on ANOTHER team is the attacker; the
-- announcement's own staffed coach and its players are the flows that must
-- keep working.
--
-- Counts after a DELETE are taken with RLS off: as the acting user a refused
-- delete and an invisible row both read as 0 (the trap
-- golf_group_membership_management.sql records).
--
-- Plan arithmetic: 1 structural + 5 attacker + 6 staffed coach + 2 player = 14.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN ('golf_acks_select_coaches', 'golf_ann_recipients_select_coaches',
                         'golf_ann_recipients_insert_coaches', 'golf_ann_recipients_delete_coaches',
                         'golf_ann_tasks_insert_coaches', 'golf_ann_tasks_delete_coaches')
      AND position('is_golf_team_coach' IN coalesce(qual, '') || coalesce(with_check, '')) > 0
      AND position('golf_coaches' IN coalesce(qual, '') || coalesce(with_check, '')) = 0),
  6,
  'all six coach policies are scoped by is_golf_team_coach, none by "any coach row"'
);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000017002001', 'staffed@annchild.test', 'authenticated'),
    ('00000000-0000-0000-0000-000017002002', 'other@annchild.test',   'authenticated'),
    ('00000000-0000-0000-0000-000017002003', 'p1@annchild.test',      'authenticated'),
    ('00000000-0000-0000-0000-000017002004', 'p2@annchild.test',      'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000017002101', 'Ann Child Org',   'college'),
    ('00000000-0000-0000-0000-000017002102', 'Ann Child Other', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000017002201', 'Ann Child Team',  'ANNC0001', '00000000-0000-0000-0000-000017002101'),
    ('00000000-0000-0000-0000-000017002202', 'Ann Child Other', 'ANNC0002', '00000000-0000-0000-0000-000017002102')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000017002301', '00000000-0000-0000-0000-000017002001', '00000000-0000-0000-0000-000017002101'),
    ('00000000-0000-0000-0000-000017002302', '00000000-0000-0000-0000-000017002002', '00000000-0000-0000-0000-000017002102')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000017002201', '00000000-0000-0000-0000-000017002301'),
    ('00000000-0000-0000-0000-000017002202', '00000000-0000-0000-0000-000017002302')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000017002401', '00000000-0000-0000-0000-000017002003', 'Pat', 'One'),
    ('00000000-0000-0000-0000-000017002402', '00000000-0000-0000-0000-000017002004', 'Pat', 'Two')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000017002201', '00000000-0000-0000-0000-000017002401', 'active'),
    ('00000000-0000-0000-0000-000017002201', '00000000-0000-0000-0000-000017002402', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_announcements (id, team_id, title, published_at)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002201',
            'Waiver due Friday', now())
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002401')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_announcement_acknowledgements (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_tasks (id, team_id, title) VALUES
    ('00000000-0000-0000-0000-000017002601', '00000000-0000-0000-0000-000017002201', 'Sign the waiver'),
    ('00000000-0000-0000-0000-000017002602', '00000000-0000-0000-0000-000017002202', 'Other team task')
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;

-- ---------------------------------------------------------------------------
-- The attacker: a coach staffed on ANOTHER team (another program).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017002002", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  0,
  'another team''s coach cannot read this announcement''s recipient list'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_acknowledgements
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  0,
  'another team''s coach cannot read who acknowledged it'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002402')$$,
  '42501', NULL,
  'another team''s coach cannot add a recipient'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_tasks (announcement_id, task_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002602')$$,
  '42501', NULL,
  'another team''s coach cannot attach their own task to it'
);

DELETE FROM public.golf_announcement_recipients
 WHERE announcement_id = '00000000-0000-0000-0000-000017002501';
RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  1,
  'another team''s coach cannot remove a recipient'
);
SET LOCAL role TO authenticated;

-- ---------------------------------------------------------------------------
-- The announcement's own staffed coach: every flow kept.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017002001", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  1,
  'the team''s coach reads the recipient list'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_acknowledgements
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  1,
  'the team''s coach reads who acknowledged'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002402')$$,
  'the team''s coach adds a recipient'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_announcement_tasks (announcement_id, task_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002601')$$,
  'the team''s coach attaches the team''s task'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_tasks (announcement_id, task_id)
    VALUES ('00000000-0000-0000-0000-000017002501', '00000000-0000-0000-0000-000017002602')$$,
  '42501', NULL,
  'the team''s coach cannot attach another team''s task'
);

DELETE FROM public.golf_announcement_recipients
 WHERE announcement_id = '00000000-0000-0000-0000-000017002501'
   AND player_id = '00000000-0000-0000-0000-000017002402';
RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'
      AND player_id = '00000000-0000-0000-0000-000017002402'),
  0,
  'the team''s coach removes a recipient'
);
SET LOCAL role TO authenticated;

-- ---------------------------------------------------------------------------
-- Players keep their own rows.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017002003", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  1,
  'a recipient player still reads their own recipient row'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_acknowledgements
    WHERE announcement_id = '00000000-0000-0000-0000-000017002501'),
  1,
  'a player still reads their own acknowledgement'
);

RESET role;
SELECT * FROM finish();
ROLLBACK;
