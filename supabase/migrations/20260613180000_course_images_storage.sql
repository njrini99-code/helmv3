-- ============================================================================
-- Cloud Course Library — Phase 4: course image storage
-- ----------------------------------------------------------------------------
-- Public bucket `course-images` for cloud course photos (non-sensitive; served
-- via public URL stored in golf_courses.image_url). Open contribution: any
-- authenticated user may upload; anyone may read; only the uploader (owner) may
-- replace/delete their object. 5 MB cap, images only.
--
-- Idempotent (re-runnable): bucket upsert + DROP POLICY IF EXISTS before each
-- CREATE so a fresh CI replay lands the same state.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-images',
  'course-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- NOTE: no SELECT policy on storage.objects for this bucket. Because the bucket
-- is PUBLIC, photos are served via the public URL (/storage/v1/object/public/…)
-- without an RLS check, and the app stores that URL in golf_courses.image_url —
-- it never lists the bucket via the storage API. Omitting the broad SELECT
-- policy is least-privilege (clears the public_bucket_allows_listing advisory).
-- If a prior cut created it, drop it.
DROP POLICY IF EXISTS "course_images_public_read" ON storage.objects;

-- Any authenticated user may upload (open contribution).
DROP POLICY IF EXISTS "course_images_authenticated_insert" ON storage.objects;
CREATE POLICY "course_images_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-images');

-- Only the uploader may replace/remove their own object.
DROP POLICY IF EXISTS "course_images_owner_update" ON storage.objects;
CREATE POLICY "course_images_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'course-images' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'course-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "course_images_owner_delete" ON storage.objects;
CREATE POLICY "course_images_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'course-images' AND owner = auth.uid());
