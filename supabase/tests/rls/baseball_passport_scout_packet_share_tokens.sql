-- pgTAP contracts for BaseballHelm V5 Scout Packet share tokens
-- (migration 20260624000420_baseball_passport_scout_packet_share_tokens.sql).
--
-- Security-critical invariants guarded here:
--   * RLS enabled on baseball_player_passport_share_tokens.
--   * anon holds NOTHING (the public packet route resolves tokens with the
--     SERVER role; anon must never read this table directly).
--   * status + packet_kind are CHECK-constrained (no arbitrary values).
--   * token is UNIQUE (a token resolves to exactly one packet).
--   * SELECT binds to staff OR the subject player (transparency for the player);
--     INSERT/UPDATE/DELETE are staff-only (minting/managing is a staff action).
--   * No policy targets anon.
--
-- Schema-light: asserts the contract over pg_policy / pg_constraint / pg_class
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: V5 Scout Packet vertical (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(13);

-- ---------------------------------------------------------------------------
-- RLS + anon lockout
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_share_tokens'),
  'RLS is ENABLED on baseball_player_passport_share_tokens'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_share_tokens', 'SELECT'), true, 'anon cannot SELECT share tokens');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_share_tokens', 'INSERT'), true, 'anon cannot INSERT share tokens');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_share_tokens', 'UPDATE'), true, 'anon cannot UPDATE share tokens');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_share_tokens', 'DELETE'), true, 'anon cannot DELETE share tokens');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_passport_share_tokens'
       AND 'anon' = ANY(roles)),
  0,
  'no share-token policy targets the anon role'
);

-- ---------------------------------------------------------------------------
-- CHECK constraints + uniqueness
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_passport_share_token_status_check'),
  'status is CHECK-constrained'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_passport_share_token_kind_check'),
  'packet_kind is CHECK-constrained'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_passport_share_token_key'),
  'token is UNIQUE (resolves to exactly one packet)'
);

-- ---------------------------------------------------------------------------
-- Policy shape: SELECT = staff OR subject player; writes = staff-only
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_share_tokens'
      AND p.polcmd IN ('r', '*')
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach_v2'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'SELECT binds to staff OR the subject player'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_share_tokens'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'is_baseball_team_coach_v2'
      AND pg_get_expr(p.polwithcheck, p.polrelid) !~ 'get_my_baseball_player_id'
  ),
  'INSERT is staff-only (no player-self branch)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_share_tokens'
      AND p.polcmd = 'w'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach_v2'
  ),
  'UPDATE is staff-only'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_share_tokens'
      AND p.polcmd = 'd'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach_v2'
  ),
  'DELETE is staff-only'
);

SELECT * FROM finish();
ROLLBACK;
