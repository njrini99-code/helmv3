-- Feature F: add a TIMEFRAME to a focus area's measurable target.
-- A coach can optionally bound the target by a date ("by Apr 12") OR by a number
-- of rounds ("within 5 rounds"). Additive + nullable — existing focus areas keep
-- working with no timeframe, and the existing RLS policies already cover these
-- columns (no policy change needed).
ALTER TABLE public.golf_player_focus_areas
  ADD COLUMN IF NOT EXISTS target_kind text CHECK (target_kind IN ('date', 'rounds')),
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS target_rounds int;

COMMENT ON COLUMN public.golf_player_focus_areas.target_kind IS
  'How the measurable target is time-bounded: ''date'' (hit by target_date) | ''rounds'' (hit within target_rounds). null = no timeframe (Feature F).';
COMMENT ON COLUMN public.golf_player_focus_areas.target_date IS
  'Calendar deadline for the target when target_kind = ''date'' (else null) (Feature F).';
COMMENT ON COLUMN public.golf_player_focus_areas.target_rounds IS
  'Number of rounds to hit the target within when target_kind = ''rounds'' (else null) (Feature F).';
