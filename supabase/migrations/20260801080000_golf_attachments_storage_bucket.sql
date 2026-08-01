-- =============================================================================
-- Create the `golf-attachments` storage bucket and its four RLS policies.
--
-- WHAT IS WRONG. Attaching a file to a golf message fails in production,
-- because the bucket it uploads to has never existed.
--
-- The path is fully live, not dormant code:
--   FairwayMessages.tsx:355  handleSendMessageWithAttachments
--     -> hooks/golf/use-message-attachments
--     -> actions/message-attachments.ts  sendGolfMessageWithAttachments
--     -> lib/storage/attachments.ts:253  .from('golf-attachments').upload(...)
--
-- `storage.buckets` holds exactly eight rows — avatars, baseball-imports,
-- course-images, documents, helm-bridge-feedback, lifting-nutrition, logos,
-- recruit-documents. `golf-attachments` is not among them, so every upload
-- returns "Bucket not found" and the attachment is silently lost.
--
-- Found by sweeping every bucket name referenced in src/ against
-- storage.buckets. That sweep found three misses: this one, `expense-receipts`
-- (golf travel receipts), and `baseball_videos` (#1173). Only this one is fixed
-- here — see the note at the bottom for why the other two are not.
--
-- VALUES ARE READ FROM THE CODE, NOT CHOSEN.
--   public            = false. lib/storage/attachments.ts and
--                       message-attachments.ts read every file back through
--                       `createSignedUrl(path, 3600)` — never getPublicUrl —
--                       so the bucket must be private for that to be meaningful.
--   file_size_limit   = 104857600 (100 MiB), the max of FILE_SIZE_LIMITS in
--                       lib/storage/attachments.ts (video: 100MB).
--   allowed_mime_types= the 29 keys of ALLOWED_MIME_TYPES in the same file,
--                       reproduced verbatim. The app validates these client-side
--                       already; duplicating them here means a forged request
--                       cannot store a type the app would refuse to render.
--
-- THE PATH SHAPE DRIVES THE POLICIES. generateStoragePath() (attachments.ts:142)
-- builds:
--     conversations/<conversationId>/<messageId>/<timestamp>_<name>
-- so storage.foldername(name) is {conversations, <conversationId>, <messageId>}
-- and element [2] is the conversation id.
--
-- WHY [2] IS COMPARED AS TEXT, NOT CAST TO uuid. The obvious spelling is
-- `((storage.foldername(name))[2])::uuid IN (SELECT ...)`, which is what the
-- recruit-documents policies do with element [1]. But `name` is attacker-
-- controlled: a client can request any object path it likes, and a path whose
-- second segment is not a uuid makes that cast raise 22P02 rather than return
-- false. AND does not reliably short-circuit in PostgreSQL, so a guard placed
-- to its left is not a guarantee. Casting the FUNCTION'S OWN uuid output to
-- text instead keeps every comparison on a type that cannot fail to convert.
--
-- Both halves of that were verified against this database rather than reasoned
-- about, since the whole point is which one raises:
--   (storage.foldername('conversations/not-a-uuid/x/y.png'))[2] IN (<uuid>::text)
--     -> false
--   ((storage.foldername('conversations/not-a-uuid/x/y.png'))[2])::uuid
--     -> ERROR 22P02 invalid input syntax for type uuid: "not-a-uuid"
--
-- Worth knowing, not fixed here: the four recruit_documents_* policies already
-- in production cast element [1] to uuid this way, so a request for a
-- malformed path under that bucket raises instead of returning false. It fails
-- CLOSED — an error grants nothing — so this is log noise and a 500 where a
-- 403 belongs, not an access hole. Left alone because changing a live policy
-- on a bucket holding real recruit files is not a side errand.
--
-- WHY user_conversation_ids(). It is already the established golf messaging
-- helper — STABLE SECURITY DEFINER, `SET search_path = public`, selecting
-- conversation_id from golf_conversation_participants for a given user. Using
-- it keeps "who is in this conversation" defined in exactly one place, rather
-- than restating the join here where it could drift.
--
-- SELECT/INSERT are scoped to conversation membership; UPDATE/DELETE are
-- scoped to `owner`, which storage sets to auth.uid() on upload. That mirrors
-- the app, where deleteGolfMessageAttachment refuses unless
-- message.sender_id = user.id (message-attachments.ts:298) — so a participant
-- can read every attachment in their conversation but can only remove their own.
--
-- ON THE OMITTED `WITH CHECK` FOR UPDATE: for UPDATE, when WITH CHECK is
-- omitted PostgreSQL applies the USING expression to the NEW row as well, so
-- the owner predicate is enforced in both directions. This is the same
-- reasoning recorded in 20260730030000 for the avatars policies; it is stated
-- again here so the asymmetry with the recruit-documents policies (which do
-- spell out WITH CHECK) does not read as an oversight.
--
-- ADDITIVE AND IDEMPOTENT. The insert is ON CONFLICT DO NOTHING and every
-- policy is dropped-if-exists first, so re-running is a no-op. No existing
-- bucket, object, or policy is modified.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'golf-attachments',
  'golf-attachments',
  false,
  104857600,
  ARRAY[
    -- images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
    -- video
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/3gpp',
    -- audio
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
    -- documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Read: anyone in the conversation the file was posted to.
DROP POLICY IF EXISTS golf_attachments_participant_select ON storage.objects;
CREATE POLICY golf_attachments_participant_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'golf-attachments'
    AND (storage.foldername(name))[2] IN (
      SELECT public.user_conversation_ids(auth.uid())::text
    )
  );

-- Write: only into a conversation you are a participant of.
DROP POLICY IF EXISTS golf_attachments_participant_insert ON storage.objects;
CREATE POLICY golf_attachments_participant_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'golf-attachments'
    AND (storage.foldername(name))[2] IN (
      SELECT public.user_conversation_ids(auth.uid())::text
    )
  );

-- Modify / remove: only your own upload, matching the app's sender-only rule.
DROP POLICY IF EXISTS golf_attachments_owner_update ON storage.objects;
CREATE POLICY golf_attachments_owner_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'golf-attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS golf_attachments_owner_delete ON storage.objects;
CREATE POLICY golf_attachments_owner_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'golf-attachments' AND owner = auth.uid());

-- =============================================================================
-- NOT FIXED HERE, deliberately:
--
--   `expense-receipts` (actions/travel.ts:885) — golf travel receipt upload,
--   equally broken. It is not a bucket-creation problem alone: the code calls
--   getPublicUrl() and persists the result to golf_travel_expenses.receipt_url,
--   which FairwayExpenseList renders later. A private bucket would need the
--   read path to sign on demand instead; a public bucket makes every uploaded
--   receipt readable by anyone holding the URL. Financial documents, so that is
--   a product decision, not a migration.
--
--   `baseball_videos` (#1173) — note the underscore. No bucket in this project
--   uses underscores, and neither `baseball_videos` nor `baseball-videos`
--   exists, so the intended name is genuinely unknown.
-- =============================================================================
