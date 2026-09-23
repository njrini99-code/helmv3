BEGIN;

SELECT plan(6);

-- Package 8 (2026-09-23, migration 20260923110000): the round-review
-- narrative's storage + task-key pieces. Additive only — no new
-- table, no RLS/grant change (golf_round_reviews' existing policies
-- already cover this column like every other one on the row).

SELECT ok(
  (SELECT true FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'golf_round_reviews'
     AND column_name = 'ai_narrative'),
  'golf_round_reviews.ai_narrative exists'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'golf_round_reviews'
     AND column_name = 'ai_narrative'),
  'YES',
  'ai_narrative is nullable — no backfill, existing rows stay NULL'
);

SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'golf_round_reviews'
     AND column_name = 'ai_narrative'),
  'text',
  'ai_narrative is text'
);

-- The task CHECK on golf_coachhelm_llm_calls: reused for the recap
-- ('round_review'), unchanged for hero_narrative/coach_chat, and now
-- widened to accept the narrative's OWN key.
SELECT ok(
  position(
    'round_review_narrative' IN
    pg_get_constraintdef(
      (SELECT oid FROM pg_constraint
       WHERE conname = 'golf_coachhelm_llm_calls_task_check')
    )
  ) > 0,
  'golf_coachhelm_llm_calls.task accepts round_review_narrative'
);

SELECT ok(
  position(
    'round_review' IN
    pg_get_constraintdef(
      (SELECT oid FROM pg_constraint
       WHERE conname = 'golf_coachhelm_llm_calls_task_check')
    )
  ) > 0,
  'golf_coachhelm_llm_calls.task still accepts the recap''s own round_review key — the two surfaces stay distinguishable in spend telemetry, not merged'
);

-- Same access shape as every other golf_round_reviews column: the
-- player and their coach may read/write it (RLS at the row level, no
-- per-column grant exists in this schema to narrow further), anon
-- cannot.
SELECT isnt(
  has_column_privilege('anon', 'public.golf_round_reviews', 'ai_narrative', 'SELECT'),
  true,
  'anonymous callers cannot read ai_narrative'
);

SELECT * FROM finish();

ROLLBACK;
