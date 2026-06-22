-- P094: record whether a focus area's coaching actually landed, so the Dev-Plans
-- "Did the coaching land?" outcome tally has a real source (was inferred client-side).
ALTER TABLE public.golf_player_focus_areas
  ADD COLUMN IF NOT EXISTS outcome_status text;

COMMENT ON COLUMN public.golf_player_focus_areas.outcome_status IS
  'Outcome of the focus area once evaluated: improved | no_change | worsened | inconclusive (null = not yet evaluated). Source for the Dev-Plans outcome tally (P094).';
