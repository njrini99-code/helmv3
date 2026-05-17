-- Shared helpers for RLS pgTAP suites.
-- Loaded by every test via `\i supabase/tests/rls/_helpers.sql`.
--
-- NOTE (2026-05-17): full integration helpers (make_coach/make_player/make_team)
-- are deferred until the missing `golf_team_coach_staff` CREATE TABLE statement
-- is added to a committed migration. Until then, pgTAP suites in this directory
-- use schema-light assertions over `pg_policies` and `pg_attribute` to verify
-- the security contracts without needing seeded data.

CREATE SCHEMA IF NOT EXISTS tests;

-- Returns TRUE when the given policy on the given table has a WITH CHECK
-- expression that references the given identifier (e.g. column or table name).
CREATE OR REPLACE FUNCTION tests.policy_with_check_contains(
  p_schema text,
  p_table text,
  p_policy text,
  p_needle text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_expr text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid)
  INTO v_expr
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = p_schema
    AND c.relname = p_table
    AND p.polname = p_policy;

  IF v_expr IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN position(p_needle IN v_expr) > 0;
END $$;

-- Returns TRUE when a column-level GRANT on the given table grants only the
-- columns in p_allowed_columns to the authenticated role (for UPDATE).
CREATE OR REPLACE FUNCTION tests.authenticated_can_update_only(
  p_schema text,
  p_table text,
  p_allowed_columns text[]
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_actual text[];
BEGIN
  SELECT array_agg(a.attname ORDER BY a.attname)
  INTO v_actual
  FROM information_schema.column_privileges cp
  JOIN pg_class c ON c.relname = cp.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = cp.column_name
  WHERE cp.grantee = 'authenticated'
    AND cp.privilege_type = 'UPDATE'
    AND cp.table_schema = p_schema
    AND cp.table_name = p_table;

  IF v_actual IS NULL THEN
    -- No column-level grants found; check table-level.
    RETURN FALSE;
  END IF;

  -- v_actual must equal p_allowed_columns (set equality).
  RETURN v_actual <@ p_allowed_columns AND p_allowed_columns <@ v_actual;
END $$;
