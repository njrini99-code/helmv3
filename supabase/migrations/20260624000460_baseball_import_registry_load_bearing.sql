-- ============================================================================
-- Migration: 20260624000460_baseball_import_registry_load_bearing.sql
-- Purpose: Make the per-team import-source registry (baseball_import_sources)
--          LOAD-BEARING on the actual import pipeline. The registry already
--          persists trust_level / default_visibility / required_review /
--          dedupe_strictness / player_match_strategy / external_id_namespace
--          (20260624000090_baseball_settings_os.sql), but the commit path never
--          read or applied it. This migration adds the columns the commit path
--          needs to STAMP and ROUTE imports per the registered source:
--
--          1. baseball_player_stats gains source_trust_level + source_visibility
--             so downstream Source-Trust surfaces + player-visibility honor the
--             registered source instead of treating every imported row the same.
--          2. baseball_import_runs gains review_state + source_config_id so a
--             source registered required_review=true blocks auto-commit and the
--             run lands in a review queue tied to its registry row.
--
-- Wave: deepen / packet: qa-screens (settings — import-source registry)
--
-- GUARDRAILS:
--   * ADDITIVE ONLY (ADD COLUMN IF NOT EXISTS). Safe on a live DB. No data
--     migration, no destructive writes, no drops of existing columns/policies.
--   * No new tables -> no new RLS to author; the columns inherit the existing
--     team-scoped staff RLS on their tables.
--   * No GRANT to anon anywhere. Service role bypasses RLS by design.
--   * Sport-prefixed names only (baseball_*).
--   * NOT APPLIED by this agent — .sql only, per packet guardrails.
-- ============================================================================

-- ============================================================================
-- SECTION 1: baseball_player_stats — source trust + visibility stamping
--   When a row is committed from a registered source, the commit stamps the
--   source's trust_level and default_visibility here. NULL = legacy / manual
--   rows committed before this migration (read paths treat NULL as the prior
--   implicit default: trust 'unreviewed', visibility 'staff_only').
-- ============================================================================

ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS source_trust_level text
    CHECK (
      source_trust_level IS NULL OR source_trust_level IN (
        'official', 'device_export', 'staff_entered',
        'player_entered', 'ai_derived', 'unreviewed'
      )
    );

ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS source_visibility text
    CHECK (
      source_visibility IS NULL OR source_visibility IN (
        'staff_only', 'player_visible', 'restricted'
      )
    );

COMMENT ON COLUMN public.baseball_player_stats.source_trust_level IS
  'Trust tier stamped from the registered import source (baseball_import_sources.trust_level) at commit. NULL = legacy/manual row predating the registry-driven commit (treated as unreviewed by read paths).';
COMMENT ON COLUMN public.baseball_player_stats.source_visibility IS
  'Default visibility stamped from the registered import source (baseball_import_sources.default_visibility) at commit. NULL = legacy/manual row (treated as staff_only).';

-- Player-visible imported rows are the hot read path for the player profile;
-- index the predicate the player read path filters on (team + visibility).
CREATE INDEX IF NOT EXISTS idx_baseball_player_stats_visibility
  ON public.baseball_player_stats (team_id, source_visibility)
  WHERE source_visibility IS NOT NULL;

-- ============================================================================
-- SECTION 2: baseball_import_runs — review-state routing + registry link
--   required_review=true on the source routes a committed run into a review
--   queue (status stays 'review', review_state='pending_review') instead of
--   auto-committing. source_config_id links the run back to the registry row
--   whose policy drove it, for the Source drawer + audit.
-- ============================================================================

ALTER TABLE public.baseball_import_runs
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'not_required'
    CHECK (review_state IN (
      'not_required',    -- source.required_review = false -> auto-committed
      'pending_review',  -- source.required_review = true  -> awaiting staff sign-off
      'approved',        -- a reviewer approved a held run (rows then committed)
      'rejected'         -- a reviewer rejected a held run (no rows committed)
    ));

ALTER TABLE public.baseball_import_runs
  ADD COLUMN IF NOT EXISTS source_config_id uuid
    REFERENCES public.baseball_import_sources(id) ON DELETE SET NULL;

ALTER TABLE public.baseball_import_runs
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

ALTER TABLE public.baseball_import_runs
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN public.baseball_import_runs.review_state IS
  'Review routing driven by the registered source required_review flag. not_required = auto-committed; pending_review = held for staff sign-off; approved/rejected = reviewer decision.';
COMMENT ON COLUMN public.baseball_import_runs.source_config_id IS
  'The baseball_import_sources registry row whose policy (trust/visibility/review/dedupe/match-strategy) drove this run. NULL when the chosen source was not registered (hardcoded adapter default used).';

-- The review queue lists runs awaiting sign-off for a team; index the predicate.
CREATE INDEX IF NOT EXISTS idx_baseball_import_runs_review
  ON public.baseball_import_runs (team_id, review_state)
  WHERE review_state = 'pending_review';

-- ============================================================================
-- SECTION 3: baseball_stat_uploads — 1:1 lineage per run (UNIQUE import_run_id)
--   The commit path now UPSERTs the lineage row by import_run_id (a held run is
--   staged first, then replaced with the applied snapshot on approval), so the
--   column needs a UNIQUE constraint for ON CONFLICT. Each run has at most one
--   lineage row by design. Added as a partial UNIQUE INDEX (import_run_id is
--   nullable for legacy manual uploads with no run); guarded so it is a no-op if
--   a pre-existing duplicate would block creation (logged, left absent).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'uq_baseball_stat_uploads_import_run_id'
  ) THEN
    CREATE UNIQUE INDEX uq_baseball_stat_uploads_import_run_id
      ON public.baseball_stat_uploads (import_run_id)
      WHERE import_run_id IS NOT NULL;
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'uq_baseball_stat_uploads_import_run_id not created: pre-existing duplicate import_run_id rows present';
END
$$;

-- ============================================================================
-- END migration 20260624000460_baseball_import_registry_load_bearing.sql
-- ============================================================================
