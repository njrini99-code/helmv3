-- pgTAP contracts for Wave A DB/security migrations (20260618000000–20260618000700).
-- Guards the audit fixes against regression (a future migration re-opening them = P0):
--   A1 F004/F071  get_golf_conversations_with_details — IDOR + anon/PUBLIC EXECUTE
--   A2 F003       golf_documents player SELECT honors is_public
--   A3 F005       player-self UPDATE policy on golf_player_focus_areas
--   A6 F086/F113  anon GRANT ALL revoked on golf_round_reviews + golf_patterns_v2
--   A8 F120       golf_player_focus_areas.progress_notes default = {entries:[]}
--
-- Source: docs/audits/GOLFHELM_E2E_TAB_AUDIT_2026-06-20.md (§3 CONFIRMED CRITICAL/HIGH)

BEGIN;
\ir _helpers.sql

SELECT plan(17);

-- ============================================================================
-- A1 — get_golf_conversations_with_details(uuid): authenticated-only definer,
-- scoped to auth.uid() (NOT the caller-supplied p_user_id).
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.get_golf_conversations_with_details(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute get_golf_conversations_with_details (IDOR closed)'
);

SELECT isnt(
  has_function_privilege('public', 'public.get_golf_conversations_with_details(uuid)', 'EXECUTE'),
  true,
  'PUBLIC cannot execute get_golf_conversations_with_details'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.get_golf_conversations_with_details(uuid)', 'EXECUTE'),
  'authenticated CAN execute get_golf_conversations_with_details (intended)'
);

SELECT ok(
  has_function_privilege('service_role', 'public.get_golf_conversations_with_details(uuid)', 'EXECUTE'),
  'service_role CAN execute get_golf_conversations_with_details'
);

SELECT ok(
  (SELECT pg_get_functiondef(p.oid) LIKE '%auth.uid()%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_golf_conversations_with_details'),
  'RPC scopes to auth.uid()'
);

SELECT ok(
  (SELECT pg_get_functiondef(p.oid) NOT LIKE '%cp.user_id = p_user_id%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_golf_conversations_with_details'),
  'RPC no longer filters by caller-supplied p_user_id (IDOR closed)'
);

-- ============================================================================
-- A6 — anon holds NO privileges on golf_round_reviews / golf_patterns_v2.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.golf_round_reviews', 'SELECT'), true, 'anon cannot SELECT golf_round_reviews');
SELECT isnt(has_table_privilege('anon', 'public.golf_round_reviews', 'INSERT'), true, 'anon cannot INSERT golf_round_reviews');
SELECT isnt(has_table_privilege('anon', 'public.golf_round_reviews', 'UPDATE'), true, 'anon cannot UPDATE golf_round_reviews');
SELECT isnt(has_table_privilege('anon', 'public.golf_round_reviews', 'DELETE'), true, 'anon cannot DELETE golf_round_reviews');

SELECT isnt(has_table_privilege('anon', 'public.golf_patterns_v2', 'SELECT'), true, 'anon cannot SELECT golf_patterns_v2');
SELECT isnt(has_table_privilege('anon', 'public.golf_patterns_v2', 'INSERT'), true, 'anon cannot INSERT golf_patterns_v2');
SELECT isnt(has_table_privilege('anon', 'public.golf_patterns_v2', 'UPDATE'), true, 'anon cannot UPDATE golf_patterns_v2');
SELECT isnt(has_table_privilege('anon', 'public.golf_patterns_v2', 'DELETE'), true, 'anon cannot DELETE golf_patterns_v2');

-- ============================================================================
-- A2 — golf_documents player SELECT gates on is_public.
-- ============================================================================

SELECT ok(
  position('is_public' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'golf_documents'
        AND p.polname = 'golf_documents_select_team'
  ), '')) > 0,
  'golf_documents_select_team USING clause gates on is_public'
);

-- ============================================================================
-- A3 — player-self UPDATE policy exists on golf_player_focus_areas.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_player_focus_areas'
      AND policyname = 'golf_player_focus_areas_update_player' AND cmd = 'UPDATE'
  ),
  'player-self UPDATE policy exists on golf_player_focus_areas'
);

-- ============================================================================
-- A8 — progress_notes default uses the {entries:[]} object shape.
-- ============================================================================

SELECT ok(
  (SELECT column_default LIKE '%entries%'
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'golf_player_focus_areas'
       AND column_name = 'progress_notes'),
  'golf_player_focus_areas.progress_notes default uses the {entries:[]} shape'
);

SELECT * FROM finish();
ROLLBACK;
