'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ReminderType, TaskReminder, TaskReminderWithTask, GolfTask } from '@/lib/types/golf';

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
    const filteredReminders = (reminders || []).filter((reminder: any) => {
      const task = reminder.task as GolfTask;
      return task && (task.created_by === userId || task.assigned_to === userId);
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

    const updateData: any = {
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
 */
async function sendInAppNotification(task: GolfTask): Promise<void> {
  const supabase = await createClient();

  // Create notification for the assignee
  if (task.assigned_to) {
    await supabase.from('notifications').insert({
      user_id: task.assigned_to,
      notification_type: 'task_reminder',
      title: 'Task Reminder',
      body: `Reminder: "${task.title}" is due${task.due_date ? ` on ${new Date(task.due_date).toLocaleDateString()}` : ' soon'}`,
      action_url: `/golf/dashboard/tasks?task=${task.id}`,
      read: false,
    });
  }

  // Also notify the creator if different from assignee
  if (task.created_by && task.created_by !== task.assigned_to) {
    await supabase.from('notifications').insert({
      user_id: task.created_by,
      notification_type: 'task_reminder',
      title: 'Task Reminder',
      body: `Reminder: "${task.title}" is due${task.due_date ? ` on ${new Date(task.due_date).toLocaleDateString()}` : ' soon'}`,
      action_url: `/golf/dashboard/tasks?task=${task.id}`,
      read: false,
    });
  }
}

/**
 * Send email notification
 * Note: In production, integrate with your email service (Resend, SendGrid, etc.)
 */
async function sendEmailNotification(task: GolfTask): Promise<void> {
  // TODO: Implement email sending with your preferred email service
  // Example with Resend:
  // const { data, error } = await resend.emails.send({
  //   from: 'Helm Sports <notifications@helmsports.com>',
  //   to: [assigneeEmail],
  //   subject: `Task Reminder: ${task.title}`,
  //   html: `<p>This is a reminder that "${task.title}" is due...</p>`,
  // });

  console.log(`Email notification would be sent for task: ${task.id}`);
}

/**
 * Send push notification
 * Note: In production, integrate with your push notification service (Firebase, OneSignal, etc.)
 */
async function sendPushNotification(task: GolfTask): Promise<void> {
  // TODO: Implement push notification with your preferred service
  // Example with Firebase Cloud Messaging:
  // const message = {
  //   notification: {
  //     title: 'Task Reminder',
  //     body: `Reminder: "${task.title}" is due soon`,
  //   },
  //   token: userDeviceToken,
  // };
  // await admin.messaging().send(message);

  console.log(`Push notification would be sent for task: ${task.id}`);
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

  // Get pending reminders count
  const { count: pending } = await supabase
    .from('golf_task_reminders')
    .select('*', { count: 'exact', head: true })
    .eq('sent', false)
    .in(
      'task_id',
      supabase.from('golf_tasks').select('id').eq('team_id', teamId)
    );

  // Get sent today count
  const { count: sentToday } = await supabase
    .from('golf_task_reminders')
    .select('*', { count: 'exact', head: true })
    .eq('sent', true)
    .gte('sent_at', today.toISOString())
    .is('error', null)
    .in(
      'task_id',
      supabase.from('golf_tasks').select('id').eq('team_id', teamId)
    );

  // Get failed today count
  const { count: failedToday } = await supabase
    .from('golf_task_reminders')
    .select('*', { count: 'exact', head: true })
    .eq('sent', true)
    .gte('sent_at', today.toISOString())
    .not('error', 'is', null)
    .in(
      'task_id',
      supabase.from('golf_tasks').select('id').eq('team_id', teamId)
    );

  return {
    pendingReminders: pending || 0,
    sentToday: sentToday || 0,
    failedToday: failedToday || 0,
  };
}
