/**
 * Email Notification Service
 *
 * Uses Resend for transactional emails.
 * Falls back gracefully if Resend is not configured.
 */

import { createClient } from '@/lib/supabase/server';
import type { NotificationPreferences, NotificationType, EmailTemplate } from './types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';

// Resend client - lazy loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resendClient: any = null;

async function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured - emails will not be sent');
    return null;
  }

  if (!resendClient) {
    const { Resend } = await import('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

/**
 * Get user's notification preferences
 * Reads from users.notification_preferences JSONB column.
 * Falls back to defaults if preferences not set or column missing.
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('id', userId)
      .single();

    if (error) {
      // Column might not exist yet or user not found - use defaults
      console.warn('Failed to fetch notification preferences:', error.message);
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    if (data?.notification_preferences && typeof data.notification_preferences === 'object') {
      // Merge with defaults to ensure all required fields exist
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(data.notification_preferences as Partial<NotificationPreferences>),
      };
    }

    return DEFAULT_NOTIFICATION_PREFERENCES;
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Update user's notification preferences
 */
export async function updateUserNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Get current preferences and merge with updates
    const currentPrefs = await getUserNotificationPreferences(userId);
    const updatedPrefs = {
      ...currentPrefs,
      ...preferences,
    };

    const { error } = await supabase
      .from('users')
      .update({ notification_preferences: updatedPrefs })
      .eq('id', userId);

    if (error) {
      console.error('Failed to update notification preferences:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Database notification types (from notifications table enum)
type DbNotificationType =
  | 'message'
  | 'profile_view'
  | 'watchlist_add'
  | 'video_view'
  | 'team_invite'
  | 'team_join_request'
  | 'team_join_approved'
  | 'event_reminder'
  | 'dev_plan_assigned';

/**
 * Map internal NotificationType to database notification type
 * Returns null for types that don't have a database equivalent
 */
function mapToDbNotificationType(type: NotificationType): DbNotificationType | null {
  const mapping: Partial<Record<NotificationType, DbNotificationType>> = {
    'new_message': 'message',
    'profile_view': 'profile_view',
    'watchlist_add': 'watchlist_add',
    'event_rsvp_reminder': 'event_reminder',
  };
  return mapping[type] ?? null;
}

/**
 * Check if user wants notifications for a specific type
 */
function shouldSendEmail(
  type: NotificationType,
  prefs: NotificationPreferences
): boolean {
  switch (type) {
    // Messages
    case 'new_message':
      return prefs.email_messages;

    // Pipeline/Recruiting
    case 'watchlist_add':
    case 'pipeline_stage_change':
      return prefs.email_pipeline_updates;

    // Events
    case 'camp_registration':
    case 'event_rsvp_reminder':
    case 'qualifier_created':
    case 'qualifier_updated':
      return prefs.email_event_reminders;

    // Profile activity
    case 'profile_view':
      return prefs.email_profile_views;

    // Announcements
    case 'team_announcement':
    case 'coachhelm_insight':
    case 'round_submitted':
      return prefs.email_announcements;

    // Tasks
    case 'task_reminder':
    case 'task_assigned':
    case 'task_completed':
      return prefs.email_task_reminders;

    default:
      return true;
  }
}

/**
 * Generate email template based on notification type
 */
function generateEmailTemplate(
  type: NotificationType,
  data: Record<string, unknown>
): EmailTemplate {
  switch (type) {
    case 'new_message':
      return {
        subject: `New message from ${data.senderName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">New Message</h2>
            <p>You have a new message from <strong>${data.senderName}</strong>.</p>
            <p style="padding: 16px; background: #f8fafc; border-radius: 8px; color: #475569;">
              "${String(data.preview || '').slice(0, 200)}${String(data.preview || '').length > 200 ? '...' : ''}"
            </p>
            <a href="${data.messageUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              View Message
            </a>
          </div>
        `,
        text: `New message from ${data.senderName}: "${data.preview}". View at: ${data.messageUrl}`,
      };

    case 'watchlist_add':
      return {
        subject: `${data.coachName} added you to their watchlist`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">You're on a Watchlist!</h2>
            <p><strong>${data.coachName}</strong> from <strong>${data.schoolName}</strong> added you to their recruiting watchlist.</p>
            <p style="color: #475569;">This means they're interested in learning more about you.</p>
            <a href="${data.profileUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              View Your Profile
            </a>
          </div>
        `,
        text: `${data.coachName} from ${data.schoolName} added you to their watchlist. View your profile: ${data.profileUrl}`,
      };

    case 'pipeline_stage_change':
      return {
        subject: `Your recruiting status updated with ${data.schoolName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">Recruiting Status Update</h2>
            <p>Your status with <strong>${data.schoolName}</strong> has been updated to: <strong>${data.newStage}</strong></p>
            <a href="${data.journeyUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              View Your Journey
            </a>
          </div>
        `,
        text: `Your recruiting status with ${data.schoolName} updated to ${data.newStage}. View your journey: ${data.journeyUrl}`,
      };

    case 'profile_view':
      return {
        subject: `${data.viewerInfo} viewed your profile`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">Profile View</h2>
            <p><strong>${data.viewerInfo}</strong> viewed your profile.</p>
            <p style="color: #475569;">Make sure your profile is up to date to make a great impression.</p>
            <a href="${data.profileUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              Review Your Profile
            </a>
          </div>
        `,
        text: `${data.viewerInfo} viewed your profile. Review it at: ${data.profileUrl}`,
      };

    case 'team_announcement':
      return {
        subject: `Team Announcement: ${data.title}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">${data.title}</h2>
            <p>From: <strong>${data.coachName}</strong></p>
            <div style="padding: 16px; background: #f8fafc; border-radius: 8px; color: #475569;">
              ${data.content}
            </div>
            <a href="${data.announcementUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              View Full Announcement
            </a>
          </div>
        `,
        text: `Team Announcement from ${data.coachName}: ${data.title}. ${data.content}`,
      };

    case 'qualifier_created':
      return {
        subject: `New Qualifier: ${data.qualifierName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">New Qualifier Created</h2>
            <p>A new qualifier has been created: <strong>${data.qualifierName}</strong></p>
            <p>Start Date: ${data.startDate}</p>
            <p>Rounds: ${data.numRounds}</p>
            <a href="${data.qualifierUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              View Qualifier
            </a>
          </div>
        `,
        text: `New qualifier: ${data.qualifierName} starting ${data.startDate}. View at: ${data.qualifierUrl}`,
      };

    case 'event_rsvp_reminder':
      return {
        subject: `Reminder: RSVP for ${data.eventName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">RSVP Reminder</h2>
            <p>Don't forget to RSVP for: <strong>${data.eventName}</strong></p>
            <p>Date: ${data.eventDate}</p>
            <p>Location: ${data.location}</p>
            <a href="${data.eventUrl}" style="display: inline-block; padding: 12px 24px; background: #16A34A; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
              RSVP Now
            </a>
          </div>
        `,
        text: `Reminder to RSVP for ${data.eventName} on ${data.eventDate}. RSVP at: ${data.eventUrl}`,
      };

    default:
      return {
        subject: 'Notification from Helm',
        html: `<p>You have a new notification.</p>`,
        text: 'You have a new notification from Helm.',
      };
  }
}

/**
 * Send an email notification
 */
export async function sendEmailNotification(
  type: NotificationType,
  recipientId: string,
  recipientEmail: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check user preferences
    const prefs = await getUserNotificationPreferences(recipientId);
    if (!shouldSendEmail(type, prefs)) {
      return { success: true }; // User opted out, but not an error
    }

    // Get Resend client
    const resend = await getResendClient();
    if (!resend) {
      return { success: false, error: 'Email service not configured' };
    }

    // Generate email content
    const template = generateEmailTemplate(type, data);

    // Send email
    await resend.emails.send({
      from: 'Helm Sports <notifications@helmsportslabs.com>',
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    // Log notification in database (only if type has a database equivalent)
    const dbType = mapToDbNotificationType(type);
    if (dbType) {
      const supabase = await createClient();
      await supabase.from('notifications').insert({
        user_id: recipientId,
        type: dbType,
        title: template.subject,
        data: data as unknown as Record<string, never>,
        read: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send email notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send notification to multiple recipients
 */
export async function sendBulkEmailNotification(
  type: NotificationType,
  recipients: Array<{ id: string; email: string }>,
  data: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendEmailNotification(
      type,
      recipient.id,
      recipient.email,
      data
    );
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
