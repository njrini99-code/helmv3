'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ReminderType, TaskReminderWithTask, GolfTask } from '@/lib/types/golf';

// Email service configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Helm Sports <notifications@helmsportslabs.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

// VAPID keys for Web Push (must match the service worker)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@helmsportslabs.com';

/**
 * Extended task type with user relations for notifications
 */
interface TaskWithUsers extends GolfTask {
  assignee?: { id: string; full_name: string; email: string } | null;
  creator?: { id: string; full_name: string; email: string } | null;
}

/**
 * Set a reminder on a task
 */
export async function setTaskReminder(
  taskId: string,
  reminderAt: string,
  reminderType: ReminderType = 'in_app'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Verify the user has access to this task
    const { data: task, error: taskError } = await supabase
      .from('golf_tasks')
      .select('id, team_id, created_by, assigned_to')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { success: false, error: 'Task not found' };
    }

    // Update the task with reminder information
    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update({
        reminder_at: reminderAt,
        reminder_type: reminderType,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      console.error('Error setting reminder:', updateError);
      return { success: false, error: 'Failed to set reminder' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('Error in setTaskReminder:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Cancel/remove a reminder from a task
 */
export async function cancelTaskReminder(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Update the task to remove reminder
    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update({
        reminder_at: null,
        reminder_type: null,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      console.error('Error canceling reminder:', updateError);
      return { success: false, error: 'Failed to cancel reminder' };
    }

    // Also delete any pending reminders in the queue
    await supabase
      .from('golf_task_reminders')
      .delete()
      .eq('task_id', taskId)
      .eq('sent', false);

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('Error in cancelTaskReminder:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get upcoming reminders for a user
 */
export async function getUpcomingReminders(
  userId: string,
  limit: number = 10
): Promise<{ data: TaskReminderWithTask[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Get reminders for tasks the user created or is assigned to
    const { data: reminders, error } = await supabase
      .from('golf_task_reminders')
      .select(`
        *,
        task:golf_tasks(*)
      `)
      .eq('sent', false)
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching reminders:', error);
      return { data: null, error: 'Failed to fetch reminders' };
    }

    // Filter to only include reminders for tasks the user owns or is assigned to
    const filteredReminders = (reminders || []).filter((reminder: { task: GolfTask | null }) => {
      const task = reminder.task;
      return task && (task.assigned_by === userId || task.assigned_to === userId);
    }) as TaskReminderWithTask[];

    return { data: filteredReminders };
  } catch (error) {
    console.error('Error in getUpcomingReminders:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Get reminders that are due to be sent
 * Called by cron/edge function
 */
export async function getDueReminders(
  batchSize: number = 100
): Promise<{ data: TaskReminderWithTask[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: reminders, error } = await supabase
      .from('golf_task_reminders')
      .select(`
        *,
        task:golf_tasks(
          *,
          assignee:users!assigned_to(id, full_name, email),
          creator:users!created_by(id, full_name, email)
        )
      `)
      .eq('sent', false)
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(batchSize);

    if (error) {
      console.error('Error fetching due reminders:', error);
      return { data: null, error: 'Failed to fetch due reminders' };
    }

    return { data: reminders as TaskReminderWithTask[] };
  } catch (error) {
    console.error('Error in getDueReminders:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Mark a reminder as sent
 */
export async function markReminderSent(
  reminderId: string,
  error?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const updateData: { sent: boolean; sent_at: string; error?: string } = {
      sent: true,
      sent_at: new Date().toISOString(),
    };

    if (error) {
      updateData.error = error;
    }

    const { error: updateError } = await supabase
      .from('golf_task_reminders')
      .update(updateData)
      .eq('id', reminderId);

    if (updateError) {
      console.error('Error marking reminder sent:', updateError);
      return { success: false, error: 'Failed to mark reminder as sent' };
    }

    // Also update the task's reminder_sent flag
    const { data: reminder } = await supabase
      .from('golf_task_reminders')
      .select('task_id')
      .eq('id', reminderId)
      .single();

    if (reminder?.task_id) {
      await supabase
        .from('golf_tasks')
        .update({ reminder_sent: true })
        .eq('id', reminder.task_id);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in markReminderSent:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Process all due reminders
 * Called by cron/edge function
 */
export async function processReminders(): Promise<{
  sent: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const { data: reminders, error } = await getDueReminders();

    if (error || !reminders) {
      results.errors.push(error || 'Failed to fetch reminders');
      return results;
    }

    for (const reminder of reminders) {
      try {
        // Send notification based on reminder type
        const sendResult = await sendReminderNotification(reminder);

        if (sendResult.success) {
          await markReminderSent(reminder.id);
          results.sent++;
        } else {
          await markReminderSent(reminder.id, sendResult.error);
          results.failed++;
          results.errors.push(`Reminder ${reminder.id}: ${sendResult.error}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await markReminderSent(reminder.id, errorMessage);
        results.failed++;
        results.errors.push(`Reminder ${reminder.id}: ${errorMessage}`);
      }
    }

    return results;
  } catch (error) {
    console.error('Error in processReminders:', error);
    results.errors.push('Failed to process reminders');
    return results;
  }
}

/**
 * Send reminder notification
 * Internal function to handle different notification types
 */
async function sendReminderNotification(
  reminder: TaskReminderWithTask
): Promise<{ success: boolean; error?: string }> {
  const task = reminder.task;
  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  const reminderType = reminder.reminder_type;

  try {
    // Send in-app notification
    if (reminderType === 'in_app' || reminderType === 'all') {
      await sendInAppNotification(task);
    }

    // Send email notification
    if (reminderType === 'email' || reminderType === 'all') {
      await sendEmailNotification(task);
    }

    // Send push notification
    if (reminderType === 'push' || reminderType === 'all') {
      await sendPushNotification(task);
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification',
    };
  }
}

/**
 * Send in-app notification
 * Uses 'event_reminder' type since 'task_reminder' is not in the enum.
 * Task-specific info is stored in the data field.
 */
async function sendInAppNotification(task: GolfTask): Promise<void> {
  const supabase = await createClient();

  const notificationData = {
    task_id: task.id,
    task_type: 'task_reminder',
    action_url: `/golf/dashboard/tasks?task=${task.id}`,
  };

  // Create notification for the assignee
  if (task.assigned_to) {
    await supabase.from('notifications').insert({
      user_id: task.assigned_to,
      type: 'event_reminder' as const,
      title: 'Task Reminder',
      body: `Reminder: "${task.title}" is due${task.due_date ? ` on ${new Date(task.due_date).toLocaleDateString()}` : ' soon'}`,
      data: notificationData,
      read: false,
    });
  }

  // Also notify the coach who assigned it if different from assignee
  if (task.assigned_by && task.assigned_by !== task.assigned_to) {
    await supabase.from('notifications').insert({
      user_id: task.assigned_by,
      type: 'event_reminder' as const,
      title: 'Task Reminder',
      body: `Reminder: "${task.title}" is due${task.due_date ? ` on ${new Date(task.due_date).toLocaleDateString()}` : ' soon'}`,
      data: notificationData,
      read: false,
    });
  }
}

/**
 * Send email notification using Resend
 * Sends task reminder emails to assignee and optionally creator
 */
async function sendEmailNotification(task: GolfTask): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[TaskReminders] Email skipped: RESEND_API_KEY not configured');
    return;
  }

  // Get full task with user details
  const supabase = await createClient();
  const { data: taskWithUsers } = await supabase
    .from('golf_tasks')
    .select(`
      *,
      assignee:users!assigned_to(id, full_name, email),
      creator:users!assigned_by(id, full_name, email)
    `)
    .eq('id', task.id)
    .single();

  const fullTask = taskWithUsers as TaskWithUsers | null;
  if (!fullTask) {
    console.log('[TaskReminders] Email skipped: Could not fetch task details');
    return;
  }

  // Collect email recipients
  const recipients: string[] = [];
  if (fullTask.assignee?.email) {
    recipients.push(fullTask.assignee.email);
  }
  if (fullTask.creator?.email && fullTask.creator.email !== fullTask.assignee?.email) {
    recipients.push(fullTask.creator.email);
  }

  if (recipients.length === 0) {
    console.log('[TaskReminders] Email skipped: No recipients found');
    return;
  }

  const dueText = task.due_date
    ? new Date(task.due_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'soon';

  const taskUrl = `${APP_URL}/golf/dashboard/tasks?task=${task.id}`;

  // Send email to each recipient using Resend API
  for (const email of recipients) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: email,
          subject: `Task Reminder: ${task.title}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="color: #16A34A; margin: 0; font-size: 24px;">Helm Sports</h1>
              </div>

              <h2 style="color: #1c1917; margin-bottom: 16px; font-size: 20px;">Task Reminder</h2>

              <div style="background-color: #FFFEFA; border: 1px solid #e7e5e4; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <h3 style="color: #16A34A; margin: 0 0 12px 0; font-size: 18px;">${escapeHtml(task.title)}</h3>
                ${task.description ? `<p style="color: #525252; margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">${escapeHtml(task.description)}</p>` : ''}
                <p style="color: #78716c; margin: 0; font-size: 14px;">
                  <strong>Due:</strong> ${dueText}
                </p>
                ${task.priority && task.priority !== 'normal' ? `
                <p style="color: ${task.priority === 'urgent' ? '#DC2626' : task.priority === 'high' ? '#F59E0B' : '#78716c'}; margin: 8px 0 0 0; font-size: 14px;">
                  <strong>Priority:</strong> ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </p>` : ''}
              </div>

              <a href="${taskUrl}"
                 style="display: inline-block; background-color: #16A34A; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px;">
                View Task
              </a>

              <p style="color: #94A3B8; font-size: 12px; margin-top: 32px; line-height: 1.5;">
                This is an automated reminder from Helm Sports Labs.<br>
                You can manage your notification preferences in your account settings.
              </p>
            </div>
          `,
          text: `Task Reminder: ${task.title}\n\n${task.description || ''}\n\nDue: ${dueText}\n\nView task: ${taskUrl}`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TaskReminders] Failed to send email to ${email}:`, errorText);
        throw new Error(`Email send failed: ${errorText}`);
      }

      console.log(`[TaskReminders] Email sent successfully to ${email}`);
    } catch (err) {
      console.error(`[TaskReminders] Error sending email to ${email}:`, err);
      throw err;
    }
  }
}

/**
 * Escape HTML special characters to prevent XSS in emails
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

/**
 * Send push notification using Web Push API
 *
 * This uses the web-push protocol to send notifications directly to subscribed browsers.
 * Push subscriptions are stored in the push_subscriptions table.
 *
 * If VAPID keys are not configured, falls back to logging only.
 * Note: The push_subscriptions table needs to be created via migration:
 *
 * CREATE TABLE push_subscriptions (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   endpoint TEXT NOT NULL UNIQUE,
 *   keys JSONB NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */
async function sendPushNotification(task: GolfTask): Promise<void> {
  // Check if VAPID keys are configured
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[TaskReminders] Push notification skipped: VAPID keys not configured');
    return;
  }

  const supabase = await createClient();

  // Get users who should receive the notification
  const userIds: string[] = [];
  if (task.assigned_to) userIds.push(task.assigned_to);
  if (task.assigned_by && task.assigned_by !== task.assigned_to) {
    userIds.push(task.assigned_by);
  }

  if (userIds.length === 0) {
    console.log('[TaskReminders] Push notification skipped: No recipients');
    return;
  }

  // Try to get push subscriptions from the database
  // Note: This table may not exist yet - if so, we gracefully handle it
  let subscriptions: Array<{
    id: string;
    user_id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }> = [];

  try {
    // Use type assertion for table that may not be in generated types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('push_subscriptions')
      .select('id, user_id, endpoint, keys')
      .in('user_id', userIds);

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        console.log('[TaskReminders] Push notification skipped: push_subscriptions table does not exist');
        console.log('[TaskReminders] To enable push notifications, run migration to create push_subscriptions table');
        return;
      }
      throw error;
    }

    subscriptions = (data as typeof subscriptions) || [];
  } catch (err) {
    console.log('[TaskReminders] Push notification skipped: Could not fetch subscriptions', err);
    return;
  }

  if (subscriptions.length === 0) {
    console.log('[TaskReminders] Push notification skipped: No push subscriptions found for users');
    return;
  }

  const dueText = task.due_date
    ? new Date(task.due_date).toLocaleDateString()
    : 'soon';

  const payload = JSON.stringify({
    title: 'Task Reminder',
    body: `Reminder: "${task.title}" is due ${dueText}`,
    tag: `task-reminder-${task.id}`,
    data: {
      url: `/golf/dashboard/tasks?task=${task.id}`,
      taskId: task.id,
      type: 'task_reminder',
    },
    requireInteraction: true,
  });

  // Send to each subscription
  let sentCount = 0;
  let failedCount = 0;

  for (const subscription of subscriptions) {
    try {
      const pushResult = await sendWebPush(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        payload
      );

      if (pushResult.success) {
        sentCount++;
        console.log(`[TaskReminders] Push sent to subscription ${subscription.id}`);
      } else {
        failedCount++;
        console.error(`[TaskReminders] Push failed for subscription ${subscription.id}:`, pushResult.error);

        // If subscription is expired/invalid, remove it
        if (pushResult.statusCode === 404 || pushResult.statusCode === 410) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('push_subscriptions').delete().eq('id', subscription.id);
          console.log(`[TaskReminders] Removed expired subscription ${subscription.id}`);
        }
      }
    } catch (err) {
      failedCount++;
      console.error(`[TaskReminders] Error sending push to ${subscription.id}:`, err);
    }
  }

  console.log(`[TaskReminders] Push notifications: ${sentCount} sent, ${failedCount} failed`);
}

/**
 * Send a Web Push notification using the Web Push protocol
 * This is a simplified implementation - for production, consider using the 'web-push' npm package
 */
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    // For now, we'll use a simple approach that requires the web-push library
    // In a production environment, you would either:
    // 1. Install and use the 'web-push' npm package
    // 2. Use a push notification service like OneSignal, Firebase, or Pusher

    // Check if we're in a Node.js environment that supports the web-push library
    // The import will fail gracefully if web-push is not installed
    // @ts-expect-error - web-push may not be installed, handled by .catch()
    const webpush: { setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void; sendNotification: (sub: Record<string, unknown>, payload: string) => Promise<unknown> } | null = await import('web-push').catch(() => null);

    if (webpush) {
      // Configure web-push with VAPID credentials
      webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY!,
        VAPID_PRIVATE_KEY!
      );

      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        payload
      );

      return { success: true };
    }

    // Fallback: If web-push is not installed, log and return
    console.log('[TaskReminders] web-push package not installed. Install it with: npm install web-push');
    console.log('[TaskReminders] Would send push to:', subscription.endpoint);
    return { success: false, error: 'web-push package not installed' };
  } catch (err) {
    const error = err as { statusCode?: number; message?: string };
    return {
      success: false,
      statusCode: error.statusCode,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Calculate reminder time based on due date and offset
 */
export function calculateReminderTime(
  dueDate: string,
  offsetHours?: number,
  offsetDays?: number
): string {
  const due = new Date(dueDate);

  if (offsetDays) {
    due.setDate(due.getDate() - offsetDays);
  }

  if (offsetHours) {
    due.setHours(due.getHours() - offsetHours);
  }

  return due.toISOString();
}

/**
 * Get reminder statistics for a team
 */
export async function getReminderStats(
  teamId: string
): Promise<{
  pendingReminders: number;
  sentToday: number;
  failedToday: number;
}> {
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First, get task IDs for this team
  const { data: teamTasks } = await supabase
    .from('golf_tasks')
    .select('id')
    .eq('team_id', teamId);

  const taskIds = teamTasks?.map((t) => t.id) || [];

  if (taskIds.length === 0) {
    return {
      pendingReminders: 0,
      sentToday: 0,
      failedToday: 0,
    };
  }

  // Get pending reminders count
  const { count: pending } = await supabase
    .from('golf_task_reminders')
    .select('*', { count: 'exact', head: true })
    .eq('sent', false)
    .in('task_id', taskIds);

  // Get sent today count
  const { count: sentToday } = await supabase
    .from('golf_task_reminders')
    .select('*', { count: 'exact', head: true })
    .eq('sent', true)
    .gte('sent_at', today.toISOString())
    .is('error', null)
    .in('task_id', taskIds);

  // Get failed today count
  const { count: failedToday } = await supabase
    .from('golf_task_reminders')
    .select('*', { count: 'exact', head: true })
    .eq('sent', true)
    .gte('sent_at', today.toISOString())
    .not('error', 'is', null)
    .in('task_id', taskIds);

  return {
    pendingReminders: pending || 0,
    sentToday: sentToday || 0,
    failedToday: failedToday || 0,
  };
}
