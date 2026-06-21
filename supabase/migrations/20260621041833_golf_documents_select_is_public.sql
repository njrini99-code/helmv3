-- Wave A · A2 — golf_documents player SELECT must honor is_public
-- Audit finding: F003 (CRITICAL) — golf_documents_select_team granted SELECT to
-- any team coach OR any team player with NO is_public check, so a player who
-- obtained a coach-only (is_public = false) document id could read its metadata
-- and a signed preview URL.
--
-- Fix: coaches keep full team visibility; players may only SELECT documents
-- explicitly marked is_public = true. (NULL is treated as not-public.)
DROP POLICY IF EXISTS golf_documents_select_team ON public.golf_documents;
CREATE POLICY golf_documents_select_team ON public.golf_documents
  FOR SELECT
  TO public
  USING (
    is_golf_team_coach(team_id)
    OR (is_golf_team_player(team_id) AND is_public = true)
  );
