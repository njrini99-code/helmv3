-- DECLARATIVE: exempt storage bucket row, data not schema
-- STATUS: WRITTEN, NOT APPLIED. Replay capture: production already has this
-- bucket with these settings (verified read-only 2026-10-28). See HELD.md
-- (row 20261028140700) and docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW. One private bucket row; ON CONFLICT leaves production's row as it
-- is.
--
-- Why: the Helm Bridge feedback upload writes screenshots to the bucket named
-- by HELM_BRIDGE_FEEDBACK_BUCKET (helm-bridge-feedback in production). The
-- bucket was made in the dashboard, so a replayed database has none and the
-- upload fails there. Production has no storage.objects policy for it: only
-- the service role reads or writes it, and this file adds none.
--
-- ROLLBACK: delete from storage.buckets where id = 'helm-bridge-feedback'
-- ROLLBACK: (only on a replayed database, and only while it holds no objects).
--
-- VERIFY: select 1 from storage.buckets
-- VERIFY: where id = 'helm-bridge-feedback' and public = false
-- VERIFY: and file_size_limit = 8388608;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'helm-bridge-feedback',
  'helm-bridge-feedback',
  false,
  8388608,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;
