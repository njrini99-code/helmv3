-- pgTAP contracts for the BaseballHelm Import Center (Wave 6 / source-registry).
--
-- The structural lineage contracts (RLS enabled, anon has no grants, one policy
-- per verb, external_ids player-self-read) are asserted in
-- baseball_import_lineage.sql. This file adds the Wave-6 *capability* contract
-- that the import actions rely on: every write path on baseball_import_runs and
-- baseball_player_external_ids is gated on the can_manage_imports staff
-- capability, so a non-import staff member (or a player) can never create,
-- mutate, or undo an import run.
--
-- Schema-light: asserts over pg_policy without seeding integration data.
--
-- Source: Wave 6 source-registry packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ----------------------------------------------------------------------------
-- Helper: fetch a policy's USING / WITH CHECK expression text.
-- ----------------------------------------------------------------------------

-- import_runs INSERT WITH CHECK gates on can_manage_imports.
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_insert'
  ), '')) > 0,
  'baseball_import_runs_insert WITH CHECK gates on can_manage_imports'
);

-- import_runs UPDATE USING gates on can_manage_imports (so a non-import staff
-- member cannot flip a run to rolled_back / committed).
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_update'
  ), '')) > 0,
  'baseball_import_runs_update USING gates on can_manage_imports'
);

-- import_runs UPDATE WITH CHECK also gates on can_manage_imports.
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_update'
  ), '')) > 0,
  'baseball_import_runs_update WITH CHECK gates on can_manage_imports'
);

-- import_runs SELECT gates on can_manage_imports (import history is staff-only).
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_select'
  ), '')) > 0,
  'baseball_import_runs_select gates on can_manage_imports'
);

-- import_runs DELETE gates on can_manage_imports.
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_delete'
  ), '')) > 0,
  'baseball_import_runs_delete gates on can_manage_imports'
);

-- external_ids UPDATE WITH CHECK gates on can_manage_imports (a player cannot
-- alter their own external-id mapping; write stays staff-only).
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'
        AND p.polname = 'baseball_player_external_ids_update'
  ), '')) > 0,
  'baseball_player_external_ids_update WITH CHECK gates on can_manage_imports'
);

-- external_ids DELETE gates on can_manage_imports.
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'
        AND p.polname = 'baseball_player_external_ids_delete'
  ), '')) > 0,
  'baseball_player_external_ids_delete gates on can_manage_imports'
);

-- No import_runs policy targets PUBLIC (authenticated-only).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
       AND 'public' = ANY(roles)),
  0,
  'no baseball_import_runs policy targets PUBLIC'
);

-- No external_ids policy targets PUBLIC.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_external_ids'
       AND 'public' = ANY(roles)),
  0,
  'no baseball_player_external_ids policy targets PUBLIC'
);

SELECT * FROM finish();
ROLLBACK;
