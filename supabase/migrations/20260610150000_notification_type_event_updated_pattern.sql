-- PR #259 review follow-up (Devin finding, verified real): notifyEventUpdate
-- writes content-bearing types 'event_updated:<start|end>' so reschedules
-- re-notify (audit finding #18), but the CHECK only allowed the bare
-- 'event_updated' (or 'rsvp_response:%') — every reschedule notification
-- insert violated the constraint and was silently dropped (the insert error
-- was only console-logged). Allow the pattern.
-- APPLY: via MCP apply_migration (apply-time stamp, NOT this filename).
-- ROLLBACK: re-add the constraint without the 'event_updated:%' arm.
ALTER TABLE public.golf_calendar_notifications
  DROP CONSTRAINT golf_calendar_notifications_notification_type_check;
ALTER TABLE public.golf_calendar_notifications
  ADD CONSTRAINT golf_calendar_notifications_notification_type_check
  CHECK (
    notification_type = ANY (ARRAY['event_invitation','event_updated','event_cancelled','rsvp_response','rsvp_reminder','event_reminder','event_reminder_24h','event_reminder_1h','event_reminder_manual','message','announcement','task_assigned','qualifier_created','reminder','update','cancellation','rsvp_request'])
    OR notification_type LIKE 'rsvp_response:%'
    OR notification_type LIKE 'event_updated:%'
  );
