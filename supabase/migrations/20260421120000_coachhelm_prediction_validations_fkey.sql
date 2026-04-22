-- Team E / Task E7: add missing FK between golf_prediction_validations
-- and golf_predictions so the calibration cron (and future joins) can rely
-- on referential integrity. NOT VALID skips the up-front check against any
-- historical orphan rows; a follow-up `VALIDATE CONSTRAINT` can be run
-- after verifying orphans are cleaned.

ALTER TABLE public.golf_prediction_validations
  DROP CONSTRAINT IF EXISTS golf_prediction_validations_prediction_id_fkey;

ALTER TABLE public.golf_prediction_validations
  ADD CONSTRAINT golf_prediction_validations_prediction_id_fkey
  FOREIGN KEY (prediction_id) REFERENCES public.golf_predictions(id)
  ON DELETE CASCADE
  NOT VALID;
