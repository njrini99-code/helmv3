COMMENT ON TABLE "public"."baseball_demo_sessions" IS 'Captures every visitor who enters the shared BaseballHelm demo coach experience. Written exclusively by the gate server action (admin/service-role client). No public access — service-role bypasses RLS for inserts; admin reads via createAdminClient().';

COMMENT ON COLUMN "public"."baseball_demo_sessions"."traffic_quality" IS 'Verdict on whether this gate entry was a human or a security scanner: automated | likely_human | unknown. Classified at write time from send-to-entry latency and IP fan-out.';

COMMENT ON COLUMN "public"."baseball_demo_sessions"."quality_reason" IS 'Human-readable justification for traffic_quality so heuristic classifications remain auditable.';

COMMENT ON COLUMN "public"."baseball_demo_sessions"."crm_coach_id" IS 'Links a demo tour to its CRM coach. ON DELETE SET NULL preserves traffic-quality evidence.';

COMMENT ON TABLE "public"."baseball_event_acknowledgements" IS 'Per-user acknowledgement (read receipt) of a baseball_events row. Unique per (event_id, user_id).';

COMMENT ON TABLE "public"."baseball_player_timeline_events" IS 'Per-player activity/history feed for BaseballHelm. visibility gates staff_only notes from players.';

COMMENT ON COLUMN "public"."baseball_player_timeline_events"."visibility" IS 'team | staff_only | player_only — staff_only is never returned to players by RLS.';

COMMENT ON COLUMN "public"."baseball_program_settings"."notification_defaults" IS 'Per-notification-type defaults, e.g. {"message": {"in_app": true, "email": false}}. Read by messages.ts (isBaseballMessageNotificationEnabled) and written by updateProgramSettings via ProgramSettingsClient (#454, #466).';

COMMENT ON COLUMN "public"."baseball_program_settings"."quiet_hours_start" IS 'Program-level quiet-hours start, e.g. "22:00". No notifications are sent during the quiet-hours window.';

COMMENT ON COLUMN "public"."baseball_program_settings"."quiet_hours_end" IS 'Program-level quiet-hours end, e.g. "07:00".';

COMMENT ON TABLE "public"."baseball_staff_invitations" IS 'Pending invitations for additional coaching staff, with a pre-assigned role and capability set. Managed by a team head coach or a staffer with can_invite_staff.';

COMMENT ON COLUMN "public"."baseball_tasks"."reminder_sent" IS 'True once the reminder_at reminder has been dispatched to assignees by the coachhelm-baseball-task-reminder-sweep cron. Idempotency flag: the sweep only dispatches rows where reminder_at <= now AND reminder_sent = false, then flips this to true. Reset to false by setTaskReminder when a new reminder is armed.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_roster" IS 'Add/remove/edit team roster members.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_practice" IS 'Create/edit practice plans and sessions.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_lifting" IS 'Manage strength & conditioning / lifting programs.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_view_academics" IS 'View player academic records.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_imports" IS 'Run data imports (rosters, stats, etc).';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_stats" IS 'Enter/edit team and player statistics.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_invite_staff" IS 'Invite and manage other staff for the team.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_settings" IS 'Edit team settings/configuration.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_view_medical" IS 'View player medical/injury information.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_message_team" IS 'Send team-wide messages/announcements.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_calendar" IS 'Create/edit team calendar and events.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."is_head_coach" IS 'Marks the staffer as a head coach (implicit full authority).';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."capabilities" IS 'Extensibility bag for additional/granular capability flags beyond the core booleans.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."status" IS 'Staff membership lifecycle: active | removed (soft-remove, never hard-deleted).';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."title" IS 'Optional free-text staff title shown in the roster (e.g. "Pitching Coach").';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_documents" IS 'Upload, edit, and delete team documents. Players read via RLS; writes require this cap.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_manage_lineups" IS 'Build and publish batting orders and lineups. Backs has_baseball_staff_capability(team_id, ''can_manage_lineups'').';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_view_readiness" IS 'See player wellness and soreness summaries. Backs has_baseball_staff_capability(team_id, ''can_view_readiness'').';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_modify_availability" IS 'Set player availability status and return-to-play. Backs has_baseball_staff_capability(team_id, ''can_modify_availability'').';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_view_private_notes" IS 'Read staff-only private notes. Backs has_baseball_staff_capability(team_id, ''can_view_private_notes'').';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_message_players" IS 'Send messages to players. Backs has_baseball_staff_capability(team_id, ''can_message_players''). can_message_team is a deprecated alias resolved at the app layer only (src/lib/baseball/capabilities.ts); not mirrored here.';

COMMENT ON COLUMN "public"."baseball_team_coach_staff"."can_export_reports" IS 'Export performance and team reports. Backs has_baseball_staff_capability(team_id, ''can_export_reports'').';
