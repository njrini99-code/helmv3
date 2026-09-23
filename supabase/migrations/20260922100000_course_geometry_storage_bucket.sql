-- ============================================================================
-- Course Geometry Factory v2, D2: Supabase Storage bucket for published
-- course-geometry assets.
-- ----------------------------------------------------------------------------
-- Public-read bucket `course-geometry` so a factory-published course package,
-- context layer and per-hole terrain (Factory v2 §16.1) can be served from
-- Supabase Storage instead of the app's own `public/course-geometry/` folder
-- once a layout's `CourseGeometryPolicy.assetBaseUrl` points there
-- (`src/lib/golf/course-geometry/course-policy.ts`). Peek'n Peak Upper stays
-- on the static folder; only a layout whose approval names this bucket's
-- public URL as its `assetBaseUrl` uses it.
--
-- Same shape as `course-images` (20260613180000_course_images_storage.sql):
-- content is non-sensitive (published, owner-approved geometry — never a
-- player record), served by public URL, so there is no SELECT policy either
-- (a public bucket needs none to be read; adding one only risks the
-- `public_bucket_allows_listing` advisory for no benefit — the app never
-- lists this bucket, it fetches exact hash-named paths from a manifest).
--
-- Writes are service_role only. `service_role` bypasses RLS and storage
-- policies entirely, so "service-role-only writes" means adding NO
-- INSERT/UPDATE/DELETE policy for `anon` or `authenticated` — there is
-- deliberately nothing here for them to match. Publishing (`ship --approve`,
-- plan §Phase 3) uploads through the service-role key from a trusted
-- pipeline, never from a player or coach session.
--
-- Idempotent (re-runnable): bucket upsert only, no policy to (re-)create.
--
-- ROLLBACK:
--   delete from storage.buckets where id = 'course-geometry';
--   (Only while the bucket is empty — empty it through the Storage API first.
--   Nothing else is touched, so removing the row fully reverts it.)
--
-- VERIFY: select 1 from storage.buckets where id = 'course-geometry' and public and file_size_limit = 20971520 and allowed_mime_types = array['application/json'];
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-geometry',
  'course-geometry',
  true,
  20971520,  -- 20 MB — a published package + one hole's terrain mesh comfortably fits; the manifest/terrain files are JSON, not media.
  ARRAY['application/json']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
