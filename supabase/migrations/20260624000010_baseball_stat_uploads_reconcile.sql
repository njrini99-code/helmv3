-- ============================================================================
-- 20260624000010_baseball_stat_uploads_reconcile.sql
--
-- PURPOSE
--   Reconcile the baseball_stat_uploads schema mismatch ADDITIVELY.
--
--   The live prod table (per src/lib/types/database.ts + the prod baseline
--   20260527000000_prod_public_baseline.sql) has:
--       id, coach_id, team_id, filename, file_url, status (free text),
--       row_count, processed_count, error_message, created_at, completed_at
--
--   The archived design (032_baseball_advanced.sql) instead had:
--       stat_type, session_date, session_name, total_rows, matched_rows,
--       unmatched_rows, unmatched_data, status (CHECK-constrained)
--
--   src/app/baseball/actions/stats.ts ACTIVELY writes the ARCHIVED columns
--   (stat_type, session_date, session_name, total_rows, matched_rows,
--   unmatched_rows, unmatched_data) which DO NOT EXIST on prod -> those
--   inserts/updates currently fail.
--
--   This migration keeps BOTH the legacy/session columns AND the prod columns,
--   adds the archived columns that are missing, adds import-lineage columns,
--   and CHECK-constrains status WITHOUT breaking existing rows. It removes
--   nothing that stats.ts (or database.ts) reads. Safe to run on a live DB.
--
-- GUARANTEES
--   * ADDITIVE ONLY  - IF NOT EXISTS everywhere, no DROP/RENAME, no data loss
--   * Non-destructive - no UPDATE/DELETE of existing data
--   * RLS preserved   - re-asserts ENABLE ROW LEVEL SECURITY + coach-scoped
--                       SELECT/INSERT/UPDATE policies (DROP POLICY IF EXISTS
--                       then CREATE) idempotently; never grants to anon
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Archived "session" columns that stats.ts writes but prod is missing.
--    All additive; defaults chosen to match the archived schema so existing
--    rows remain valid and new inserts succeed.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."baseball_stat_uploads"
  ADD COLUMN IF NOT EXISTS "stat_type"      text,
  ADD COLUMN IF NOT EXISTS "session_date"   date,
  ADD COLUMN IF NOT EXISTS "session_name"   text,
  ADD COLUMN IF NOT EXISTS "total_rows"     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "matched_rows"   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unmatched_rows" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unmatched_data" jsonb   DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Import-lineage columns (source-registry provenance for each upload).
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."baseball_stat_uploads"
  ADD COLUMN IF NOT EXISTS "import_run_id"    uuid,
  ADD COLUMN IF NOT EXISTS "source_id"        text,
  ADD COLUMN IF NOT EXISTS "mapping_config"   jsonb,
  ADD COLUMN IF NOT EXISTS "match_confidence" numeric;

-- ---------------------------------------------------------------------------
-- 3. CHECK-constrain status WITHOUT breaking existing rows.
--    The prod column is free-text (status text DEFAULT 'pending'); both the
--    prod baseline ('pending') and stats.ts ('processing','completed') and the
--    archived schema ('pending','processing','completed','failed',
--    'needs_review') are covered by the allow-list below. We add the
--    constraint as NOT VALID so it never fails the migration on any unexpected
--    legacy value already present, then VALIDATE in a guarded block that
--    swallows any violation (leaving the constraint enforced for NEW writes).
--    No data is modified.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_stat_uploads_status_check'
      AND conrelid = '"public"."baseball_stat_uploads"'::regclass
  ) THEN
    ALTER TABLE "public"."baseball_stat_uploads"
      ADD CONSTRAINT "baseball_stat_uploads_status_check"
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'needs_review'))
      NOT VALID;
  END IF;
END
$$;

-- Try to validate existing rows; if any legacy row violates, leave NOT VALID
-- (still enforced for new/updated rows) rather than failing the migration.
DO $$
BEGIN
  ALTER TABLE "public"."baseball_stat_uploads"
    VALIDATE CONSTRAINT "baseball_stat_uploads_status_check";
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'baseball_stat_uploads_status_check left NOT VALID: pre-existing rows have out-of-list status values';
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Helpful indexes (all additive / IF NOT EXISTS).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_baseball_stat_uploads_status"
  ON "public"."baseball_stat_uploads" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_baseball_stat_uploads_session_date"
  ON "public"."baseball_stat_uploads" USING btree ("session_date");

CREATE INDEX IF NOT EXISTS "idx_baseball_stat_uploads_stat_type"
  ON "public"."baseball_stat_uploads" USING btree ("stat_type");

CREATE INDEX IF NOT EXISTS "idx_baseball_stat_uploads_import_run_id"
  ON "public"."baseball_stat_uploads" USING btree ("import_run_id");

CREATE INDEX IF NOT EXISTS "idx_baseball_stat_uploads_source_id"
  ON "public"."baseball_stat_uploads" USING btree ("source_id");

CREATE INDEX IF NOT EXISTS "idx_baseball_stat_uploads_team_created"
  ON "public"."baseball_stat_uploads" USING btree ("team_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- 5. Re-assert RLS (idempotent). Coach-scoped via baseball_coaches.user_id.
--    Matches the prod baseline policy shape; adds an UPDATE policy because
--    stats.ts performs an UPDATE on the upload record. Never grants to anon.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."baseball_stat_uploads" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_stat_uploads_select" ON "public"."baseball_stat_uploads";
CREATE POLICY "baseball_stat_uploads_select"
  ON "public"."baseball_stat_uploads"
  FOR SELECT TO "authenticated"
  USING (EXISTS (
    SELECT 1 FROM "public"."baseball_coaches"
    WHERE "baseball_coaches"."id" = "baseball_stat_uploads"."coach_id"
      AND "baseball_coaches"."user_id" = "auth"."uid"()
  ));

DROP POLICY IF EXISTS "baseball_stat_uploads_insert" ON "public"."baseball_stat_uploads";
CREATE POLICY "baseball_stat_uploads_insert"
  ON "public"."baseball_stat_uploads"
  FOR INSERT TO "authenticated"
  WITH CHECK (EXISTS (
    SELECT 1 FROM "public"."baseball_coaches"
    WHERE "baseball_coaches"."id" = "baseball_stat_uploads"."coach_id"
      AND "baseball_coaches"."user_id" = "auth"."uid"()
  ));

DROP POLICY IF EXISTS "baseball_stat_uploads_update" ON "public"."baseball_stat_uploads";
CREATE POLICY "baseball_stat_uploads_update"
  ON "public"."baseball_stat_uploads"
  FOR UPDATE TO "authenticated"
  USING (EXISTS (
    SELECT 1 FROM "public"."baseball_coaches"
    WHERE "baseball_coaches"."id" = "baseball_stat_uploads"."coach_id"
      AND "baseball_coaches"."user_id" = "auth"."uid"()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "public"."baseball_coaches"
    WHERE "baseball_coaches"."id" = "baseball_stat_uploads"."coach_id"
      AND "baseball_coaches"."user_id" = "auth"."uid"()
  ));

-- ============================================================================
-- END 20260624000010_baseball_stat_uploads_reconcile.sql
-- ============================================================================
