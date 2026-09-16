-- One-Tap Live Round evidence tables: access, idempotency and the privacy
-- contract (migration 20260916_peek_n_peak_one_tap.sql).
--
-- Three tables — golf_shot_anchors, golf_penalty_events,
-- golf_round_course_bindings — hold metre-accurate ball positions for a round.
-- They deliberately do NOT define their own auth domain: read follows the
-- round via public.can_read_golf_round, write is owner-only via
-- public.owns_golf_round. This suite is BEHAVIORAL: it seeds two
-- organisations, and inside the first two teams with different coaching staff,
-- so it can tell the cases the helpers must keep apart.
--
-- READ (inherited from golf_rounds' SELECT policies, on purpose):
--   * the player themself                       -> CAN read
--   * a coach who staffs the round's team        -> CAN read
--   * an ACTIVE TEAMMATE on that team            -> CAN read
--   * a same-org coach who does NOT staff it     -> CANNOT read
--   * a coach in a different organisation        -> CANNOT read
--   * an unrelated player                        -> CANNOT read
--
-- The teammate case is asserted rather than assumed. It is the widest audience
-- these tables expose and the one most likely to be "tidied away" or, worse,
-- widened further; pinning it makes either change visible in review.
--
-- WRITE (owner-only — strictly narrower than read):
--   * the player themself                       -> CAN insert/update
--   * a coach who staffs the team                -> CANNOT, despite CAN read
--   * NOBODY, owner included, can DELETE         -> the privilege is revoked
--
-- IDEMPOTENCY: the sync outbox retries by re-sending the same row, which
-- PostgREST executes as INSERT ... ON CONFLICT (id) DO UPDATE. That needs the
-- INSERT policy's WITH CHECK *and* the UPDATE policy's USING *and* WITH CHECK.
-- An UPDATE policy with USING only would pass the first sync and fail every
-- retry, which no client-side test can catch. The second-upsert assertions
-- below are that test.
--
-- LIFECYCLE: golf_holes / golf_shots raise 55000 for a write against a
-- COMPLETED round. Anchors must not: an offline flush that lands after the
-- round is submitted has to persist, or the outbox loses marks. The
-- completed-round assertion pins that difference deliberately.
--
-- PRIVACY (§71): the anchor table's column set is asserted exactly. A raw GNSS
-- sample window must never gain a column here, and "assert the whole set"
-- fails on any new column rather than only on names someone thought to ban.

BEGIN;
\ir _helpers.sql

SELECT plan(42);

-- ============================================================================
-- Seed as service_role (RLS bypassed for setup).
-- ============================================================================
DO $$
DECLARE
  v_org_1      uuid := '00000000-0000-0000-0000-00000000e001';
  v_org_2      uuid := '00000000-0000-0000-0000-00000000e002';

  -- org 1, team X: the player, an active teammate, and the staffing coach
  v_userc_x    uuid := '00000000-0000-0000-0000-00000000e011';
  v_coach_x    uuid := '00000000-0000-0000-0000-00000000e012';
  v_team_x     uuid := '00000000-0000-0000-0000-00000000e013';
  v_userp      uuid := '00000000-0000-0000-0000-00000000e014';
  v_player     uuid := '00000000-0000-0000-0000-00000000e015';
  v_usermate   uuid := '00000000-0000-0000-0000-00000000e016';
  v_mate       uuid := '00000000-0000-0000-0000-00000000e017';

  -- org 1, team Y: a coach in the SAME organisation, different team
  v_userc_y    uuid := '00000000-0000-0000-0000-00000000e021';
  v_coach_y    uuid := '00000000-0000-0000-0000-00000000e022';
  v_team_y     uuid := '00000000-0000-0000-0000-00000000e023';

  -- org 2: an unrelated coach and an unrelated player
  v_userc_z    uuid := '00000000-0000-0000-0000-00000000e031';
  v_coach_z    uuid := '00000000-0000-0000-0000-00000000e032';
  v_team_z     uuid := '00000000-0000-0000-0000-00000000e033';
  v_usero      uuid := '00000000-0000-0000-0000-00000000e034';
  v_other      uuid := '00000000-0000-0000-0000-00000000e035';

  v_round      uuid := '00000000-0000-0000-0000-00000000e041';
  v_round_done uuid := '00000000-0000-0000-0000-00000000e042';
  v_round_other uuid := '00000000-0000-0000-0000-00000000e043';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_userc_x,  'onetap-coach-x@helm.test',  'authenticated'),
    (v_userc_y,  'onetap-coach-y@helm.test',  'authenticated'),
    (v_userc_z,  'onetap-coach-z@helm.test',  'authenticated'),
    (v_userp,    'onetap-player@helm.test',   'authenticated'),
    (v_usermate, 'onetap-mate@helm.test',     'authenticated'),
    (v_usero,    'onetap-other@helm.test',    'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (v_userc_x,  'onetap-coach-x@helm.test',  'coach'),
    (v_userc_y,  'onetap-coach-y@helm.test',  'coach'),
    (v_userc_z,  'onetap-coach-z@helm.test',  'coach'),
    (v_userp,    'onetap-player@helm.test',   'player'),
    (v_usermate, 'onetap-mate@helm.test',     'player'),
    (v_usero,    'onetap-other@helm.test',    'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_1, 'pgtap-onetap-org-1', 'college'),
    (v_org_2, 'pgtap-onetap-org-2', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (v_coach_x, v_userc_x, v_org_1),
    (v_coach_y, v_userc_y, v_org_1),
    (v_coach_z, v_userc_z, v_org_2)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player, v_userp),
    (v_mate,   v_usermate),
    (v_other,  v_usero)
  ON CONFLICT DO NOTHING;

  -- golf_teams_org_gender_uidx is UNIQUE (organization_id, gender), so the two
  -- teams inside org 1 have to differ on gender to coexist.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (v_team_x, 'pgtap-onetap-team-X', 'PGOTX1', v_org_1, 'mens'),
    (v_team_y, 'pgtap-onetap-team-Y', 'PGOTY1', v_org_1, 'womens'),
    (v_team_z, 'pgtap-onetap-team-Z', 'PGOTZ1', v_org_2, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_x, v_coach_x, 'head_coach', true),
    (v_team_y, v_coach_y, 'head_coach', true),
    (v_team_z, v_coach_z, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  -- The player and the teammate are both on team X; the unrelated player is on
  -- team Z in the other organisation.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_x, v_player, 'active'),
    (v_team_x, v_mate,   'active'),
    (v_team_z, v_other,  'active')
  ON CONFLICT DO NOTHING;

  -- Completed rows are normally created only by the SECURITY DEFINER submit
  -- RPC. The fixture runs as that function owner, so opt into its
  -- transaction-local guard marker instead of weakening the production guard.
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);

  INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status) VALUES
    (v_round,       v_player, v_team_x, CURRENT_DATE, 'in_progress'),
    (v_round_done,  v_player, v_team_x, CURRENT_DATE, 'completed'),
    (v_round_other, v_other,  v_team_z, CURRENT_DATE, 'in_progress')
  ON CONFLICT DO NOTHING;

  -- One anchor and one penalty already on the round, seeded past RLS, so the
  -- read assertions below have something to see that the reader did not write.
  INSERT INTO public.golf_shot_anchors (
    id, round_id, course_id, site_id, hole_key, hole_id, sequence,
    tap_at, finalized_at, provisional, lon, lat, alt_m, e_m, n_m, u_m,
    cov_ee, cov_en, cov_ne, cov_nn, sigma_m, reported_accuracy_median_m,
    calibrated_uncertainty_m, capture_motion, lie_posterior, primary_lie,
    confidence, geometry_version, schema_version
  ) VALUES (
    'seed-anchor-1', v_round, 'peek-n-peak-upper', 'osm-way-136097904',
    'peek-n-peak-upper-07', 7, 0, now(), now(), false,
    -79.744, 42.06, 512.5, 12.5, -4.25, 512.5,
    4, 0.5, 0.5, 9, 3, 4.5, 4.5, 'stationary',
    '[{"featureId":"f1","lieClass":"fairway","p":0.92}]'::jsonb, 'fairway',
    'HIGH', 'g-hash', 2
  ) ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_penalty_events (
    id, round_id, course_id, site_id, hole_key, hole_id, occurred_at,
    strokes, kind, related_anchor_id, schema_version
  ) VALUES (
    'seed-penalty-1', v_round, 'peek-n-peak-upper', 'osm-way-136097904',
    'peek-n-peak-upper-07', 7, now(), 1, 'penalty_area', 'seed-anchor-1', 1
  ) ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_round_course_bindings (
    round_id, course_id, site_id, geometry_version, one_tap_mode
  ) VALUES (
    v_round, 'peek-n-peak-upper', 'osm-way-136097904', 'g-hash', true
  ) ON CONFLICT DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- Row-count probes. A blocked UPDATE under RLS is not an error — the USING qual
-- matches nothing and the statement reports zero rows. Counting is the only way
-- to tell "policy refused" from "policy allowed", and it cannot be done inline:
-- a data-modifying CTE is illegal inside the scalar subquery pgTAP's is() takes.
-- SECURITY INVOKER (the default) on purpose, so the policies still apply.
-- ----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.tombstone_anchor(p_id text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE public.golf_shot_anchors SET deleted_at = now() WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION pg_temp.tombstone_penalty(p_id text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE public.golf_penalty_events SET deleted_at = now() WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ============================================================================
-- Structure, privileges and the privacy contract (identity-independent).
-- ============================================================================
SELECT is(
  (SELECT bool_and(c.relrowsecurity)
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('golf_shot_anchors', 'golf_penalty_events', 'golf_round_course_bindings')),
  true,
  'RLS is enabled on all three One-Tap evidence tables'
);

-- The whole column set, asserted exactly. This is the privacy contract as a
-- schema test: any new column — a raw sample window above all — fails here.
SELECT is(
  (SELECT array_agg(attname::text ORDER BY attname)
   FROM pg_attribute
   WHERE attrelid = 'public.golf_shot_anchors'::regclass AND attnum > 0 AND NOT attisdropped),
  ARRAY[
    'alt_m', 'calibrated_uncertainty_m', 'capture_motion', 'classification',
    'confidence', 'course_id', 'cov_ee', 'cov_en', 'cov_ne', 'cov_nn',
    'created_at', 'deleted_at', 'e_m', 'estimator_summary', 'finalized_at',
    'geometry_version', 'hole_id', 'hole_key', 'id', 'lat', 'lie_posterior',
    'lon', 'n_m', 'primary_lie', 'provisional', 'reported_accuracy_median_m',
    'round_id', 'schema_version', 'sequence', 'sigma_m', 'site_id', 'tap_at',
    'terminal', 'terminal_method', 'terrain_aspect_degrees',
    'terrain_elevation_m', 'terrain_slope_degrees', 'terrain_version',
    'u_m', 'updated_at'
  ],
  'golf_shot_anchors carries exactly the privacy-minimized columns — no raw GNSS sample window'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_attribute
   WHERE attrelid = 'public.golf_shot_anchors'::regclass AND attnum > 0 AND NOT attisdropped
     AND (attname ~ 'raw|sample|breadcrumb|track|heading|speed')),
  0,
  'no raw-sample, breadcrumb or heading/speed trace column exists on golf_shot_anchors'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_policy p
   JOIN pg_class c ON c.oid = p.polrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('golf_shot_anchors', 'golf_penalty_events', 'golf_round_course_bindings')
     AND p.polcmd = 'd'),
  0,
  'no DELETE policy exists on any One-Tap evidence table — deletes are tombstones'
);

SELECT is(
  (SELECT bool_or(has_table_privilege('authenticated', t, 'DELETE'))
   FROM unnest(ARRAY['public.golf_shot_anchors', 'public.golf_penalty_events', 'public.golf_round_course_bindings']) AS t),
  false,
  'authenticated holds no DELETE privilege, so a future permissive policy still cannot hard-delete'
);

-- TRUNCATE ignores RLS completely, so the tombstone contract is only true at
-- the privilege level if this is revoked too. Supabase grants it by default.
SELECT is(
  (SELECT bool_or(has_table_privilege('authenticated', t, 'TRUNCATE'))
   FROM unnest(ARRAY['public.golf_shot_anchors', 'public.golf_penalty_events', 'public.golf_round_course_bindings']) AS t),
  false,
  'authenticated holds no TRUNCATE privilege — RLS-bypassing wipe is not available'
);

SELECT is(
  (SELECT bool_and(has_table_privilege('service_role', t, 'SELECT') AND has_table_privilege('service_role', t, 'INSERT'))
   FROM unnest(ARRAY['public.golf_shot_anchors', 'public.golf_penalty_events', 'public.golf_round_course_bindings']) AS t),
  true,
  'service_role keeps read/write, so a server-side backfill or adapter still works'
);

SELECT is(
  (SELECT bool_or(has_table_privilege('anon', t, 'SELECT'))
   FROM unnest(ARRAY['public.golf_shot_anchors', 'public.golf_penalty_events', 'public.golf_round_course_bindings']) AS t),
  false,
  'anon cannot read One-Tap evidence at all'
);

SELECT is(
  (SELECT bool_and(p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig))
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('can_read_golf_round', 'owns_golf_round')),
  true,
  'both One-Tap RLS helpers are SECURITY DEFINER with a pinned search_path'
);

SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('can_read_golf_round', 'owns_golf_round')),
  false,
  'neither One-Tap RLS helper is executable by anon'
);

-- ============================================================================
-- The player owns the round: reads, writes, retries — but never deletes.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e014", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'seed-anchor-1'),
  1,
  'player CAN read their own anchors'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_penalty_events WHERE id = 'seed-penalty-1'),
  1,
  'player CAN read their own penalty events'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_round_course_bindings
   WHERE round_id = '00000000-0000-0000-0000-00000000e041'),
  1,
  'player CAN read their own round-course binding'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_shot_anchors (
      id, round_id, course_id, site_id, hole_key, hole_id, sequence,
      tap_at, finalized_at, provisional, lon, lat, e_m, n_m, u_m,
      cov_ee, cov_en, cov_ne, cov_nn, sigma_m, reported_accuracy_median_m,
      calibrated_uncertainty_m, capture_motion, lie_posterior, primary_lie,
      confidence, geometry_version, schema_version
    ) VALUES (
      'sync-anchor-1', '00000000-0000-0000-0000-00000000e041', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-07', 7, 1, now(), now(), false,
      -79.745, 42.061, 40.0, 10.0, 512.0, 4, 0, 0, 4, 2, 3, 3, 'stationary',
      '[]'::jsonb, 'green', 'HIGH', 'g-hash', 2
    )
    ON CONFLICT (id) DO UPDATE SET
      e_m = excluded.e_m, n_m = excluded.n_m, sigma_m = excluded.sigma_m,
      deleted_at = excluded.deleted_at$$,
  'player CAN upsert an anchor onto their own round (first sync)'
);

-- THE retry assertion. PostgREST runs the retry as the same statement, which
-- now takes the DO UPDATE branch: it needs the UPDATE policy's USING and WITH
-- CHECK as well as the INSERT policy's WITH CHECK.
SELECT lives_ok(
  $$INSERT INTO public.golf_shot_anchors (
      id, round_id, course_id, site_id, hole_key, hole_id, sequence,
      tap_at, finalized_at, provisional, lon, lat, e_m, n_m, u_m,
      cov_ee, cov_en, cov_ne, cov_nn, sigma_m, reported_accuracy_median_m,
      calibrated_uncertainty_m, capture_motion, lie_posterior, primary_lie,
      confidence, geometry_version, schema_version
    ) VALUES (
      'sync-anchor-1', '00000000-0000-0000-0000-00000000e041', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-07', 7, 1, now(), now(), false,
      -79.745, 42.061, 41.0, 11.0, 512.0, 4, 0, 0, 4, 2, 3, 3, 'stationary',
      '[]'::jsonb, 'green', 'HIGH', 'g-hash', 2
    )
    ON CONFLICT (id) DO UPDATE SET
      e_m = excluded.e_m, n_m = excluded.n_m, sigma_m = excluded.sigma_m,
      deleted_at = excluded.deleted_at$$,
  'the SAME anchor sent a second time upserts instead of failing — the retry path'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'sync-anchor-1'),
  1,
  'two sends of one anchor id leave exactly one row (logical exactly-once)'
);

SELECT is(
  (SELECT e_m FROM public.golf_shot_anchors WHERE id = 'sync-anchor-1'),
  41.0::double precision,
  'the second send wins: the row converges on the latest payload'
);

SELECT is(
  pg_temp.tombstone_anchor('sync-anchor-1'),
  1,
  'player CAN tombstone their own anchor (Undo synchronizes as an update)'
);

SELECT throws_ok(
  $$DELETE FROM public.golf_shot_anchors WHERE id = 'sync-anchor-1'$$,
  '42501',
  NULL,
  'even the owner CANNOT hard-delete an anchor — the DELETE privilege is revoked'
);

SELECT throws_ok(
  $$DELETE FROM public.golf_penalty_events WHERE id = 'seed-penalty-1'$$,
  '42501',
  NULL,
  'even the owner CANNOT hard-delete a penalty event'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_penalty_events (
      id, round_id, course_id, site_id, hole_key, hole_id, occurred_at,
      strokes, kind, related_anchor_id, schema_version
    ) VALUES (
      'sync-penalty-1', '00000000-0000-0000-0000-00000000e041', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-07', 7, now(), 1, 'lost_ball', NULL, 1
    )
    ON CONFLICT (id) DO UPDATE SET deleted_at = excluded.deleted_at$$,
  'player CAN upsert a penalty event onto their own round'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_penalty_events (
      id, round_id, course_id, site_id, hole_key, hole_id, occurred_at,
      strokes, kind, related_anchor_id, schema_version
    ) VALUES (
      'sync-penalty-1', '00000000-0000-0000-0000-00000000e041', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-07', 7, now(), 1, 'lost_ball', NULL, 1
    )
    ON CONFLICT (id) DO UPDATE SET deleted_at = excluded.deleted_at$$,
  'the SAME penalty sent a second time upserts instead of failing'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_round_course_bindings (
      round_id, course_id, site_id, geometry_version, one_tap_mode
    ) VALUES (
      '00000000-0000-0000-0000-00000000e041', 'peek-n-peak-upper',
      'osm-way-136097904', 'g-hash-2', true
    )
    ON CONFLICT (round_id) DO UPDATE SET geometry_version = excluded.geometry_version$$,
  'player CAN upsert the round-course binding twice (idempotent on round_id)'
);

-- A late flush lands after the round is submitted. golf_holes / golf_shots
-- would raise 55000 here; anchors are evidence, not score history, and must
-- still persist or the offline outbox loses marks.
SELECT lives_ok(
  $$INSERT INTO public.golf_shot_anchors (
      id, round_id, course_id, site_id, hole_key, hole_id, sequence,
      tap_at, finalized_at, provisional, lon, lat, e_m, n_m, u_m,
      cov_ee, cov_en, cov_ne, cov_nn, sigma_m, reported_accuracy_median_m,
      calibrated_uncertainty_m, capture_motion, lie_posterior, primary_lie,
      confidence, geometry_version, schema_version
    ) VALUES (
      'late-anchor-1', '00000000-0000-0000-0000-00000000e042', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-09', 9, 0, now(), now(), false,
      -79.746, 42.062, 5.0, 5.0, 511.0, 4, 0, 0, 4, 2, 3, 3, 'stationary',
      '[]'::jsonb, 'tee', 'HIGH', 'g-hash', 2
    )$$,
  'an offline flush that lands AFTER the round is completed still persists'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors
   WHERE round_id = '00000000-0000-0000-0000-00000000e043'),
  0,
  'player CANNOT read another player''s anchors'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_shot_anchors (
      id, round_id, course_id, site_id, hole_key, hole_id, sequence,
      tap_at, provisional, lon, lat, e_m, n_m, u_m,
      cov_ee, cov_en, cov_ne, cov_nn, sigma_m, reported_accuracy_median_m,
      calibrated_uncertainty_m, capture_motion, lie_posterior, primary_lie,
      confidence, geometry_version, schema_version
    ) VALUES (
      'forged-anchor-1', '00000000-0000-0000-0000-00000000e043', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-01', 1, 0, now(), false,
      -79.7, 42.0, 0, 0, 0, 4, 0, 0, 4, 2, 3, 3, 'stationary',
      '[]'::jsonb, 'tee', 'HIGH', 'g-hash', 2
    )$$,
  '42501',
  NULL,
  'player CANNOT write an anchor onto another player''s round'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- The coach who staffs the round's team: reads yes, writes no.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e011", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'seed-anchor-1'),
  1,
  'staffing coach CAN read their player''s anchors'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_penalty_events WHERE id = 'seed-penalty-1'),
  1,
  'staffing coach CAN read their player''s penalty events'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_round_course_bindings
   WHERE round_id = '00000000-0000-0000-0000-00000000e041'),
  1,
  'staffing coach CAN read the round-course binding'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_shot_anchors (
      id, round_id, course_id, site_id, hole_key, hole_id, sequence,
      tap_at, provisional, lon, lat, e_m, n_m, u_m,
      cov_ee, cov_en, cov_ne, cov_nn, sigma_m, reported_accuracy_median_m,
      calibrated_uncertainty_m, capture_motion, lie_posterior, primary_lie,
      confidence, geometry_version, schema_version
    ) VALUES (
      'coach-anchor-1', '00000000-0000-0000-0000-00000000e041', 'peek-n-peak-upper',
      'osm-way-136097904', 'peek-n-peak-upper-07', 7, 9, now(), false,
      -79.7, 42.0, 0, 0, 0, 4, 0, 0, 4, 2, 3, 3, 'stationary',
      '[]'::jsonb, 'tee', 'HIGH', 'g-hash', 2
    )$$,
  '42501',
  NULL,
  'staffing coach CANNOT insert an anchor for their player, despite CAN read'
);

-- No error for UPDATE: the USING qual matches nothing and the statement
-- succeeds having touched zero rows. Asserting 0 is the only way to catch a
-- widened qual — this is the assertion that fails if the write policies are
-- ever pointed at the read helper.
SELECT is(
  pg_temp.tombstone_anchor('seed-anchor-1'),
  0,
  'staffing coach CANNOT tombstone their player''s anchor'
);

SELECT is(
  pg_temp.tombstone_penalty('seed-penalty-1'),
  0,
  'staffing coach CANNOT tombstone their player''s penalty event'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- An active teammate on the same team: CAN read. Inherited from the round.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e016", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'seed-anchor-1'),
  1,
  'active teammate CAN read the round''s anchors (inherited golf_rounds_select branch)'
);

SELECT is(
  pg_temp.tombstone_anchor('seed-anchor-1'),
  0,
  'active teammate CANNOT write them'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Same organisation, different team — must NOT read.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e021", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'seed-anchor-1'),
  0,
  'same-org coach who does NOT staff the team CANNOT read anchors'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_penalty_events WHERE id = 'seed-penalty-1'),
  0,
  'same-org coach who does NOT staff the team CANNOT read penalty events'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_round_course_bindings
   WHERE round_id = '00000000-0000-0000-0000-00000000e041'),
  0,
  'same-org coach who does NOT staff the team CANNOT read the binding'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Different organisation — must NOT read.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e031", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'seed-anchor-1'),
  0,
  'cross-org coach CANNOT read anchors'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_penalty_events WHERE id = 'seed-penalty-1'),
  0,
  'cross-org coach CANNOT read penalty events'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- An unrelated player in another organisation — must NOT read.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e034", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors WHERE id = 'seed-anchor-1'),
  0,
  'an unrelated player CANNOT read another round''s anchors'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_round_course_bindings
   WHERE round_id = '00000000-0000-0000-0000-00000000e041'),
  0,
  'an unrelated player CANNOT read another round''s binding'
);

RESET role;
RESET request.jwt.claims;

-- The owner can still see the row the coach failed to change, so every
-- "CANNOT write" above was the policy and not a missing row.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e014", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_shot_anchors
   WHERE id = 'seed-anchor-1' AND deleted_at IS NULL),
  1,
  'the seeded anchor survived every blocked write and is still live for its owner'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
