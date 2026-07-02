-- ============================================================================
-- BaseballHelm — Program Profile: program logo storage
-- ----------------------------------------------------------------------------
-- Public bucket `logos` for coach-uploaded program/organization logos (client
-- already writes to this bucket at src/app/baseball/(dashboard)/dashboard/
-- program/page.tsx — upload has always 404'd because the bucket + RLS
-- policies never existed). Public read (served via public URL stored in
-- organizations.logo_url); only a coach (a row in baseball_coaches owned by
-- the requesting auth.uid()) may upload, and only the uploader (owner) may
-- replace/delete their own object. 2 MB cap matches the client-side size
-- guard.
--
-- Idempotent (re-runnable): bucket upsert + DROP POLICY IF EXISTS before each
-- CREATE so a fresh CI replay lands the same state.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Only a coach (a row in baseball_coaches owned by the requesting user) may
-- upload a logo — not just any authenticated user (players/parents excluded).
DROP POLICY IF EXISTS "logos_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "logos_coach_insert" ON storage.objects;
CREATE POLICY "logos_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM public.baseball_coaches
      WHERE baseball_coaches.user_id = auth.uid()
    )
  );

-- Only the uploader may replace their own object (client uses `upsert: true`
-- against a fresh timestamped path, but re-uploads to the same path — e.g.
-- retries — need UPDATE), and only if they're still a coach.
DROP POLICY IF EXISTS "logos_owner_update" ON storage.objects;
CREATE POLICY "logos_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.baseball_coaches
      WHERE baseball_coaches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.baseball_coaches
      WHERE baseball_coaches.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "logos_owner_delete" ON storage.objects;
CREATE POLICY "logos_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.baseball_coaches
      WHERE baseball_coaches.user_id = auth.uid()
    )
  );

-- Rollback:
--   DROP POLICY IF EXISTS "logos_owner_delete" ON storage.objects;
--   DROP POLICY IF EXISTS "logos_owner_update" ON storage.objects;
--   DROP POLICY IF EXISTS "logos_coach_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "logos_authenticated_insert" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'logos';
