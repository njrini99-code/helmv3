-- P0-02 backfill: retire the ~623 stranded same-day predictions whose due_date is
-- on/before their creation date (they could never validate). Stamp validated_at so
-- the validation cron stops re-fetching them, and mark error_category so the
-- performance rollups exclude them (the prediction-performance-writer skips
-- error_category='invalid_horizon'). Idempotent: the validated_at IS NULL guard
-- means already-retired rows are not re-touched.
UPDATE public.golf_predictions
   SET error_category = 'invalid_horizon',
       validated_at   = now()
 WHERE due_date IS NOT NULL AND created_at IS NOT NULL
   AND due_date <= (created_at::date)
   AND validated_at IS NULL;
