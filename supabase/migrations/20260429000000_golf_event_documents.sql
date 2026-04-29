-- =============================================================================
-- golf_event_documents — link table for attaching golf_documents to a
-- golf_events row (e.g. attaching a practice plan PDF to a Tuesday practice).
--
-- Composite PK on (event_id, document_id) prevents duplicate attachments.
-- RLS:
--   SELECT  — coaches and players on the event's team can see attachments.
--   INSERT  — coaches on the event's team can attach.
--   DELETE  — coaches on the event's team can detach.
--   UPDATE  — never (toggle attached/detached by INSERT/DELETE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.golf_event_documents (
  event_id     uuid NOT NULL REFERENCES public.golf_events(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES public.golf_documents(id) ON DELETE CASCADE,
  attached_by  uuid REFERENCES public.golf_coaches(id) ON DELETE SET NULL,
  attached_at  timestamptz NOT NULL DEFAULT now(),
  note         text,
  PRIMARY KEY (event_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_event_documents_event_id
  ON public.golf_event_documents (event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_documents_document_id
  ON public.golf_event_documents (document_id);

ALTER TABLE public.golf_event_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone on the event's team can read.
CREATE POLICY golf_event_documents_select_team
  ON public.golf_event_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_events e
      WHERE e.id = golf_event_documents.event_id
        AND (
          public.is_golf_team_coach(e.team_id)
          OR public.is_golf_team_player(e.team_id)
        )
    )
  );

-- INSERT: coaches on the event's team only.
CREATE POLICY golf_event_documents_insert_coach
  ON public.golf_event_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_events e
      WHERE e.id = golf_event_documents.event_id
        AND public.is_golf_team_coach(e.team_id)
    )
  );

-- DELETE: coaches on the event's team only.
CREATE POLICY golf_event_documents_delete_coach
  ON public.golf_event_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_events e
      WHERE e.id = golf_event_documents.event_id
        AND public.is_golf_team_coach(e.team_id)
    )
  );
