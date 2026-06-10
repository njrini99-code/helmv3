'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import type { ReminderType, TaskReminderWithTask, GolfTask } from '@/lib/types/golf';
import { logServerError } from '@/lib/server-error-logger';
import {
  sendWebPush as v3SendWebPush,
  isWebPushAvailable,
} from '@/lib/coachhelm/v3/foundation/push';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

// VAPID keys are now configured inside v3/foundation/push.ts. See W9-pt3.

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
      await logServerError(`Error setting reminder: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'task_reminders.setTaskReminder' });
      return { success: false, error: 'Failed to set reminder' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`Error in setTaskReminder: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.setTaskReminder' });
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
      await logServerError(`Error canceling reminder: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'task_reminders.cancelTaskReminder' });
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
    await logServerError(`Error in cancelTaskReminder: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.cancelTaskReminder' });
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
      await logServerError(`Error fetching reminders: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.getUpcomingReminders' });
      return { data: null, error: 'Failed to fetch reminders' };
    }

    // Filter to only include reminders for tasks the user owns or is assigned to
    const filteredReminders = (reminders || []).filter((reminder: { task: GolfTask | null }) => {
      const task = reminder.task;
      return task && (task.assigned_by === userId || task.assigned_to === userId);
    }) as TaskReminderWithTask[];

    return { data: filteredReminders };
  } catch (error) {
    await logServerError(`Error in getUpcomingReminders: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.getUpcomingReminders' });
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
      await logServerError(`Error fetching due reminders: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.getDueReminders' });
      return { data: null, error: 'Failed to fetch due reminders' };
    }

    return { data: reminders as TaskReminderWithTask[] };
  } catch (error) {
    await logServerError(`Error in getDueReminders: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.getDueReminders' });
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
      await logServerError(`Error marking reminder sent: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'task_reminders.markReminderSent' });
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
    await logServerError(`Error in markReminderSent: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.markReminderSent' });
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
    await logServerError(`Error in processReminders: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.processReminders' });
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
    await logServerError(`Error sending notification: ${error instanceof Error ? error.message : String(error)}`, { action: 'task_reminders.sendReminderNotification' });
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
 * Send email notification for a task reminder.
 *
 * Replaces the former raw-fetch Resend call with the shared
 * `sendEmailNotification` from @/lib/notifications/email so that:
 *   - User email preferences are respected (shouldSendEmail check).
 *   - The branded layout (renderBrandedEmail) is used consistently.
 *   - The `task_reminder` type maps to `email_task_reminders` preference.
 */
async function sendEmailNotification(task: GolfTask): Promise<void> {
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
    return;
  }

  // Build recipient list: assignee + creator (if different)
  interface EmailRecipient { id: string; email: string }
  const recipientMap = new Map<string, EmailRecipient>();
  if (fullTask.assignee?.id && fullTask.assignee.email) {
    recipientMap.set(fullTask.assignee.id, { id: fullTask.assignee.id, email: fullTask.assignee.email });
  }
  if (
    fullTask.creator?.id &&
    fullTask.creator.email &&
    fullTask.creator.id !== fullTask.assignee?.id
  ) {
    recipientMap.set(fullTask.creator.id, { id: fullTask.creator.id, email: fullTask.creator.email });
  }
  const recipients = Array.from(recipientMap.values());

  if (recipients.length === 0) {
    return;
  }

  const taskUrl = `${APP_URL}/golf/dashboard/tasks?task=${task.id}`;

  // Use the shared prefs-checking sender — picks up brandedEmail layout,
  // respects email_task_reminders preference, and handles missing API key.
  const { sendEmailNotification: sharedSend } = await import('@/lib/notifications/email');

  const results = await Promise.allSettled(
    recipients.map((r) =>
      sharedSend('task_reminder', r.id, r.email, {
        taskTitle: task.title,
        taskDescription: task.description ?? '',
        dueDate: task.due_date ?? '',
        taskUrl,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      await logServerError(
        `[TaskReminders] sendEmailNotification rejected: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        { action: 'task_reminders.sendEmailNotification' },
      );
    }
  }
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
  // Configured VAPID keys are now a precondition of the v3 push wrapper.
  if (!isWebPushAvailable()) {
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
    return;
  }

  // Read push subscriptions via the centralized untyped escape hatch
  // (push_subscriptions isn't in the generated Database types yet — to be
  // regenerated post-W9-pt2 merge).
  let subscriptions: Array<{
    id: string;
    user_id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }> = [];

  try {
    const { data, error } = await fromUntyped(supabase, 'push_subscriptions')
      .select('id, user_id, endpoint, keys')
      .in('user_id', userIds) as {
      data: typeof subscriptions | null;
      error: { code?: string; message: string } | null;
    };

    if (error) {
      // Table might not exist yet (legacy guard — table now confirmed in prod)
      if (error.code === '42P01') {
        return;
      }
      throw error;
    }

    subscriptions = data ?? [];
  } catch (err) {
    await logServerError(`[TaskReminders] Could not fetch push subscriptions: ${err instanceof Error ? err.message : String(err)}`, { action: 'task_reminders.sendPushNotification' });
    return;
  }

  if (subscriptions.length === 0) {
    return;
  }

  const dueText = task.due_date
    ? new Date(task.due_date).toLocaleDateString()
    : 'soon';

  // Send to each subscription via the v3 wrapper
  let sentCount = 0;
  let failedCount = 0;

  for (const subscription of subscriptions) {
    try {
      const result = await v3SendWebPush(
        {
          id: subscription.id,
          user_id: subscription.user_id,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        {
          title: 'Task Reminder',
          body: `Reminder: "${task.title}" is due ${dueText}`,
          url: `/golf/dashboard/tasks?task=${task.id}`,
          data: {
            tag: `task-reminder-${task.id}`,
            taskId: task.id,
            type: 'task_reminder',
            requireInteraction: true,
          },
        },
      );

      if (result.delivered) {
        sentCount++;
      } else {
        failedCount++;
        await logServerError(`[TaskReminders] Push failed for subscription ${subscription.id}: ${String(result.error)}`, { action: 'task_reminders.sendPushNotification' });

        // 404/410 = subscription is dead; clean it up
        if (result.shouldDeleteSubscription) {
          await fromUntyped(supabase, 'push_subscriptions').delete().eq('id', subscription.id);
        }
      }
    } catch (err) {
      failedCount++;
      await logServerError(`[TaskReminders] Error sending push to ${subscription.id}: ${err instanceof Error ? err.message : String(err)}`, { action: 'task_reminders.sendPushNotification' });
    }
  }

  if (failedCount > 0) {
    console.warn(`[TaskReminders] Push notifications: ${sentCount} sent, ${failedCount} failed`);
  }
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
