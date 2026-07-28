-- Put the private team-document bucket under active migration control. The
-- 2026-05-27 fresh baseline does not create it, while production has a
-- manually retained bucket with permissive, bucket-wide policies. Both golf
-- and baseball document actions use this bucket.
--
-- Object paths are:
--   golf-documents/{team_id}/{uuid}.{ext}
--   baseball-documents/{team_id}/{uuid}.{ext}
--
-- The team lookup compares UUIDs as text instead of casting an
-- attacker-controlled path segment to uuid. This makes malformed paths deny
-- access rather than raising an exception.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documents',
  'documents',
  false,
  26214400, -- 25 MB; matches the Next.js Server Action transport ceiling.
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'image/svg+xml',
    'text/plain',
    'text/markdown',
    'text/csv',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Remove the historical bucket-wide policies. RLS policies are permissive by
-- default, so leaving any of these in place would OR them with the scoped
-- policies below and preserve cross-team access.
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Documents accessible to authed users" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;

DROP POLICY IF EXISTS documents_select_team_scope ON storage.objects;
CREATE POLICY documents_select_team_scope
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    -- Coaches/staff need immediate read access so the server can sign a newly
    -- uploaded object before its document/version rows have been inserted.
    EXISTS (
      SELECT 1
      FROM public.golf_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'golf-documents'
        AND public.is_golf_team_coach(team.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.baseball_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'baseball-documents'
        AND public.is_baseball_team_staff(team.id)
    )
    -- Players may only sign/read a stored version after it is linked to a
    -- player-visible document on one of their active teams.
    OR EXISTS (
      SELECT 1
      FROM public.golf_document_versions AS version
      JOIN public.golf_documents AS document
        ON document.id = version.document_id
      WHERE version.storage_path = storage.objects.name
        AND document.team_id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'golf-documents'
        AND document.is_public IS TRUE
        AND public.is_golf_team_player(document.team_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.baseball_document_versions AS version
      JOIN public.baseball_documents AS document
        ON document.id = version.document_id
      WHERE version.storage_path = storage.objects.name
        AND document.team_id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'baseball-documents'
        AND document.is_player_visible IS TRUE
        AND public.is_baseball_team_member(document.team_id)
    )
  )
);

DROP POLICY IF EXISTS documents_insert_manage_scope ON storage.objects;
CREATE POLICY documents_insert_manage_scope
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.golf_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'golf-documents'
        AND public.is_golf_team_coach(team.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.baseball_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'baseball-documents'
        AND public.has_baseball_staff_capability(
          team.id,
          'can_manage_documents'
        )
    )
  )
);

DROP POLICY IF EXISTS documents_update_manage_scope ON storage.objects;
CREATE POLICY documents_update_manage_scope
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.golf_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'golf-documents'
        AND public.is_golf_team_coach(team.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.baseball_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'baseball-documents'
        AND public.has_baseball_staff_capability(
          team.id,
          'can_manage_documents'
        )
    )
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.golf_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'golf-documents'
        AND public.is_golf_team_coach(team.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.baseball_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'baseball-documents'
        AND public.has_baseball_staff_capability(
          team.id,
          'can_manage_documents'
        )
    )
  )
);

DROP POLICY IF EXISTS documents_delete_manage_scope ON storage.objects;
CREATE POLICY documents_delete_manage_scope
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.golf_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'golf-documents'
        AND public.is_golf_team_coach(team.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.baseball_teams AS team
      WHERE team.id::text = (storage.foldername(storage.objects.name))[2]
        AND (storage.foldername(storage.objects.name))[1] = 'baseball-documents'
        AND public.has_baseball_staff_capability(
          team.id,
          'can_manage_documents'
        )
    )
  )
);
