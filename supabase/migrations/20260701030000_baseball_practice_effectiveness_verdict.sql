-- BaseballHelm — practice-effectiveness-verdicts — distinguish coach verdicts.
--
-- Today all three "Worked" / "Needs More Time" / "Not Enough Data" buttons on
-- the Practice Effectiveness review card write the SAME
-- disposition='resolved' with nothing to tell them apart. `disposition`
-- is the workflow state (new / dismissed / resolved / converted_to_task);
-- `verdict` is an ORTHOGONAL outcome the coach records only when resolving.
-- Nullable — only meaningful once a review has been resolved.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK constraint add.

ALTER TABLE "public"."baseball_practice_effectiveness_reviews"
    ADD COLUMN IF NOT EXISTS "verdict" text NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'baseball_practice_effectiveness_reviews_verdict_check'
    ) THEN
        ALTER TABLE "public"."baseball_practice_effectiveness_reviews"
            ADD CONSTRAINT "baseball_practice_effectiveness_reviews_verdict_check"
            CHECK ("verdict" IN ('worked', 'needs_more_time', 'not_enough_data'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_baseball_practice_effectiveness_reviews_team_verdict"
    ON "public"."baseball_practice_effectiveness_reviews" ("team_id", "verdict");

-- Rollback:
--   DROP INDEX IF EXISTS "idx_baseball_practice_effectiveness_reviews_team_verdict";
--   ALTER TABLE "public"."baseball_practice_effectiveness_reviews"
--       DROP CONSTRAINT IF EXISTS "baseball_practice_effectiveness_reviews_verdict_check";
--   ALTER TABLE "public"."baseball_practice_effectiveness_reviews"
--       DROP COLUMN IF EXISTS "verdict";
