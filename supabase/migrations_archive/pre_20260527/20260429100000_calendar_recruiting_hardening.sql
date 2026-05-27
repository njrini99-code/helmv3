-- =============================================================================
-- Hardening pass: rsvp_response notification dedupe key, recruiting bounds,
-- event/document team consistency.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Allow rsvp_response notifications to be per-player.
--    Prior CHECK only allowed bare 'rsvp_response', which collided with the
--    UNIQUE(event_id, user_id, notification_type) — so when player B
--    RSVP'd after player A, the coach's notification for B was silently
--    dropped. We now namespace the type as 'rsvp_response:<player_id>' and
--    widen the CHECK to allow that prefix.
-- ---------------------------------------------------------------------------
ALTER TABLE public.golf_calendar_notifications
  DROP CONSTRAINT IF EXISTS golf_calendar_notifications_notification_type_check;

ALTER TABLE public.golf_calendar_notifications
  ADD CONSTRAINT golf_calendar_notifications_notification_type_check
  CHECK (
    notification_type IN (
      -- calendar / RSVP
      'event_invitation', 'event_updated', 'event_cancelled',
      'rsvp_response', 'rsvp_reminder', 'event_reminder',
      'event_reminder_24h', 'event_reminder_1h', 'event_reminder_manual',
      -- messaging / team
      'message', 'announcement', 'task_assigned', 'qualifier_created',
      -- legacy values kept for existing rows
      'reminder', 'update', 'cancellation', 'rsvp_request'
    )
    OR notification_type LIKE 'rsvp_response:%'
  );

-- ---------------------------------------------------------------------------
-- 2. Bound free-form text on golf_recruits so a coach can't post a multi-MB
--    notes field. Length caps at the DB layer back up the action validation.
-- ---------------------------------------------------------------------------
ALTER TABLE public.golf_recruits
  ADD CONSTRAINT golf_recruits_lengths CHECK (
    length(first_name) <= 120
    AND (last_name IS NULL OR length(last_name) <= 120)
    AND (email IS NULL OR length(email) <= 254)
    AND (phone IS NULL OR length(phone) <= 40)
    AND (hometown IS NULL OR length(hometown) <= 120)
    AND (state IS NULL OR length(state) <= 2)
    AND (notes IS NULL OR length(notes) <= 5000)
    AND (hs_class IS NULL OR (hs_class BETWEEN 2020 AND 2040))
  );

-- ---------------------------------------------------------------------------
-- 3. golf_event_documents must reference a document on the SAME team as the
--    event. Without this a coach could attach team B's document to a team A
--    event by passing the cross-team UUID — RLS allows the insert because
--    the *event* is in their team. A trigger enforces team consistency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golf_event_documents_assert_same_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_team uuid;
  doc_team uuid;
BEGIN
  SELECT team_id INTO event_team FROM public.golf_events WHERE id = NEW.event_id;
  SELECT team_id INTO doc_team   FROM public.golf_documents WHERE id = NEW.document_id;
  IF event_team IS NULL THEN
    RAISE EXCEPTION 'event_id % does not exist', NEW.event_id;
  END IF;
  IF doc_team IS NULL THEN
    RAISE EXCEPTION 'document_id % does not exist', NEW.document_id;
  END IF;
  IF event_team <> doc_team THEN
    RAISE EXCEPTION 'document % and event % belong to different teams', NEW.document_id, NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS golf_event_documents_team_consistency ON public.golf_event_documents;
CREATE TRIGGER golf_event_documents_team_consistency
  BEFORE INSERT OR UPDATE ON public.golf_event_documents
  FOR EACH ROW EXECUTE FUNCTION public.golf_event_documents_assert_same_team();
