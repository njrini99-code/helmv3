-- pgTAP contracts for helm_lifting_sync_org_athletes' identity refresh
-- (supabase/migrations/20260729000300_helm_lifting_sync_refreshes_identity.sql).
--
-- The bug: the function upserted with `ON CONFLICT ... DO NOTHING`, so every
-- column was fixed at the first write and never revisited.
--
-- The NULL user_ids do NOT come from the RPC — baseball_players.user_id is
-- NOT NULL, so its SELECT can only copy a real id. (An earlier version of
-- this suite built a fixture on the opposite assumption and CI rejected it
-- outright: "null value in column user_id violates not-null constraint".)
-- They come from writes that BYPASS the RPC — the demo seed inserts athlete
-- rows directly with user_id: null
-- (scripts/seed-baseball-lifting-demo.ts:311). Under DO NOTHING those NULLs
-- were permanent, because the one mechanism that could have supplied the id
-- declined to write it, and /lifting/dashboard's athlete-self gate resolves
-- the viewer through that column.
--
-- These are BEHAVIOURAL: real rows, a real second sync, and assertions on what
-- actually changed. The two that matter most are the negative ones — a sync
-- must not resurrect a deactivated athlete, and must not blank an established
-- link — because both are silent, and one of them would undo the roster
-- deactivation propagation added the same night.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ============================================================================
-- Fixtures. Ids in the 0000000d* range; checked against every sibling suite
-- for collisions.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000d0001', 'Lift Sync Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000d0101', '00000000-0000-0000-0000-0000000d0001',
            'Lift Sync Baseball', 'college', 'DLIFT001')
  ON CONFLICT DO NOTHING;

  -- The coach who is allowed to sync.
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d0201', 'liftcoach@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d0201', 'liftcoach@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.helm_lifting_coaches (id, user_id, organization_id, email, status)
    VALUES ('00000000-0000-0000-0000-0000000d0301',
            '00000000-0000-0000-0000-0000000d0201',
            '00000000-0000-0000-0000-0000000d0001',
            'liftcoach@helm.test', 'active')
  ON CONFLICT DO NOTHING;

  -- Player A: a real, linked player whose Lift Lab row was written DIRECTLY
  -- with user_id NULL, exactly as the demo seed does. This is the state that
  -- used to be unrecoverable.
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d0402', 'nowlinked@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d0402', 'nowlinked@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_players (id, user_id, first_name, last_name, primary_position, player_type)
    VALUES ('00000000-0000-0000-0000-0000000d0401', '00000000-0000-0000-0000-0000000d0402',
            'Unlinked', 'Player', 'SS', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000d0101', '00000000-0000-0000-0000-0000000d0401', 'active')
  ON CONFLICT DO NOTHING;

  -- The bypassing write. Pre-creating the athlete row with a NULL link is what
  -- the seed script does; the sync below must repair it.
  INSERT INTO public.helm_lifting_athletes
    (organization_id, sport, sport_player_id, user_id, first_name, last_name, is_active)
  VALUES ('00000000-0000-0000-0000-0000000d0001', 'baseball',
          '00000000-0000-0000-0000-0000000d0401', NULL, 'Stale', 'Name', true)
  ON CONFLICT DO NOTHING;

  -- Player B: already linked, and CUT from the roster in Lift Lab.
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d0501', 'cutplayer@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d0501', 'cutplayer@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_players (id, user_id, first_name, last_name, primary_position, player_type)
    VALUES ('00000000-0000-0000-0000-0000000d0502', '00000000-0000-0000-0000-0000000d0501',
            'Cut', 'Player', 'OF', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000d0101', '00000000-0000-0000-0000-0000000d0502', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 1 — the function's own invariants.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'helm_lifting_sync_org_athletes'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'helm_lifting_sync_org_athletes is SECURITY DEFINER with a pinned search_path'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.helm_lifting_sync_org_athletes(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot execute helm_lifting_sync_org_athletes'
);

-- The regression guard with the widest blast radius: `is_active` must not
-- appear in the conflict action at all. If it ever does, every sync silently
-- reactivates every cut player.
SELECT ok(
  position('is_active' IN COALESCE((
    SELECT substring(pg_get_functiondef(p.oid) FROM 'ON CONFLICT.*?;')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'helm_lifting_sync_org_athletes'
  ), '')) = 0,
  'the ON CONFLICT action never touches is_active — a sync cannot resurrect a cut player'
);

-- ============================================================================
-- GROUP 2 — behavioural: a sync over a pre-seeded NULL link, then a second
-- sync after a rename and a roster cut.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000d0201", "role": "authenticated"}';

SELECT ok(
  public.helm_lifting_sync_org_athletes(
    '00000000-0000-0000-0000-0000000d0001', 'baseball',
    '00000000-0000-0000-0000-0000000d0101') >= 1,
  'the sync touches the roster (inserting the new athlete, updating the pre-seeded one)'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT user_id FROM public.helm_lifting_athletes
    WHERE sport_player_id = '00000000-0000-0000-0000-0000000d0401'),
  '00000000-0000-0000-0000-0000000d0402'::uuid,
  'THE FIX: the sync repairs a directly-written NULL link, so the player can reach /lifting/dashboard'
);

-- The roster corrects a misspelled name, and a coach cuts Player B (which
-- sets is_active = false in Lift Lab, via roster.ts's propagation).
DO $$
BEGIN
  UPDATE public.baseball_players
     SET first_name = 'Corrected'
   WHERE id = '00000000-0000-0000-0000-0000000d0401';

  UPDATE public.helm_lifting_athletes
     SET is_active = false
   WHERE sport_player_id = '00000000-0000-0000-0000-0000000d0502';
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000d0201", "role": "authenticated"}';

SELECT lives_ok(
  $$SELECT public.helm_lifting_sync_org_athletes(
      '00000000-0000-0000-0000-0000000d0001', 'baseball',
      '00000000-0000-0000-0000-0000000d0101')$$,
  'a second sync runs without error'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT user_id FROM public.helm_lifting_athletes
    WHERE sport_player_id = '00000000-0000-0000-0000-0000000d0401'),
  '00000000-0000-0000-0000-0000000d0402'::uuid,
  'a repaired link survives further syncs — COALESCE never blanks it'
);

SELECT is(
  (SELECT first_name FROM public.helm_lifting_athletes
    WHERE sport_player_id = '00000000-0000-0000-0000-0000000d0401'),
  'Corrected',
  'a corrected name on the roster reaches Lift Lab'
);

-- The negative that protects the roster-deactivation propagation.
SELECT is(
  (SELECT is_active FROM public.helm_lifting_athletes
    WHERE sport_player_id = '00000000-0000-0000-0000-0000000d0502'),
  false,
  'a cut player STAYS cut — the sync does not resurrect them'
);

SELECT * FROM finish();
ROLLBACK;
