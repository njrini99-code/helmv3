-- =============================================================================
-- Put the `avatars` bucket and its four RLS policies under migration control.
--
-- WHAT WAS WRONG — the same class as 20260730020000 (the auth.users trigger).
--
-- Production has 8 storage buckets. Seven are created by tracked migrations.
-- `avatars` is not — it was created 2026-03-06 and has lived only in production
-- since, together with its four `storage.objects` policies (23 of production's 27
-- storage policies are tracked; the 4 avatar ones were the gap).
--
-- `avatars` is not decorative. `src/components/ui/avatar-upload.tsx` defaults to
-- it, and AvatarUpload is rendered in three live places — golf coach onboarding
-- (`golf/(onboarding)/coach/page.tsx:517`), golf player onboarding
-- (`player/page.tsx:399`) and Fairway settings
-- (`FairwaySettingsGeneral.tsx:903`). So on any database built from
-- `supabase/migrations/` — `supabase start`, a Supabase preview branch, a restore
-- drill — avatar upload during ONBOARDING fails, because neither the bucket nor
-- the policies exist.
--
-- Found by sweeping for the class after the auth.users trigger turned out to be
-- missing for the same structural reason: the active baseline
-- `20260527000000_prod_public_baseline.sql` is a PUBLIC-SCHEMA-ONLY dump, so
-- nothing in `auth`, `storage`, `cron` or `realtime` could ever have been
-- captured by it. Everything else that sweep checked came back tracked: the one
-- pg_cron job (`purge-admin-event-telemetry`, 20260703043000), the other seven
-- buckets, and the remaining 23 storage policies.
--
-- VALUES READ FROM PRODUCTION on 2026-07-30, not guessed:
--   public = true, file_size_limit = 2097152 (2 MiB),
--   allowed_mime_types = {image/jpeg, image/png, image/gif, image/webp}
--   policies via pg_policies.qual / with_check, reproduced verbatim below.
--
-- THE UPDATE POLICY'S MISSING `WITH CHECK` IS NOT A HOLE. An earlier draft of this
-- header claimed it was — that a user could UPDATE a row they own and move it out of
-- their own folder, because the owner check was "not re-applied to the new row."
-- That is wrong, and the correction is worth keeping here so nobody re-files it:
--
--   For UPDATE, when `WITH CHECK` is omitted, PostgreSQL applies the `USING`
--   expression to the NEW row as well as the old one.
--
-- Verified by execution rather than from the docs, in a rolled-back transaction on a
-- throwaway table with a USING-only UPDATE policy: moving a row out of the predicate
-- fails with `42501 new row violates row-level security policy`, while a control
-- update that stays inside the predicate succeeds — so the probe is not vacuous.
--
-- Production's policy is therefore already owner-scoped on both sides, and adding an
-- explicit `WITH CHECK` would change nothing but the reading. The policies below
-- reproduce production exactly, which is this file's job.
--
-- WHY `DO NOTHING` AND CONDITIONAL CREATES. Strictly additive, and a genuine
-- no-op on production. The sibling `20260728173939_documents_storage_bucket_rls`
-- uses `ON CONFLICT DO UPDATE` because its job was to REPLACE permissive
-- historical policies. This file's job is the opposite: bring a database that has
-- nothing up to what production already has, and change nothing on a database
-- that already has it.
--
-- NOT APPLIED BY THE AUTHOR. Production already has all five objects.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,     -- public read; avatar URLs are embedded directly in the UI
  2097152,  -- 2 MiB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies are created one at a time behind an existence check. No
-- DROP POLICY IF EXISTS: dropping would take a lock on storage.objects and would
-- silently replace whatever production actually has if the two ever diverged from
-- what is written here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Avatars accessible to authenticated'
  ) THEN
    CREATE POLICY "Avatars accessible to authenticated"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can upload their own avatar'
  ) THEN
    CREATE POLICY "Users can upload their own avatar"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can update their own avatar'
  ) THEN
    -- USING only, matching production. Postgres applies this to the new row too
    -- when WITH CHECK is omitted — verified, see the header note.
    CREATE POLICY "Users can update their own avatar"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can delete their own avatar'
  ) THEN
    CREATE POLICY "Users can delete their own avatar"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (auth.uid())::text
      );
  END IF;
END
$$;
