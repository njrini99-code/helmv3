-- ============================================================================
-- Migration: 20260624000500_baseball_import_raw_file_and_hash.sql
-- Purpose: Close GAP 1 (raw source file never preserved) + GAP 2 (no file
--          fingerprint, so the "same file hash is ignored as duplicate"
--          invariant cannot hold) for BaseballHelm stat ingestion.
-- Packet: qa-screens (Import Dossier + adapters — stats-integrations DEEPEN)
--
-- Two additive changes:
--   1. baseball_import_runs gains file_hash (SHA-256 of the raw bytes, server-
--      recomputed — never trusts a client hash) + file_bytes (size in bytes).
--      A partial index over (team_id, source_id, file_hash) for committed runs
--      backs the O(1) "this exact file was already imported" duplicate lookup.
--   2. A PRIVATE Supabase Storage bucket `baseball-imports` holding the original
--      uploaded file so a coach can download the source-of-truth file and a
--      reviewer can approve a held run against the real file (not just staged
--      rows JSON). Path layout: <team_id>/<run_id>/<filename> so the first path
--      segment is the team uuid the RLS policy scopes by.
--
-- GUARDRAILS:
--   * ADDITIVE ONLY — ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
--     insert-bucket-if-not-exists / DROP POLICY IF EXISTS then CREATE. Safe on a
--     live DB shared with GolfHelm production.
--   * Storage RLS scoped by is_baseball_team_coach on the first path segment.
--     NO GRANT to anon. Bucket is private (public=false).
--   * Sport-prefixed names only (baseball-imports / baseball_*).
-- ============================================================================

-- ── SECTION 1: file fingerprint + size on the run header ────────────────────

ALTER TABLE baseball_import_runs
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

ALTER TABLE baseball_import_runs
  ADD COLUMN IF NOT EXISTS file_bytes INTEGER;

-- Partial index backing the duplicate-file short-circuit: a committed run with
-- the same (team, source, hash) means "this exact file was already imported".
-- Partial (committed + non-null hash only) keeps it small and only over the rows
-- the dedupe check reads.
CREATE INDEX IF NOT EXISTS idx_baseball_import_runs_file_hash
  ON baseball_import_runs(team_id, source_id, file_hash)
  WHERE file_hash IS NOT NULL AND status = 'committed';

-- Contract duplicate-file WARNING (v2_data_contracts_expanded.md:62-64): a UNIQUE
-- warning on (team_id, import_type, file_hash) to detect the SAME file imported
-- twice. Implemented as a PARTIAL UNIQUE INDEX over COMMITTED runs only: it makes
-- "this exact file (of this import kind) was already committed for this team" an
-- enforced no-duplicate guarantee, while still allowing the same file to be
-- re-staged (status != 'committed') after a rollback so a corrected re-import is
-- never blocked. Guarded so a live DB carrying a pre-existing duplicate is logged
-- and left intact rather than failing the migration.
DO $$
DECLARE
  dup_groups INTEGER;
BEGIN
  -- import_type may be absent if this migration somehow runs before 20260624000020's
  -- convergence on a partially-built DB; skip cleanly in that case.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_import_runs' AND column_name = 'import_type'
  ) THEN
    RAISE NOTICE 'baseball_import_runs.import_type absent; skipping duplicate-file unique warning index.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO dup_groups FROM (
    SELECT 1 FROM baseball_import_runs
    WHERE file_hash IS NOT NULL AND status = 'committed'
    GROUP BY team_id, import_type, file_hash HAVING COUNT(*) > 1
  ) d;

  IF dup_groups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_import_runs_same_file
      ON baseball_import_runs(team_id, import_type, file_hash)
      WHERE file_hash IS NOT NULL AND status = 'committed';
  ELSE
    RAISE NOTICE 'baseball_import_runs: % committed (team, import_type, file_hash) duplicate group(s) already exist; skipping unique warning index (resolve duplicates then re-run).', dup_groups;
  END IF;
END $$;

-- ── SECTION 2: private storage bucket for the raw source file ───────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'baseball-imports',
  'baseball-imports',
  false,
  26214400, -- 25 MB; the same ceiling recruit-documents uses
  ARRAY[
    'text/csv',
    'text/plain',
    'text/tab-separated-values',
    'application/xml',
    'text/xml',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream' -- some browsers send CSV/XLSX as octet-stream
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object policies: only staff of the team that owns the path may touch files.
-- Path convention: <teamId>/<runId>/<filename>  ->  foldername[1] = teamId.
DROP POLICY IF EXISTS baseball_imports_staff_select ON storage.objects;
CREATE POLICY baseball_imports_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'baseball-imports'
    AND public.is_baseball_team_coach(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS baseball_imports_staff_insert ON storage.objects;
CREATE POLICY baseball_imports_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'baseball-imports'
    AND public.is_baseball_team_coach(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS baseball_imports_staff_update ON storage.objects;
CREATE POLICY baseball_imports_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'baseball-imports'
    AND public.is_baseball_team_coach(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'baseball-imports'
    AND public.is_baseball_team_coach(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS baseball_imports_staff_delete ON storage.objects;
CREATE POLICY baseball_imports_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'baseball-imports'
    AND public.is_baseball_team_coach(((storage.foldername(name))[1])::uuid)
  );

-- ── ROLLBACK (manual) ───────────────────────────────────────────────────────
--   drop policy if exists baseball_imports_staff_select on storage.objects;
--   drop policy if exists baseball_imports_staff_insert on storage.objects;
--   drop policy if exists baseball_imports_staff_update on storage.objects;
--   drop policy if exists baseball_imports_staff_delete on storage.objects;
--   delete from storage.objects where bucket_id = 'baseball-imports';
--   delete from storage.buckets where id = 'baseball-imports';
--   drop index if exists uq_baseball_import_runs_same_file;
--   drop index if exists idx_baseball_import_runs_file_hash;
--   alter table baseball_import_runs drop column if exists file_bytes;
--   alter table baseball_import_runs drop column if exists file_hash;
-- ============================================================================
-- END migration 20260624000500_baseball_import_raw_file_and_hash.sql
-- ============================================================================
