\ir _helpers.sql

BEGIN;

SELECT plan(29);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'documents'
      AND name = 'documents'
      AND public IS FALSE
      AND file_size_limit = 26214400
  ),
  'documents is a private 25 MB storage bucket'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname IN (
        'documents_select_team_scope',
        'documents_insert_manage_scope',
        'documents_update_manage_scope',
        'documents_delete_manage_scope'
      )
  ),
  4,
  'all four documents object policies exist'
);

SELECT is(
  (
    SELECT policy.polcmd::text
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'r',
  'documents select policy only grants SELECT'
);

SELECT is(
  (
    SELECT policy.polcmd::text
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_insert_manage_scope'
  ),
  'a',
  'documents insert policy only grants INSERT'
);

SELECT is(
  (
    SELECT policy.polcmd::text
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_update_manage_scope'
  ),
  'w',
  'documents update policy only grants UPDATE'
);

SELECT is(
  (
    SELECT policy.polcmd::text
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_delete_manage_scope'
  ),
  'd',
  'documents delete policy only grants DELETE'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname LIKE 'documents_%'
      AND (
        policy.polroles = '{0}'::oid[]
        OR policy.polroles && ARRAY[
          (SELECT oid FROM pg_roles WHERE rolname = 'anon')
        ]::oid[]
      )
  ),
  'documents policies never target PUBLIC or anon'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname IN (
        'Anyone can view documents',
        'Documents accessible to authed users',
        'Authenticated users can upload documents',
        'Authenticated users can update documents',
        'Authenticated users can delete documents'
      )
  ),
  'legacy bucket-wide documents policies are removed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname NOT IN (
        'documents_select_team_scope',
        'documents_insert_manage_scope',
        'documents_update_manage_scope',
        'documents_delete_manage_scope'
      )
      AND (
        coalesce(qual, '') LIKE '%bucket_id = ''documents''::text%'
        OR coalesce(with_check, '') LIKE '%bucket_id = ''documents''::text%'
      )
  ),
  'no additional permissive policy applies to the documents bucket'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        lower(btrim(coalesce(qual, ''))) IN ('true', '(true)')
        OR lower(btrim(coalesce(with_check, ''))) IN ('true', '(true)')
      )
  ),
  'no unconditional storage object policy can bypass bucket scoping'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname IN (
        'documents_select_team_scope',
        'documents_insert_manage_scope',
        'documents_update_manage_scope',
        'documents_delete_manage_scope'
      )
      AND policy.polroles = ARRAY[
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
      ]::oid[]
  ),
  4,
  'all documents object policies target only authenticated'
);

SELECT ok(
  (
    SELECT policy.polroles = ARRAY[
      (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
    ]::oid[]
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'documents select policy targets only authenticated'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%bucket_id = ''documents''%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'documents select policy is bucket scoped'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%golf-documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'documents select policy requires the golf path prefix'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%baseball-documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'documents select policy requires the baseball path prefix'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%is_golf_team_coach%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'golf coaches can read team document objects'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%is_baseball_team_staff%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'baseball staff can read team document objects'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%golf_document_versions%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%golf_documents%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%is_public%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%is_golf_team_player%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'golf player reads require a linked public document version'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%baseball_document_versions%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%baseball_documents%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%is_player_visible%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%is_baseball_team_member%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'baseball player reads require a linked player-visible document version'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polwithcheck, policy.polrelid)
      LIKE '%bucket_id = ''documents''%'
      AND pg_get_expr(policy.polwithcheck, policy.polrelid)
        LIKE '%is_golf_team_coach%'
      AND pg_get_expr(policy.polwithcheck, policy.polrelid)
        LIKE '%has_baseball_staff_capability%'
      AND pg_get_expr(policy.polwithcheck, policy.polrelid)
        LIKE '%can_manage_documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_insert_manage_scope'
  ),
  'document inserts require golf coach or baseball document capability'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%is_golf_team_coach%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%has_baseball_staff_capability%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%can_manage_documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_update_manage_scope'
  ),
  'document update USING keeps coach/capability scope'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polwithcheck, policy.polrelid)
      LIKE '%is_golf_team_coach%'
      AND pg_get_expr(policy.polwithcheck, policy.polrelid)
        LIKE '%has_baseball_staff_capability%'
      AND pg_get_expr(policy.polwithcheck, policy.polrelid)
        LIKE '%can_manage_documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_update_manage_scope'
  ),
  'document update WITH CHECK prevents moving objects across teams'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%is_golf_team_coach%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%has_baseball_staff_capability%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%can_manage_documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_delete_manage_scope'
  ),
  'document deletes require golf coach or baseball document capability'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polwithcheck, policy.polrelid)
      NOT LIKE '%::uuid%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_insert_manage_scope'
  ),
  'insert policy does not cast user-controlled path segments to uuid'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      NOT LIKE '%::uuid%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'select policy does not cast user-controlled path segments to uuid'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%storage_path = objects.name%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'player reads bind the exact object name to a version storage path'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%team_id%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%foldername%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_select_team_scope'
  ),
  'player reads bind the document team to the object path'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polwithcheck, policy.polrelid)
      LIKE '%golf_teams%'
      AND pg_get_expr(policy.polwithcheck, policy.polrelid)
        LIKE '%baseball_teams%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_insert_manage_scope'
  ),
  'write authorization resolves both team types from canonical rows'
);

SELECT ok(
  (
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
      LIKE '%golf-documents%'
      AND pg_get_expr(policy.polqual, policy.polrelid)
        LIKE '%baseball-documents%'
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND policy.polname = 'documents_delete_manage_scope'
  ),
  'delete authorization requires a supported sport path prefix'
);

SELECT * FROM finish();

ROLLBACK;
