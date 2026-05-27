-- W29-pt1 / Migration A: extend golf_qualifiers with selection-workspace columns.
--
-- One purpose: introduce the four columns the v3 qualifying selection workspace
-- needs on the existing qualifier rows. golf_qualifier_selections (the new
-- per-player picks table) ships in Migration B.
--
-- Idempotent — safe to re-run.

DO $$
BEGIN
  -- selection_slots_total: how many total spots the coach is filling (default 5)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_qualifiers'
      AND column_name = 'selection_slots_total'
  ) THEN
    ALTER TABLE public.golf_qualifiers
      ADD COLUMN selection_slots_total int NOT NULL DEFAULT 5
      CHECK (selection_slots_total BETWEEN 1 AND 12);
  END IF;

  -- selection_slots_coach_pick: how many of those are discretionary picks
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_qualifiers'
      AND column_name = 'selection_slots_coach_pick'
  ) THEN
    ALTER TABLE public.golf_qualifiers
      ADD COLUMN selection_slots_coach_pick int NOT NULL DEFAULT 1
      CHECK (selection_slots_coach_pick >= 0
             AND selection_slots_coach_pick <= selection_slots_total);
  END IF;

  -- target_tournament_id: optional FK to the golf_events row this qualifier
  -- is selecting players for. NULL = no destination event linked yet.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_qualifiers'
      AND column_name = 'target_tournament_id'
  ) THEN
    ALTER TABLE public.golf_qualifiers
      ADD COLUMN target_tournament_id uuid REFERENCES public.golf_events(id)
        ON DELETE SET NULL;
  END IF;

  -- selection_state: open → scoring → closed → selected lifecycle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_qualifiers'
      AND column_name = 'selection_state'
  ) THEN
    ALTER TABLE public.golf_qualifiers
      ADD COLUMN selection_state text NOT NULL DEFAULT 'open'
      CHECK (selection_state IN ('open','scoring','closed','selected'));
  END IF;
END $$;

-- Index for the coachhelm "what needs picking?" query — small, partial.
CREATE INDEX IF NOT EXISTS golf_qualifiers_selection_state_idx
  ON public.golf_qualifiers (team_id, selection_state)
  WHERE selection_state IN ('scoring','closed');
