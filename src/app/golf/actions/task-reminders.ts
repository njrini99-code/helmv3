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

// Email service configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Helm Sports <notifications@helmsportslabs.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

// VAPID keys are now configured inside v3/foundation/push.ts. See W9-pt3.

/**
 * The Supabase client shape these functions operate on. The cron path passes a
 * service-role admin client (RLS-bypassing) since golf_task_reminders is only
 * readable by coaches / service_role; in-app/interactive callers pass the
 * cookie-scoped server client (or omit it and one is created on demand).
 */
type TaskReminderClient = Awaited<ReturnType<typeof createClient>>;

/** A resolved recipient: the auth user id + (optional) email. */
interface TaskRecipient {
  userId: string;
  email: string | null;
}

/**
 * Resolve the auth-user recipients of a task reminder via the CORRECT path:
 *   - assigned players: golf_task_assignments.player_id → golf_players.user_id
 *   - the assigning coach: golf_tasks.assigned_by (coach id) → golf_coaches.user_id
 *
 * golf_tasks.assigned_to/assigned_by are domain (player/coach) ids, NOT auth
 * user ids — so they can't be used as users-FK targets directly. Emails are
 * looked up from the users table for each resolved user id.
 */
async function resolveTaskRecipients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  task: GolfTask,
): Promise<TaskRecipient[]> {
  const userIds = new Set<string>();

  // Assigned players (M:N join).
  const { data: assignments } = await supabase
    .from('golf_task_assignments')
    .select('player_id')
    .eq('task_id', task.id);
  const playerIds = [...new Set((assignments || []).map((a) => a.player_id))];
  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from('golf_players')
      .select('user_id')
      .in('id', playerIds);
    for (const p of players || []) {
      if (p.user_id) userIds.add(p.user_id);
    }
  }

  // Assigning coach.
  if (task.assigned_by) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('user_id')
      .eq('id', task.assigned_by)
      .maybeSingle();
    if (coach?.user_id) userIds.add(coach.user_id);
  }

  if (userIds.size === 0) return [];

  const { data: userRows } = await supabase
    .from('users')
    .select('id, email')
    .in('id', [...userIds]);
  const emailById = new Map((userRows || []).map((u) => [u.id, u.email]));

  return [...userIds].map((userId) => ({
    userId,
    email: emailById.get(userId) ?? null,
  }));
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

    // Verify the user has access to this task. golf_tasks has assigned_by
    // (the coach id), NOT a created_by column; assigned_to is the legacy
    // (never-written) player column — assignment lives in golf_task_assignments.
    const { data: task, error: taskError } = await supabase
      .from('golf_tasks')
      .select('id, team_id, assigned_by')
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

    // Resolve the user's coach/player domain ids. A user "owns" a task when
    // they are the assigning coach (golf_tasks.assigned_by === coach.id) and is
    // "assigned" a task via golf_task_assignments (player_id === player.id).
    // golf_tasks.assigned_by/assigned_to are NOT user ids, so comparing them to
    // userId directly (the previous behavior) never matched.
    const [coachResult, playerResult] = await Promise.all([
      supabase.from('golf_coaches').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('golf_players').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const coachId = coachResult.data?.id ?? null;
    const playerId = playerResult.data?.id ?? null;

    // Task ids assigned to this player (via the M:N join).
    let assignedTaskIds: string[] = [];
    if (playerId) {
      const { data: assignments } = await supabase
        .from('golf_task_assignments')
        .select('task_id')
        .eq('player_id', playerId);
      assignedTaskIds = (assignments || []).map((a) => a.task_id);
    }

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
    const assignedSet = new Set(assignedTaskIds);
    const filteredReminders = (reminders || []).filter((reminder: { task: GolfTask | null }) => {
      const task = reminder.task;
      if (!task) return false;
      return (coachId !== null && task.assigned_by === coachId) || assignedSet.has(task.id);
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
  batchSize: number = 100,
  client?: TaskReminderClient,
): Promise<{ data: TaskReminderWithTask[] | null; error?: string }> {
  try {
    const supabase = client ?? (await createClient());

    // Plain task join. The previous embedded `assignee:users!assigned_to` /
    // `creator:users!created_by` joins were invalid: assigned_to FKs
    // golf_players (not users), assigned_by FKs golf_coaches (not users), and
    // created_by doesn't exist — so the whole query errored. Recipients are
    // resolved per-task by the notification senders via the correct path
    // (golf_task_assignments → golf_players.user_id, assigned_by →
    // golf_coaches.user_id).
    const { data: reminders, error } = await supabase
      .from('golf_task_reminders')
      .select(`
        *,
        task:golf_tasks(*)
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
  error?: string,
  client?: TaskReminderClient,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = client ?? (await createClient());

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
export async function processReminders(
  client?: TaskReminderClient,
): Promise<{
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
    const { data: reminders, error } = await getDueReminders(100, client);

    if (error || !reminders) {
      results.errors.push(error || 'Failed to fetch reminders');
      return results;
    }

    for (const reminder of reminders) {
      try {
        // Send notification based on reminder type
        const sendResult = await sendReminderNotification(reminder, client);

        if (sendResult.success) {
          await markReminderSent(reminder.id, undefined, client);
          results.sent++;
        } else {
          await markReminderSent(reminder.id, sendResult.error, client);
          results.failed++;
          results.errors.push(`Reminder ${reminder.id}: ${sendResult.error}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await markReminderSent(reminder.id, errorMessage, client);
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
  reminder: TaskReminderWithTask,
  client?: TaskReminderClient,
): Promise<{ success: boolean; error?: string }> {
  const task = reminder.task;
  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  const reminderType = reminder.reminder_type;

  try {
    // Send in-app notification
    if (reminderType === 'in_app' || reminderType === 'all') {
      await sendInAppNotification(task, client);
    }

    // Send email notification
    if (reminderType === 'email' || reminderType === 'all') {
      await sendEmailNotification(task, client);
    }

    // Send push notification
    if (reminderType === 'push' || reminderType === 'all') {
      await sendPushNotification(task, client);
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
async function sendInAppNotification(task: GolfTask, client?: TaskReminderClient): Promise<void> {
  const supabase = client ?? (await createClient());

  const notificationData = {
    task_id: task.id,
    task_type: 'task_reminder',
    action_url: `/golf/dashboard/tasks?task=${task.id}`,
  };

  // Resolve real auth-user recipients (assigned players + assigning coach).
  // The previous code wrote notifications.user_id = task.assigned_to /
  // task.assigned_by, which are player/coach domain ids — not auth user ids —
  // so the rows pointed at the wrong (or non-existent) users.
  const recipients = await resolveTaskRecipients(supabase, task);
  if (recipients.length === 0) return;

  const body = `Reminder: "${task.title}" is due${task.due_date ? ` on ${new Date(task.due_date).toLocaleDateString()}` : ' soon'}`;

  await supabase.from('notifications').insert(
    recipients.map((r) => ({
      user_id: r.userId,
      type: 'event_reminder' as const,
      title: 'Task Reminder',
      body,
      data: notificationData,
      read: false,
    })),
  );
}

/**
 * Send email notification using Resend
 * Sends task reminder emails to assignee and optionally creator
 */
async function sendEmailNotification(task: GolfTask, client?: TaskReminderClient): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[TaskReminders] Email skipped: RESEND_API_KEY not configured');
    return;
  }

  // Resolve recipient emails via the correct path (assigned players +
  // assigning coach). The previous embedded users-FK joins on assigned_to /
  // assigned_by were invalid (those columns FK golf_players / golf_coaches,
  // not users) and errored out, so no task email ever sent.
  const supabase = client ?? (await createClient());
  const resolved = await resolveTaskRecipients(supabase, task);
  const recipients = [...new Set(resolved.map((r) => r.email).filter((e): e is string => !!e))];

  if (recipients.length === 0) {
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
        await logServerError(`[TaskReminders] Failed to send email to ${email}: ${errorText}`, { action: 'task_reminders.sendEmailNotification' });
        throw new Error(`Email send failed: ${errorText}`);
      }

    } catch (err) {
      await logServerError(`[TaskReminders] Error sending email to ${email}: ${err instanceof Error ? err.message : String(err)}`, { action: 'task_reminders.sendEmailNotification' });
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
async function sendPushNotification(task: GolfTask, client?: TaskReminderClient): Promise<void> {
  // Configured VAPID keys are now a precondition of the v3 push wrapper.
  if (!isWebPushAvailable()) {
    return;
  }

  const supabase = client ?? (await createClient());

  // Resolve real auth-user recipients. task.assigned_to / assigned_by are
  // player/coach domain ids, not auth user ids, so they can't be used as
  // push-subscription user ids directly.
  const recipients = await resolveTaskRecipients(supabase, task);
  const userIds = recipients.map((r) => r.userId);

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
