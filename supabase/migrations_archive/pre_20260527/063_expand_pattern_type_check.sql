-- ============================================================================
-- Migration: 063_expand_pattern_type_check.sql
-- Purpose: Expand golf_patterns_v2 pattern_type constraint to match V2 engine
-- ============================================================================

ALTER TABLE IF EXISTS golf_patterns_v2
  DROP CONSTRAINT IF EXISTS golf_patterns_v2_pattern_type_check;

ALTER TABLE IF EXISTS golf_patterns_v2
  ADD CONSTRAINT golf_patterns_v2_pattern_type_check
  CHECK (pattern_type = ANY (ARRAY[
    'conditional',
    'compound',
    'anomaly',
    'regression',
    'temporal',
    'contextual',
    'sequence',
    'cluster'
  ]));

ALTER TABLE IF EXISTS golf_global_patterns
  DROP CONSTRAINT IF EXISTS golf_global_patterns_pattern_type_check;

ALTER TABLE IF EXISTS golf_global_patterns
  ADD CONSTRAINT golf_global_patterns_pattern_type_check
  CHECK (pattern_type = ANY (ARRAY[
    'conditional',
    'compound',
    'anomaly',
    'regression',
    'temporal',
    'contextual',
    'sequence',
    'cluster'
  ]));
