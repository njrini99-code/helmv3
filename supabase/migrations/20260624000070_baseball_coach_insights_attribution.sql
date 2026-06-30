-- ============================================================================
-- 20260624000070_baseball_coach_insights_attribution.sql
--
-- Wave 10 (P10.4) — CoachHelm baseball engine attribution columns.
--
-- The engine write layer (src/app/baseball/actions/coachhelm.ts) needs to
-- persist, per insight row: WHERE the signal came from (source_refs), HOW
-- firmly it is trusted (confidence), and WHERE it is in its lifecycle
-- (lifecycle_state) — plus whether a player may ever see it (player_visible).
--
-- The Wave-1 RLS migration (20260624000050) was written DEFENSIVELY: it only
-- (re)asserts the staff/player split on baseball_coach_insights IF the
-- `player_visible` column already exists. That column was intentionally left
-- to the owning packet (this one) so RLS was never weakened ahead of the
-- column landing. This migration ADDS the column, then re-runs the exact same
-- defensive policy block so the player-visible read path is enabled now.
--
-- SAFETY:
--   * Purely additive — ADD COLUMN IF NOT EXISTS only. No DROP, no destructive
--     DML, no column rename. Re-runnable.
--   * Shares the production DB with live GolfHelm. This migration is NOT applied
--     by us; it is committed as a .sql file only.
--   * REVOKE-style hygiene: no GRANTs are issued here. RLS is the access gate.
--     AI writes happen via service_role (which bypasses RLS); authenticated
--     users only ever READ through the policy below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Attribution columns (all additive, all nullable / safely defaulted).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_coach_insights') IS NOT NULL THEN
    -- Structured provenance: array of {table,column?,id?,confidence?,label?}.
    -- The strictest source visibility among these governs player visibility
    -- (enforced in the action; player_visible is the materialized result).
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

    -- Normalized [0,1] confidence from the shared calcConfidence blend. The
    -- engine ALSO mirrors this into metadata.confidence for the existing
    -- command-center read model; this typed column is the canonical home a
    -- later integration agent migrates the read model onto.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS confidence numeric;

    -- Sport-agnostic lifecycle ladder (shared InsightLifecycleState):
    -- tentative | detected | matured | addressed | resolved | archived.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'detected';

    -- Whether the SUBJECT player may read this insight. Default false: staff-
    -- only. RLS (below) returns a row to a player only when this is true AND
    -- the row is about that player.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS player_visible boolean NOT NULL DEFAULT false;

    -- Which generator produced the row (audit + dedupe key). Engine rows carry
    -- a stable id like 'two_strike_chase'; null for legacy/manual rows.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS generated_by text;

    -- Stable dedupe key (generator + subject) so re-runs UPDATE the same row
    -- instead of stacking duplicates. NULL for legacy rows.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS dedupe_key text;

    -- When the engine last refreshed this row (drives matured-retraction).
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

    -- Constrain lifecycle_state to the shared ladder (additive, validated).
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_coach_insights_lifecycle_state_check'
    ) THEN
      ALTER TABLE public.baseball_coach_insights
        ADD CONSTRAINT baseball_coach_insights_lifecycle_state_check
        CHECK (lifecycle_state IN (
          'tentative','detected','matured','addressed','resolved','archived'
        )) NOT VALID;
    END IF;

    -- Constrain confidence to [0,1] when present (additive, validated).
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_coach_insights_confidence_range_check'
    ) THEN
      ALTER TABLE public.baseball_coach_insights
        ADD CONSTRAINT baseball_coach_insights_confidence_range_check
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)) NOT VALID;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Dedupe index so the engine can upsert by (team, generator, subject).
--    Partial: only engine rows (dedupe_key not null) participate.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_insights_dedupe
  ON public.baseball_coach_insights (team_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_insights_lifecycle
  ON public.baseball_coach_insights (lifecycle_state);

CREATE INDEX IF NOT EXISTS idx_baseball_insights_player_visible
  ON public.baseball_coach_insights (player_visible)
  WHERE player_visible = true;

-- ----------------------------------------------------------------------------
-- 3. (Re)assert the staff/player SELECT split now that player_visible exists.
--    This is the SAME defensive block from 20260624000050 — re-running it is
--    safe (DROP POLICY IF EXISTS then CREATE), and now the player_visible
--    branch is taken because the column is present.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_has_player_visible boolean;
  v_has_team_id        boolean;
BEGIN
  IF to_regclass('public.baseball_coach_insights') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_coach_insights ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.baseball_coach_insights FROM anon';

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'baseball_coach_insights'
        AND column_name = 'player_visible'
    ) INTO v_has_player_visible;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'baseball_coach_insights'
        AND column_name = 'team_id'
    ) INTO v_has_team_id;

    IF v_has_team_id AND v_has_player_visible THEN
      EXECUTE 'DROP POLICY IF EXISTS "baseball_insights_select" ON public.baseball_coach_insights';
      EXECUTE 'DROP POLICY IF EXISTS "baseball_coach_insights_staff_select" ON public.baseball_coach_insights';
      EXECUTE $p$CREATE POLICY "baseball_coach_insights_staff_select" ON public.baseball_coach_insights
        FOR SELECT TO authenticated
        USING (
          public.is_baseball_team_staff(team_id)
          OR (
            player_visible = true
            AND EXISTS (
              SELECT 1 FROM public.baseball_players bp
              WHERE bp.id = baseball_coach_insights.player_id
                AND bp.user_id = auth.uid()
            )
          )
        )$p$;
    END IF;
  END IF;
END $$;
