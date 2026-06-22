-- PGA/LPGA-only SG baselines (2026-06-22).
--
-- Removes the NCAA D1/D2/D3 and scratch selectable SG baselines. Every team now
-- anchors its strokes-gained to its GENDER's Tour automatically: PGA Tour (men,
-- scale 1.0) or LPGA (women, 1.083) — there is no coach-selectable division.
--
-- Why the null-revert matters (correctness, not cleanup): sg_scale_for_player
-- resolves COALESCE(sg_baseline, gender-default). Once sg_baseline_scale no
-- longer knows 'scratch'/'ncaa_*', a women's team left on 'scratch' would
-- resolve to the ELSE branch (1.0 = PGA), NOT LPGA. So removed baselines are
-- reverted to NULL, letting the gender default take over, and each affected
-- team's stored SG is recomputed so standings + goal baselines stay consistent.
--
-- Mirrors src/lib/golf/sg-benchmarks.ts (SgBaselineKey = 'pga_tour' | 'womens').

-- 1. Collapse the scale function to the two surviving baselines.
CREATE OR REPLACE FUNCTION public.sg_baseline_scale(p_key text)
 RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_key
    WHEN 'pga_tour' THEN 1.000
    WHEN 'womens'   THEN 1.083
    ELSE 1.000
  END;
$function$;

-- 2. Drop the old 6-value CHECK so removed baselines can be reverted to NULL.
ALTER TABLE public.golf_team_settings
  DROP CONSTRAINT IF EXISTS golf_team_settings_sg_baseline_check;

-- 3. Revert any team on a removed baseline to NULL (-> gender default) and
--    recompute that team's stored SG. Per-team exception handling so one team's
--    recompute failure can't abort the whole migration. Idempotent: a re-run
--    finds no non-(pga_tour|womens) rows and loops zero times.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT team_id
    FROM public.golf_team_settings
    WHERE sg_baseline IS NOT NULL
      AND sg_baseline NOT IN ('pga_tour', 'womens')
  LOOP
    UPDATE public.golf_team_settings
    SET sg_baseline = NULL
    WHERE team_id = r.team_id;

    BEGIN
      PERFORM public.recompute_team_sg(r.team_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'pga_lpga_only: recompute_team_sg failed for team %: %', r.team_id, SQLERRM;
    END;
  END LOOP;
END $$;

-- 4. Re-add the CHECK, now PGA/LPGA only.
ALTER TABLE public.golf_team_settings
  ADD CONSTRAINT golf_team_settings_sg_baseline_check
  CHECK (sg_baseline IS NULL OR sg_baseline IN ('pga_tour', 'womens'));
