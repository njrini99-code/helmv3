-- Drop phantom tables: zero rows, no INSERT writers in src/, decided to remove.
-- See docs/legacy/full-review/_FINAL_REPORT_v2.md and 2026-04-27 tonight's audit.
--
-- golf_review_insights: 0 rows in production. Only an UPDATE writer exists at
--   round-reviews.ts:1372, no INSERT writer anywhere in src/. The table never
--   gets populated, so the UPDATE is a no-op.
-- golf_insight_feedback_scores: 0 rows in production. No writer in src/ at all.
--
-- Pre-flight: verify both tables are still 0 rows BEFORE applying this drop.
--   SELECT count(*) FROM golf_review_insights;          -- expected: 0
--   SELECT count(*) FROM golf_insight_feedback_scores;  -- expected: 0
-- If either is non-zero, ABORT and reassess.

DROP TABLE IF EXISTS golf_review_insights CASCADE;
DROP TABLE IF EXISTS golf_insight_feedback_scores CASCADE;
