/**
 * Notification Types and Preferences
 */

export type NotificationType =
  // Baseball notifications
  | 'new_message'
  | 'watchlist_add'
  | 'pipeline_stage_change'
  | 'camp_registration'
  | 'profile_view'
  // Golf notifications
  | 'team_announcement'
  | 'qualifier_created'
  | 'qualifier_updated'
  | 'event_rsvp_reminder'
  | 'round_submitted'
  | 'coachhelm_insight'
  // Task notifications
  | 'task_reminder'
  | 'task_assigned'
  | 'task_completed'
  | 'dev_plan_assigned';

export interface NotificationPreferences {
  // Email preferences
  email_messages: boolean;
  email_pipeline_updates: boolean;
  email_event_reminders: boolean;
  email_profile_views: boolean;
  email_announcements: boolean;
  email_task_reminders: boolean;
  // Push preferences
  push_messages: boolean;
  push_events: boolean;
  push_task_reminders: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_messages: true,
  email_pipeline_updates: true,
  email_event_reminders: true,
  email_profile_views: false, // Off by default to avoid spam
  email_announcements: true,
  email_task_reminders: true,
  push_messages: false,
  push_events: false,
  push_task_reminders: true,
};

export interface NotificationPayload {
  type: NotificationType;
  recipientId: string;
  recipientEmail: string;
  data: Record<string, unknown>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}
