-- =============================================================================
-- Migration: 20260626000020_helm_lifting_exercise_stress_profile.sql
-- Purpose:   Add exercise stress-profile columns to helm_lifting_exercises.
--
-- Spec: docs/audits/BASEBALLHELM_ENHANCEMENT_PLAN_2026-06-25.md §E2
--
-- Adds:
--   throwing_arm_stress  — stress level for the throwing chain (none/low/medium/high)
--   spine_loading        — axial spine load (none/low/medium/high)
--   lower_body_loading   — lower-body demand (none/low/medium/high)
--   rotational_stress    — rotational/torque demand (none/low/medium/high)
--   grip_stress          — grip / forearm demand (none/low/medium/high)
--   is_pitcher_sensitive — flag: should be reviewed before a pitcher's throw day
--   primary_body_regions — SorenessRegionId[] for primary loaded regions
--   secondary_body_regions — SorenessRegionId[] for secondary / stabiliser regions
--   stress_regions       — SorenessRegionId[] used for conflict-scoring queries
--
-- GUARANTEES:
--   * ADD COLUMN only — no DROP, no ALTER of existing columns.
--   * Every column has a safe constant DEFAULT so existing rows are unaffected.
--   * IF NOT EXISTS guards make this idempotent (safe to re-run).
--   * No GRANT to anon.
--   * GOLF-SAFETY: zero ALTER/DROP of any golf_* or baseball_* object.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Stress-level columns (text with CHECK constraint, NOT NULL, DEFAULT 'none')
-- ---------------------------------------------------------------------------

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS throwing_arm_stress text NOT NULL
    DEFAULT 'none'
    CHECK (throwing_arm_stress IN ('none', 'low', 'medium', 'high'));

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS spine_loading text NOT NULL
    DEFAULT 'none'
    CHECK (spine_loading IN ('none', 'low', 'medium', 'high'));

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS lower_body_loading text NOT NULL
    DEFAULT 'none'
    CHECK (lower_body_loading IN ('none', 'low', 'medium', 'high'));

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS rotational_stress text NOT NULL
    DEFAULT 'none'
    CHECK (rotational_stress IN ('none', 'low', 'medium', 'high'));

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS grip_stress text NOT NULL
    DEFAULT 'none'
    CHECK (grip_stress IN ('none', 'low', 'medium', 'high'));

-- ---------------------------------------------------------------------------
-- Pitcher-sensitive flag (boolean, NOT NULL, DEFAULT false)
-- ---------------------------------------------------------------------------

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS is_pitcher_sensitive boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Region arrays — SorenessRegionId[] stored as text[] (NOT NULL, DEFAULT '{}')
-- ---------------------------------------------------------------------------

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS primary_body_regions text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS secondary_body_regions text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.helm_lifting_exercises
  ADD COLUMN IF NOT EXISTS stress_regions text[] NOT NULL DEFAULT '{}';
