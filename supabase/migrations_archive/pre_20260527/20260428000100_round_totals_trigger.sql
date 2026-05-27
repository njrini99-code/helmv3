-- Round totals trigger
-- Keeps golf_rounds.total_putts / total_gir / total_fairways_hit aligned
-- with the per-hole golf_holes rows. Also derives the per-hole `gir`
-- flag from `(score - putts) <= (par - 2)` so the flag matches the
-- score line.
--
-- The scripts/recompute-round-totals.ts one-shot fix made the existing
-- rows internally consistent; this trigger pair prevents future drift
-- whenever a hole row is inserted, updated, or deleted.
--
-- Implementation note: deriving NEW.gir requires a BEFORE trigger
-- (you cannot mutate NEW from an AFTER trigger), so this migration
-- installs two triggers on golf_holes:
--   1. BEFORE INSERT/UPDATE: set NEW.gir
--   2. AFTER  INSERT/UPDATE/DELETE: recompute golf_rounds totals

-- ---------------------------------------------------------------------
-- 1. Helper: recompute round-level totals for a single round.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_golf_round_totals(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE golf_rounds r
  SET
    total_putts = COALESCE(t.sum_putts, 0),
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND (score - COALESCE(putts, 0)) > 0
             AND (score - COALESCE(putts, 0)) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      COUNT(*) AS cnt,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      SUM(CASE WHEN par >= 4 THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$$;

-- ---------------------------------------------------------------------
-- 2. BEFORE trigger: derive per-hole gir from par / score / putts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golf_holes_set_gir_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.par IS NOT NULL AND NEW.score IS NOT NULL THEN
    NEW.gir := (NEW.par >= 3
                AND NEW.score > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) <= (NEW.par - 2));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS golf_holes_set_gir ON public.golf_holes;
CREATE TRIGGER golf_holes_set_gir
  BEFORE INSERT OR UPDATE OF par, score, putts ON public.golf_holes
  FOR EACH ROW EXECUTE FUNCTION public.golf_holes_set_gir_fn();

-- ---------------------------------------------------------------------
-- 3. AFTER trigger: recompute round totals after every hole change.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golf_holes_recompute_round_totals_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_round := OLD.round_id;
  ELSE
    v_round := NEW.round_id;
  END IF;

  PERFORM public.recompute_golf_round_totals(v_round);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS golf_holes_recompute_round_totals ON public.golf_holes;
CREATE TRIGGER golf_holes_recompute_round_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.golf_holes
  FOR EACH ROW EXECUTE FUNCTION public.golf_holes_recompute_round_totals_fn();
