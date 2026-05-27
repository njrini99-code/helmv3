-- v3 Wave 21 — add engine_version column to golf_coach_insights
--
-- Per master plan Part III "Architecture": engine_version stamps each
-- insight row as 'v2' (existing) or 'v3' (new BaseGenerator). Lets v2
-- and v3 generators coexist during the W21-W25 transition window:
--   - dedup signature space stays clean (v3: prefix per Part V.4)
--   - W35 outcome attribution can measure v3 lift separately from v2
--   - W25 cutover wave can confirm v3 has fully replaced v2 before
--     deleting v2 generator code
--
-- DEFAULT 'v2' so every existing row is correctly labeled. No backfill
-- needed (default fills NULLs on existing rows in Postgres).
--
-- The companion index (engine_version, created_at DESC) ships in the
-- NEXT migration per Rule 2 + Rule 7 idempotency separation.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT EXISTS (
--     SELECT 1 FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='golf_coach_insights'
--       AND column_name='engine_version'
--   );
--   -> false (safe to add)
--
-- ROLLBACK:
--   ALTER TABLE public.golf_coach_insights DROP COLUMN IF EXISTS engine_version;

ALTER TABLE public.golf_coach_insights
  ADD COLUMN IF NOT EXISTS engine_version text NOT NULL DEFAULT 'v2';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_insights_engine_version_check'
      AND conrelid = 'public.golf_coach_insights'::regclass
  ) THEN
    ALTER TABLE public.golf_coach_insights
      ADD CONSTRAINT golf_coach_insights_engine_version_check
      CHECK (engine_version IN ('v2','v3'));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_coach_insights.engine_version IS
  'v3 W21. ''v2'' = legacy mining/* generator output; ''v3'' = BaseGenerator output. Combined with the v3: signature prefix lets both engines coexist during W21-W25 transition + lets W35 outcome attribution score them separately.';
