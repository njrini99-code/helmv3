-- 20261025060000_golf_rounds_player_course_completed_idx.sql
-- STATUS: HELD (conditional). Apply only if EXPLAIN on the P-7 course history read shows a Seq Scan or p95 > 20 ms.
-- Why: P-7's course page and CT-7's "Your last 5 here" filter one player's completed, non-test rounds by course_id, newest first.
-- VERIFY: SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_golf_rounds_player_course_completed' AND indexdef LIKE '%WHERE%is_test%';
-- ROLLBACK: DROP INDEX IF EXISTS public.idx_golf_rounds_player_course_completed;

SET lock_timeout = '3s';

-- golf_rounds is small (thousands of rows): a plain build holds a SHARE lock for well under a second, and CONCURRENTLY
-- cannot run inside the migration transaction. Past about a million rows, build it CONCURRENTLY by hand instead.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS "idx_golf_rounds_player_course_completed"
  ON "public"."golf_rounds" USING "btree" ("player_id", "course_id", "round_date" DESC)
  WHERE (("status" = 'completed'::"text") AND ("course_id" IS NOT NULL) AND ("is_test" = false));

COMMENT ON INDEX "public"."idx_golf_rounds_player_course_completed" IS 'P-7 course history and CT-7 last-5-here: one player''s completed non-test rounds at one course, newest first.';
