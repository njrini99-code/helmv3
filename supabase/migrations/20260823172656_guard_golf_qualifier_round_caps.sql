-- Prevent a qualifier's configured round cap from becoming an impossible
-- state after players have begun recording qualifier rounds. This guard lives
-- in Postgres so every mutation path (server action, direct client, admin
-- tooling, or future integration) is protected consistently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'golf_qualifiers_num_rounds_range'
      AND conrelid = 'public.golf_qualifiers'::regclass
  ) THEN
    ALTER TABLE public.golf_qualifiers
      ADD CONSTRAINT golf_qualifiers_num_rounds_range
      CHECK (num_rounds BETWEEN 1 AND 50);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_golf_qualifier_round_cap_regression()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  recorded_max_round integer;
BEGIN
  -- The CHECK constraint covers normal writes. Keep this explicit validation
  -- in the trigger too so a clear failure remains if the constraint is ever
  -- deferred or recreated.
  IF NEW.num_rounds IS NULL OR NEW.num_rounds < 1 OR NEW.num_rounds > 50 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Qualifier round count must be between 1 and 50.';
  END IF;

  -- A coach can increase a cap at any time, but lowering it must never make a
  -- submitted or in-progress qualifier round unreachable. Abandoned rounds do
  -- not count toward the floor because they are deliberately recoverable work.
  IF TG_OP = 'UPDATE' AND NEW.num_rounds < OLD.num_rounds THEN
    SELECT COALESCE(MAX(qualifier_round_number), 0)
    INTO recorded_max_round
    FROM public.golf_rounds
    WHERE qualifier_id = NEW.id
      AND qualifier_round_number IS NOT NULL
      AND status IN ('in_progress', 'completed');

    IF recorded_max_round > NEW.num_rounds THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Qualifier round count cannot be reduced below a recorded round.',
        DETAIL = format('Round %s is already recorded for this qualifier.', recorded_max_round);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_golf_qualifier_round_cap ON public.golf_qualifiers;

CREATE TRIGGER guard_golf_qualifier_round_cap
BEFORE INSERT OR UPDATE OF num_rounds ON public.golf_qualifiers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_golf_qualifier_round_cap_regression();
