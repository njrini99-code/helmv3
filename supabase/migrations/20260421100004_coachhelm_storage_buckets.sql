-- 20260421100004_coachhelm_storage_buckets.sql
-- Restrict public storage bucket listing (LIVE-29).
-- Team A — Database Foundation (CoachHelm fix plan, 2026-04-21)
--
-- Before: "Anyone can view avatars" and "Anyone can view documents" with
-- USING (bucket_id = '...') and no role restriction → anonymous listing allowed.
-- After: same scoping but restricted TO authenticated, plus 'documents' bucket
-- flipped to private so the app must use signed URLs.

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;

-- Avatars: still readable to any authenticated user (URL access via CDN continues to work)
CREATE POLICY "Avatars accessible to authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- Documents: switch to private and require auth. App must use signed URLs.
UPDATE storage.buckets SET public = false WHERE name = 'documents';
CREATE POLICY "Documents accessible to authed users" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
