-- ============================================================================
-- Migration: 20260625150000_baseball_lifting_drift_closure.sql
-- Purpose:   Idempotent closure of schema drift between migration history and
--            the live DB. All objects here were intended by 20260624* /
--            20260625000000–000080 migrations but are missing or incomplete.
--
-- SCOPE (live DB verified via information_schema / pg_catalog):
--   1. baseball_signals   — 14 columns missing
--   2. baseball_actions   — 6 columns missing
--   3. baseball_meeting_items — table exists but source_action_id FK missing
--      (column exists; FK constraint may be absent — added IF NOT EXISTS guard)
--   4. baseball_coach_player_notes — (fully present; no action needed)
--      [verified: all intended columns present, RLS enabled, anon revoked]
--   5. baseball_program_settings — required_document_categories PRESENT (skip)
--   6. baseball_practices  — is_backlog PRESENT (skip)
--   7. baseball_practice_blocks — source_signal_id PRESENT (skip)
--   8. baseball_lift_assignments — source_signal_id + source_reason PRESENT (skip)
--   9. baseball_import_runs — all intended columns PRESENT (skip)
--  10. baseball_player_stats — all source_* columns PRESENT (skip)
--  11. baseball_player_external_ids — all intended columns PRESENT (skip)
--  12. baseball_coach_insights — observation_count/first_detected_at/last_seen_at
--      PRESENT (skip)
--  13. All helm_lifting_* identity/data/sessions tables PRESENT + anon revoked (skip)
--
-- HELPERS VERIFIED PRESENT IN LIVE DB (no need to recreate):
--   is_baseball_team_staff, is_baseball_team_coach, is_baseball_primary_coach,
--   is_baseball_team_member, is_baseball_team_member_v2, is_baseball_team_coach_v2,
--   has_baseball_staff_capability, get_my_baseball_player_id,
--   helm_lifting_coach_for_org, helm_lifting_can_view_org,
--   helm_lifting_can_edit_org, helm_lifting_is_my_athlete
--
-- GUARANTEES:
--   * STRICTLY ADDITIVE: only ADD COLUMN IF NOT EXISTS, ALTER TABLE IF NOT
--     EXISTS pattern. No DROP TABLE, DROP COLUMN, ALTER TYPE, or golf_* touches.
--   * Idempotent: safe to run twice (all DDL guarded with IF NOT EXISTS / IF
--     NOT EXISTS equivalents).
--   * No GRANT to anon anywhere.
--   * RLS already enabled on baseball_signals and baseball_actions (verified).
-- ============================================================================

-- ============================================================================
-- SECTION 1: baseball_signals — 14 missing columns
-- Source: 20260624000092_baseball_signals_and_actions.sql
-- Live DB has: id, team_id, player_id, signal_type, category, title, body,
--   severity, source_kind, source_refs, confidence, visibility, status,
--   disposition, dedupe_key, expires_at, created_at, updated_at
-- MISSING: event_id, why_it_matters, evidence, sample_n,
--   recommended_action_label, recommended_action_type, recommended_owner_role,
--   owner_coach_id, generated_by, feedback, acknowledged_by, acknowledged_at,
--   resolved_at, created_by
-- ============================================================================

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS event_id uuid;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS why_it_matters text;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS evidence text;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS sample_n integer;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS recommended_action_label text;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS recommended_action_type text
    CHECK (recommended_action_type IS NULL OR recommended_action_type IN (
      'practice_block','player_task','video_request','lift_modification',
      'meeting_item','message','player_note','import_review','none'));

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS recommended_owner_role text;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS owner_coach_id uuid
    REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS generated_by text;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS feedback text
    CHECK (feedback IS NULL OR feedback IN ('useful','not_useful','wrong'));

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.baseball_signals
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes that require the now-added columns (all IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS baseball_signals_team_disposition_idx
  ON public.baseball_signals (team_id, disposition, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_signals_team_player_idx
  ON public.baseball_signals (team_id, player_id);
CREATE INDEX IF NOT EXISTS baseball_signals_team_category_idx
  ON public.baseball_signals (team_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS baseball_signals_dedupe_open_uidx
  ON public.baseball_signals (team_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND disposition IN ('new','acknowledged','sample_too_small');

-- ============================================================================
-- SECTION 2: baseball_actions — 6 missing columns
-- Source: 20260624000092_baseball_signals_and_actions.sql
-- Live DB has: id, team_id, signal_id, player_id, action_type, title, body,
--   source_refs, target_table, target_id, outcome_metric, outcome_baseline_value,
--   outcome_observed_value, outcome_sample_n, outcome_movement, outcome_verdict,
--   status, created_by, created_at, updated_at
-- MISSING: event_id, detail, owner_coach_id, assignee_coach_id,
--   assignee_player_id, due_date
-- NOTE: confidence, visibility, outcome, outcome_recorded_at, reviewed_by,
--   reviewed_at, completed_at are also in the source migration — checking here:
-- ============================================================================

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS event_id uuid;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS detail text;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS owner_coach_id uuid
    REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS assignee_coach_id uuid
    REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS assignee_player_id uuid
    REFERENCES public.baseball_players(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS due_date date;

-- Also add remaining columns from the intended schema that may be absent
ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS confidence numeric;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS visibility text
    CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'));

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.baseball_actions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Indexes on baseball_actions
CREATE INDEX IF NOT EXISTS baseball_actions_team_status_idx
  ON public.baseball_actions (team_id, status, due_date);
CREATE INDEX IF NOT EXISTS baseball_actions_signal_idx
  ON public.baseball_actions (signal_id);
CREATE INDEX IF NOT EXISTS baseball_actions_assignee_player_idx
  ON public.baseball_actions (team_id, assignee_player_id);
CREATE INDEX IF NOT EXISTS baseball_actions_assignee_coach_idx
  ON public.baseball_actions (team_id, assignee_coach_id);

-- ============================================================================
-- SECTION 3: baseball_meeting_items — source_action_id FK constraint
-- Table and all columns are PRESENT. The source migration defines FKs on
-- source_signal_id and source_action_id. These may not have been applied as
-- constraints (columns added via ADD COLUMN IF NOT EXISTS without FKs).
-- We add the FK constraints only if the column exists and the constraint
-- doesn't already exist.
-- ============================================================================

DO $$
BEGIN
  -- source_action_id FK to baseball_actions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'baseball_meeting_items'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'source_action_id'
  ) THEN
    ALTER TABLE public.baseball_meeting_items
      ADD CONSTRAINT baseball_meeting_items_source_action_id_fkey
      FOREIGN KEY (source_action_id)
      REFERENCES public.baseball_actions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- END 20260625150000_baseball_lifting_drift_closure.sql
-- All other intended objects were verified PRESENT in the live DB:
--   * baseball_coach_player_notes: all columns present, RLS enabled, anon revoked
--   * baseball_import_runs: all columns present (import_type, valid_row_count,
--     warning_count, error_count, file_hash, file_bytes, review_state,
--     source_config_id, reviewed_by, reviewed_at all confirmed)
--   * baseball_player_stats: source_trust_level, source_visibility,
--     source_match_confidence, source_match_tier, source_external_id all present
--   * baseball_player_external_ids: team_id, source_display_name, verified,
--     created_by, updated_at all present
--   * baseball_coach_insights: observation_count, first_detected_at,
--     last_seen_at all present
--   * baseball_program_settings: required_document_categories present
--   * baseball_practices: is_backlog present
--   * baseball_practice_blocks: source_signal_id present
--   * baseball_lift_assignments: source_signal_id, source_reason present
--   * All helm_lifting_* tables from migrations 000000–000080: present,
--     RLS enabled, anon revoked (verified helm_lifting_coaches,
--     helm_lifting_coach_assignments, helm_lifting_athletes,
--     helm_lifting_org_viewers, helm_lifting_coach_invites, helm_lifting_sessions,
--     helm_lifting_exercises, helm_lifting_programs, helm_lifting_readiness_checkins)
--   * All RLS helpers: helm_lifting_coach_for_org, helm_lifting_can_view_org,
--     helm_lifting_can_edit_org, helm_lifting_is_my_athlete,
--     is_baseball_team_staff, is_baseball_team_coach, is_baseball_primary_coach,
--     is_baseball_team_member, is_baseball_team_member_v2,
--     is_baseball_team_coach_v2, has_baseball_staff_capability,
--     get_my_baseball_player_id — ALL PRESENT, no recreation needed
--   * helm_lifting_accept_invite RPC: PRESENT
-- ============================================================================
