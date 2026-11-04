-- N-00 v2 Practice (20261026010000..20261026010800): who can write, read and publish practice plans,
-- that drafts and own-work lines stay private, that Documents rows follow publish and take down,
-- and that the drill bank, saved groups, templates and make-ups keep their rules.
-- WRITTEN, NOT RUN where it was authored (no Supabase stack): run with npm run test:rls before applying.
BEGIN;
\ir _helpers.sql
SELECT plan(91);

-- Fixture ----------------------------------------------------------------------------------------
-- Team X (org 1): head coach H, assistant A, players P1 and P2. Team Y (org 1): head coach U, player Q.
DO $$
DECLARE
  u_h uuid := '00000000-0000-0000-0000-000000e17101'; u_a uuid := '00000000-0000-0000-0000-000000e17102';
  u_u uuid := '00000000-0000-0000-0000-000000e17103'; u_p1 uuid := '00000000-0000-0000-0000-000000e17104';
  u_p2 uuid := '00000000-0000-0000-0000-000000e17105'; u_q uuid := '00000000-0000-0000-0000-000000e17106';
  c_h uuid := '00000000-0000-0000-0000-000000e17201'; c_a uuid := '00000000-0000-0000-0000-000000e17202';
  c_u uuid := '00000000-0000-0000-0000-000000e17203';
  p_1 uuid := '00000000-0000-0000-0000-000000e17301'; p_2 uuid := '00000000-0000-0000-0000-000000e17302';
  p_q uuid := '00000000-0000-0000-0000-000000e17303';
  o_1 uuid := '00000000-0000-0000-0000-000000e17401';
  t_x uuid := '00000000-0000-0000-0000-000000e17411'; t_y uuid := '00000000-0000-0000-0000-000000e17412';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_h, 'practice-h@helm.test', 'authenticated'), (u_a, 'practice-a@helm.test', 'authenticated'),
    (u_u, 'practice-u@helm.test', 'authenticated'), (u_p1, 'practice-p1@helm.test', 'authenticated'),
    (u_p2, 'practice-p2@helm.test', 'authenticated'), (u_q, 'practice-q@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (u_h, 'practice-h@helm.test', 'coach'), (u_a, 'practice-a@helm.test', 'coach'),
    (u_u, 'practice-u@helm.test', 'coach'), (u_p1, 'practice-p1@helm.test', 'player'),
    (u_p2, 'practice-p2@helm.test', 'player'), (u_q, 'practice-q@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES (o_1, 'pgtap-practice-org', 'college') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (c_h, u_h, o_1), (c_a, u_a, o_1), (c_u, u_u, o_1) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (p_1, u_p1), (p_2, u_p2), (p_q, u_q) ON CONFLICT DO NOTHING;
  -- golf_teams_org_gender_uidx is UNIQUE (organization_id, gender): the two teams differ on gender.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (t_x, 'pgtap-practice-X', 'PGPRX1', o_1, 'mens'), (t_y, 'pgtap-practice-Y', 'PGPRY1', o_1, 'womens')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (t_x, c_h, 'head_coach', true), (t_x, c_a, 'assistant_coach', false), (t_y, c_u, 'head_coach', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (t_x, p_1, 'active'), (t_x, p_2, 'active'), (t_y, p_q, 'active') ON CONFLICT DO NOTHING;
  -- A trimmed zone that Postgres knows: the make-up due-date check must trim before it looks it up.
  INSERT INTO public.golf_team_settings (team_id, timezone) VALUES (t_x, '  Pacific/Honolulu  ');
  INSERT INTO public.golf_events (id, team_id, created_by, title, event_type, location, start_time, end_time, all_day) VALUES
    ('00000000-0000-0000-0000-000000e17501', t_x, u_h, 'Thursday practice', 'practice', 'Lakeside range',
      now() + interval '2 days', now() + interval '2 days 3 hours', false),
    ('00000000-0000-0000-0000-000000e17502', t_x, u_h, 'Range day', 'practice', NULL,
      now() + interval '3 days', NULL, true),
    ('00000000-0000-0000-0000-000000e17503', t_x, u_h, 'Team meeting', 'meeting', NULL,
      now() + interval '4 days', now() + interval '4 days 1 hour', false);
  INSERT INTO public.golf_conversations (id, team_id, is_team_chat, title, created_by) VALUES
    ('00000000-0000-0000-0000-000000e17601', t_x, true, 'Team X', u_h);
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-000000e17601', u_h), ('00000000-0000-0000-0000-000000e17601', u_a),
    ('00000000-0000-0000-0000-000000e17601', u_p1), ('00000000-0000-0000-0000-000000e17601', u_p2);
  INSERT INTO public.golf_team_drills (id, team_id, name, area, minutes, created_by) VALUES
    ('00000000-0000-0000-0000-000000e17801', t_x, 'Ladder 3-6-9', 'putting', 20, u_h);
END;
$$;

-- Bodies used by the cases (readable by the test roles).
CREATE TEMP TABLE fx (k text PRIMARY KEY, j jsonb NOT NULL);
GRANT SELECT ON fx TO authenticated, anon;
INSERT INTO fx (k, j) VALUES
('ok', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17301","00000000-0000-0000-0000-000000e17302"],"groups":[],
  "variants":{"main":{"blocks":[
    {"id":"b1","kind":"team","title":"Putting ladder","len":30,"coach":"00000000-0000-0000-0000-000000e17201","note":"","place":"Green",
     "drill":{"src":"team","id":"00000000-0000-0000-0000-000000e17801"}},
    {"id":"b2","kind":"own","title":"Own work","len":30,"coach":null,"note":"","place":"Range",
     "lines":{"00000000-0000-0000-0000-000000e17301":"Wedges 50 to 90"}}]},"rain":null}}'),
('ok2', '{"v":2,"focus":"Wedges","notes":"","place":"","arrivalBufferMin":15,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17301","00000000-0000-0000-0000-000000e17302"],"groups":[],
  "variants":{"main":{"blocks":[
    {"id":"b1","kind":"team","title":"Putting ladder","len":40,"coach":"00000000-0000-0000-0000-000000e17201","note":"","place":"Green",
     "drill":{"src":"team","id":"00000000-0000-0000-0000-000000e17801"}},
    {"id":"b2","kind":"own","title":"Own work","len":30,"coach":null,"note":"","place":"Range",
     "lines":{"00000000-0000-0000-0000-000000e17301":"Wedges 50 to 90"}}]},"rain":null}}'),
('other_team_player', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17303"],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,"coach":null,"note":"","place":"","drill":null}]},"rain":null}}'),
('other_team_coach', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,"coach":"00000000-0000-0000-0000-000000e17203","note":"","place":"","drill":null}]},"rain":null}}'),
('v1', '{"v":1,"blocks":[]}'),
('bad_len', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":"abc","coach":null,"note":"","place":"","drill":null}]},"rain":null}}'),
('empty', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[]},"rain":null}}'),
('solo_p2', '{"v":2,"focus":"Missed Thursday","notes":"","place":"","arrivalBufferMin":0,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17302"],"groups":[],
  "variants":{"main":{"blocks":[{"id":"m1","kind":"team","title":"Putting ladder","len":30,"coach":null,"note":"","place":"Green","drill":null}]},"rain":null}}'),
('tpl_ok', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,"coach":null,"note":"","place":"","drill":null}]},"rain":null}}'),
('tpl_people', '{"v":2,"players":["00000000-0000-0000-0000-000000e17301"],"groups":[],"variants":{"main":{"blocks":[]},"rain":null}}'),
('tpl_coach', '{"v":2,"players":[],"groups":[],"variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,
  "coach":"00000000-0000-0000-0000-000000e17201","note":"","place":"","drill":null}]},"rain":null}}');

-- 1. Save: create, version check, refusals -------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT lives_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17501', NULL, NULL, NULL, 'blocks',
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'a head coach creates the plan for a practice event on first save');
RESET role;
UPDATE public.golf_practice_plans SET id = '00000000-0000-0000-0000-000000e17701'
  WHERE event_id = '00000000-0000-0000-0000-000000e17501';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT is((SELECT version FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 1,
  'a new plan starts at version 1');
SELECT is((SELECT title FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 'Thursday practice',
  'a new plan takes the event title');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 5, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_stale', 'a save with an old version is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17501', NULL, NULL, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_stale', 'a second first-save on the same event is refused');
SELECT lives_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 1, NULL, 'groups',
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'a save with the current version succeeds');
SELECT throws_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17502', NULL, NULL, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_all_day', 'an all-day practice cannot hold a plan');
SELECT throws_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17503', NULL, NULL, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_not_practice', 'only a practice event can hold a plan');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'other_team_player'))$$, 'P0001', 'practice_plan_player_not_on_team', 'a player from another team is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'other_team_coach'))$$, 'P0001', 'practice_plan_coach_not_on_staff', 'a coach not on the staff is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'v1'))$$, 'P0001', 'practice_plan_body_version', 'a body that is not version 2 is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'bad_len'))$$, 'P0001', 'practice_plan_block', 'a block length that is not a whole number is refused before any cast');
SELECT throws_ok($$INSERT INTO public.golf_practice_plans (team_id, event_id, title, body, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', '00000000-0000-0000-0000-000000e17503', 'x', '{}', '00000000-0000-0000-0000-000000e17101')$$,
  '42501', NULL, 'a coach cannot insert a plan directly');

-- 2. Assistant rights, other-team coach ----------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17102","role":"authenticated"}';
SELECT lives_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, 'drills',
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'an assistant coach edits the plan (owner call 15: any coach of the team)');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17103","role":"authenticated"}';
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 3, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, '42501', 'practice_plan_forbidden', 'a coach of another team cannot save it');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 0,
  'a coach of another team cannot read it');
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 3, '[]', true)$$,
  '42501', 'practice_plan_forbidden', 'a coach of another team cannot publish it');

-- 3. Before publish, players see nothing ---------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plans), 0, 'a player never reads the plans table (drafts)');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions), 0, 'a player reads no version before publish');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 3, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, '42501', 'practice_plan_forbidden', 'a player cannot save a plan');

-- 4. Publish -------------------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 3, '{"x":1}', true)$$,
  'P0001', 'practice_plan_changes', 'the changes list must be an array');
SELECT is((SELECT published_version FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 3, '[]', true)), 1,
  'the first publish makes version 1');
SELECT is((SELECT status || ':' || version FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'),
  'published:4', 'publish marks the plan published and bumps the draft version');
SELECT is((SELECT count(*)::int FROM public.golf_documents
  WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701' AND file_url IS NULL AND is_public
    AND uploaded_by = '00000000-0000-0000-0000-000000e17101' AND folder = 'Practice plans'), 1,
  'publish files one public plan row in Documents, with no file');

-- 4b. Recipients (service-role helper, asserted as the test owner) -------------------------------
RESET role;
SELECT is(jsonb_array_length(public.golf_practice_plan_recipients('00000000-0000-0000-0000-000000e17411',
  public.golf_practice_plan_public_body((SELECT j FROM fx WHERE k = 'ok'), 'main'), '00000000-0000-0000-0000-000000e17101')), 2,
  'a publish by H tells the two players and not H, though H is assigned to a block');
SELECT ok(public.golf_practice_plan_recipients('00000000-0000-0000-0000-000000e17411',
  public.golf_practice_plan_public_body((SELECT j FROM fx WHERE k = 'ok'), 'main'), '00000000-0000-0000-0000-000000e17102')
  @> '[{"role":"coach","user_id":"00000000-0000-0000-0000-000000e17101"}]'::jsonb,
  'a publish by the assistant tells H, who is assigned to a block (owner call 13)');
SELECT ok(NOT jsonb_path_exists(public.golf_practice_plan_public_body((SELECT j FROM fx WHERE k = 'ok'), 'main'), 'lax $.**.lines'),
  'the public body carries no own-work lines');
SELECT ok(NOT has_function_privilege('authenticated', 'public.golf_practice_plan_recipients(uuid, jsonb, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.golf_practice_plan_check_body(uuid, jsonb, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.golf_practice_plan_public_body(jsonb, text)', 'EXECUTE'),
  'the three helper functions are not callable by signed-in users');

-- 5. What players read after publish -------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions
  WHERE plan_id = '00000000-0000-0000-0000-000000e17701' AND is_live), 1, 'a player reads the live version');
SELECT ok((SELECT NOT jsonb_path_exists(body, 'lax $.**.lines') AND body -> 'drills' ? 'team:00000000-0000-0000-0000-000000e17801'
  FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17701' AND is_live),
  'the live version has no own-work lines and carries the frozen drill card');
SELECT is((SELECT line FROM public.golf_practice_plan_lines WHERE plan_id = '00000000-0000-0000-0000-000000e17701'),
  'Wedges 50 to 90', 'a player reads their own own-work line');
SELECT is((SELECT count(*)::int FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'), 1,
  'a player sees the plan row in Documents while it is public');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'published', 'the chat card reads Published');
SELECT lives_ok($$SELECT public.golf_practice_plan_record_open('00000000-0000-0000-0000-000000e17701')$$, 'a player records an open');
SELECT lives_ok($$SELECT public.golf_practice_plan_record_open('00000000-0000-0000-0000-000000e17701')$$,
  'recording an open twice is harmless');
SELECT throws_ok($$INSERT INTO public.golf_practice_plan_opens (plan_id, player_id, team_id, version)
  VALUES ('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17302', '00000000-0000-0000-0000-000000e17411', 1)$$,
  '42501', NULL, 'a player cannot write an open directly');
SELECT throws_ok($$UPDATE public.golf_practice_plan_versions SET title = 'x' WHERE plan_id = '00000000-0000-0000-0000-000000e17701'$$,
  '42501', NULL, 'a player cannot change a version');
SELECT throws_ok($$DELETE FROM public.golf_practice_plan_lines$$, '42501', NULL, 'a player cannot delete lines');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17105","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_lines), 0, 'another player cannot read P1''s own-work line');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_opens), 0, 'a player cannot read Seen by');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17106","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions), 0, 'a player on another team reads no version');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])), 0,
  'a player on another team gets no card state');
SELECT lives_ok($$SELECT public.golf_practice_plan_record_open('00000000-0000-0000-0000-000000e17701')$$,
  'an open by someone who cannot read the plan is a quiet no-op');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_opens WHERE plan_id = '00000000-0000-0000-0000-000000e17701'), 1,
  'the coach sees one open: P1 once, and nothing from the other team''s player');

-- 6. Chat card -----------------------------------------------------------------------------------
RESET role;
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000e17602', '00000000-0000-0000-0000-000000e17601', '00000000-0000-0000-0000-000000e17101',
    'Practice plan: Thursday practice', 'practice', '{"plan_id":"00000000-0000-0000-0000-000000e17701","v":1}'),
  ('00000000-0000-0000-0000-000000e17603', '00000000-0000-0000-0000-000000e17601', '00000000-0000-0000-0000-000000e17101',
    'See you at 2', 'text', NULL);
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT public.golf_practice_plan_set_chat_message('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17603')$$,
  'P0001', 'practice_plan_card', 'only a practice card for this plan can be recorded');
SELECT lives_ok($$SELECT public.golf_practice_plan_set_chat_message('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17602')$$,
  'the publishing coach records the card');
SELECT is((SELECT version FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 4,
  'recording the card does not bump the draft version');

-- 7. Republish by the assistant ------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17102","role":"authenticated"}';
SELECT lives_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 4, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok2'))$$, 'an edit after publish saves');
SELECT ok((SELECT edited_after_publish FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'),
  'an edit after publish is flagged as not yet published');
SELECT is((SELECT published_version FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 5,
  '[{"kind":"block_time","block":"b1"}]', true)), 2, 'republish makes version 2');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17701' AND is_live), 1,
  'exactly one version is live after republish');
SELECT is((SELECT uploaded_by FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'),
  '00000000-0000-0000-0000-000000e17101'::uuid, 'republish keeps the Documents row''s uploader and its single row');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'updated', 'the chat card reads Updated');

-- 8. Rain switch and cancelled event -------------------------------------------------------------
SELECT throws_ok($$SELECT public.golf_practice_plan_set_variant('00000000-0000-0000-0000-000000e17701', 6, 'rain')$$,
  'P0001', 'practice_plan_no_rain_layout', 'a plan with no rain layout cannot switch to it');
SELECT throws_ok($$SELECT public.golf_practice_plan_set_variant('00000000-0000-0000-0000-000000e17701', 6, 'snow')$$,
  'P0001', 'practice_plan_variant', 'only main and rain are layouts');
RESET role;
UPDATE public.golf_events SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-000000e17501';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 6, '[]', true)$$,
  'P0001', 'practice_plan_event_cancelled', 'a cancelled practice cannot be published');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'cancelled', 'the chat card reads Practice cancelled');
RESET role;
UPDATE public.golf_events SET status = 'scheduled' WHERE id = '00000000-0000-0000-0000-000000e17501';

-- 9. Take down -----------------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_take_down('00000000-0000-0000-0000-000000e17701', 5)$$,
  'P0001', 'practice_plan_stale', 'take down checks the version');
SELECT is((SELECT jsonb_array_length(recipients) FROM public.golf_practice_plan_take_down('00000000-0000-0000-0000-000000e17701', 6)), 2,
  'take down returns the live version''s players to tell');
SELECT is((SELECT count(*)::int FROM public.golf_documents
  WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701' AND NOT is_public), 1, 'take down hides the Documents row');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions), 0, 'after take down a player reads no version');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_lines), 0, 'after take down a player reads no own-work line');
SELECT is((SELECT count(*)::int FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'), 0,
  'after take down a player no longer sees the Documents row');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'taken_down', 'the chat card reads Taken down');

-- 10. Documents policies and CHECK ---------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.golf_documents (team_id, uploaded_by, title, file_url, practice_plan_id)
  VALUES ('00000000-0000-0000-0000-000000e17411', '00000000-0000-0000-0000-000000e17101', 'x', NULL, '00000000-0000-0000-0000-000000e17701')$$,
  '42501', NULL, 'a coach cannot insert a plan row in Documents directly');
SELECT lives_ok($$INSERT INTO public.golf_documents (team_id, uploaded_by, title, file_url)
  VALUES ('00000000-0000-0000-0000-000000e17411', '00000000-0000-0000-0000-000000e17101', 'Range rules', 'https://example.test/rules.pdf')$$,
  'a coach still uploads an ordinary file row');
RESET role;
SELECT throws_ok($$INSERT INTO public.golf_documents (team_id, title, file_url) VALUES ('00000000-0000-0000-0000-000000e17411', 'x', NULL)$$,
  '23514', NULL, 'a Documents row needs a file or a plan (source CHECK)');
SELECT throws_ok($$INSERT INTO public.golf_documents (team_id, title, file_url, practice_plan_id)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'x', 'https://example.test/a.pdf', '00000000-0000-0000-0000-000000e17701')$$,
  '23514', NULL, 'a Documents row cannot have both');

-- 11. Drill bank ---------------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', ' ladder 3-6-9 ', 'putting', 15, '00000000-0000-0000-0000-000000e17101')$$,
  '23505', NULL, 'drill names are unique per team among unarchived drills, ignoring case and spaces');
SELECT throws_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by, media_url)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Gate drill', 'putting', 15, '00000000-0000-0000-0000-000000e17101', 'http://example.test/v')$$,
  '23514', NULL, 'a drill media link must be https');
SELECT throws_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by, diagram)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Spiral', 'putting', 15, '00000000-0000-0000-0000-000000e17101', 'spiral')$$,
  '23514', NULL, 'a drill diagram is one of the presets');
SELECT throws_ok($$DELETE FROM public.golf_team_drills WHERE id = '00000000-0000-0000-0000-000000e17801'$$,
  '42501', NULL, 'drills are archived, never deleted');
SELECT lives_ok($$UPDATE public.golf_team_drills SET archived_at = now() WHERE id = '00000000-0000-0000-0000-000000e17801'$$,
  'a coach archives a drill');
SELECT lives_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Ladder 3-6-9', 'putting', 15, '00000000-0000-0000-0000-000000e17101')$$,
  'an archived name can be used again');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_team_drills), 0, 'players do not read the team drill bank (owner call 12)');

-- 12. Saved groups and templates -----------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.golf_practice_groups (team_id, name, player_ids, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Short game', ARRAY['00000000-0000-0000-0000-000000e17303']::uuid[], '00000000-0000-0000-0000-000000e17101')$$,
  '42501', NULL, 'a saved group holds only this team''s players');
SELECT lives_ok($$INSERT INTO public.golf_practice_groups (team_id, name, player_ids, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Short game', ARRAY['00000000-0000-0000-0000-000000e17301']::uuid[], '00000000-0000-0000-0000-000000e17101')$$,
  'a coach saves a group of their players');
SELECT lives_ok($$INSERT INTO public.golf_practice_templates (team_id, kind, name, body, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'session', 'Tuesday standard', (SELECT j FROM fx WHERE k = 'tpl_ok'), 20, '00000000-0000-0000-0000-000000e17101')$$,
  'a coach saves a session template with no people in it');
SELECT throws_ok($$INSERT INTO public.golf_practice_templates (team_id, kind, name, body, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'session', 'With players', (SELECT j FROM fx WHERE k = 'tpl_people'), 20, '00000000-0000-0000-0000-000000e17101')$$,
  '23514', NULL, 'a template cannot hold players');
SELECT throws_ok($$INSERT INTO public.golf_practice_templates (team_id, kind, name, body, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'block', 'With coach', (SELECT j FROM fx WHERE k = 'tpl_coach'), 20, '00000000-0000-0000-0000-000000e17101')$$,
  '23514', NULL, 'a template cannot hold an assigned coach');

-- 13. Make-ups -----------------------------------------------------------------------------------
SELECT throws_ok($$SELECT public.golf_practice_makeup_create('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17302',
  ((now() AT TIME ZONE 'Pacific/Honolulu')::date - 1), 'Make-up', (SELECT j FROM fx WHERE k = 'solo_p2'))$$,
  'P0001', 'practice_makeup_due', 'a make-up cannot be due before today on the team clock (trimmed zone)');
SELECT lives_ok($$SELECT public.golf_practice_makeup_create('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17302',
  ((now() AT TIME ZONE 'Pacific/Honolulu')::date + 2), 'Make-up: putting', (SELECT j FROM fx WHERE k = 'solo_p2'))$$,
  'a coach makes a make-up for one player of the team');
RESET role;
UPDATE public.golf_practice_plans SET id = '00000000-0000-0000-0000-000000e17702' WHERE kind = 'makeup'
  AND for_player_id = '00000000-0000-0000-0000-000000e17302';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT is((SELECT document_id FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17702', 1, '[]', true)), NULL::uuid,
  'publishing a make-up files nothing in Documents (owner call 9)');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17702'), 0,
  'another player cannot read someone''s make-up');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17105","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_my_makeups('00000000-0000-0000-0000-000000e17411')), 1,
  'the player sees their own make-up');
SELECT isnt((SELECT public.golf_practice_makeup_complete('00000000-0000-0000-0000-000000e17702', true)), NULL::timestamptz,
  'the player marks their make-up done');

-- 14. Anon, cascades, publication ----------------------------------------------------------------
RESET role;
SET LOCAL role TO anon;
SELECT throws_ok($$SELECT count(*) FROM public.golf_practice_plan_versions$$, '42501', NULL, 'anon cannot read versions');
RESET role;
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename IN ('golf_practice_plans', 'golf_practice_plan_versions', 'golf_practice_plan_lines', 'golf_practice_plan_opens')), 2,
  'plans and versions are in Realtime; lines and opens are not');
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17102","role":"authenticated"}';
SELECT lives_ok($$DELETE FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'$$,
  'any coach of the team may delete a plan');
RESET role;
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17701')
  + (SELECT count(*)::int FROM public.golf_practice_plan_lines WHERE plan_id = '00000000-0000-0000-0000-000000e17701')
  + (SELECT count(*)::int FROM public.golf_practice_plan_opens WHERE plan_id = '00000000-0000-0000-0000-000000e17701')
  + (SELECT count(*)::int FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'), 0,
  'deleting a plan removes its versions, lines, opens and Documents row');
SELECT is((SELECT source_plan_id FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17702'), NULL::uuid,
  'a make-up outlives the plan it was made from');

SELECT * FROM finish();
ROLLBACK;
