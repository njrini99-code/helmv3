// Supabase Edge Function for processing task reminders
// This function should be triggered by a cron job every 5 minutes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskReminder {
  id: string;
  task_id: string;
  scheduled_for: string;
  reminder_type: string;
  sent: boolean;
  task: {
    id: string;
    title: string;
    description: string;
    due_date: string;
    assigned_to: string;
    created_by: string;
    team_id: string;
    assignee?: {
      id: string;
      full_name: string;
      email: string;
    };
    creator?: {
      id: string;
      full_name: string;
      email: string;
    };
  };
}

interface ProcessingResult {
  sent: number;
  failed: number;
  errors: string[];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get due reminders (scheduled_for <= now and not sent)
    const now = new Date().toISOString();
    const { data: reminders, error: fetchError } = await supabase
      .from("golf_task_reminders")
      .select(`
        *,
        task:golf_tasks(
          *,
          assignee:users!assigned_to(id, full_name, email),
          creator:users!created_by(id, full_name, email)
        )
      `)
      .eq("sent", false)
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error("Error fetching reminders:", fetchError);
      throw fetchError;
    }

    const results: ProcessingResult = {
      sent: 0,
      failed: 0,
      errors: [],
    };

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No reminders to process",
          results,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Processing ${reminders.length} reminders...`);

    // Process each reminder
    for (const reminder of reminders as TaskReminder[]) {
      try {
        if (!reminder.task) {
          console.warn(`Reminder ${reminder.id} has no associated task`);
          await markReminderSent(supabase, reminder.id, "Task not found");
          results.failed++;
          results.errors.push(`Reminder ${reminder.id}: Task not found`);
          continue;
        }

        // Send notifications based on reminder type
        const notificationResults = await sendNotifications(
          supabase,
          reminder
        );

        if (notificationResults.success) {
          await markReminderSent(supabase, reminder.id);
          results.sent++;
        } else {
          await markReminderSent(supabase, reminder.id, notificationResults.error);
          results.failed++;
          results.errors.push(`Reminder ${reminder.id}: ${notificationResults.error}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await markReminderSent(supabase, reminder.id, errorMessage);
        results.failed++;
        results.errors.push(`Reminder ${reminder.id}: ${errorMessage}`);
      }
    }

    console.log(`Processing complete. Sent: ${results.sent}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${reminders.length} reminders`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing reminders:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

/**
 * Mark a reminder as sent in the database
 */
async function markReminderSent(
  supabase: any,
  reminderId: string,
  error?: string
): Promise<void> {
  const updateData: any = {
    sent: true,
    sent_at: new Date().toISOString(),
  };

  if (error) {
    updateData.error = error;
  }

  await supabase
    .from("golf_task_reminders")
    .update(updateData)
    .eq("id", reminderId);

  // Also update the task's reminder_sent flag
  const { data: reminder } = await supabase
    .from("golf_task_reminders")
    .select("task_id")
    .eq("id", reminderId)
    .single();

  if (reminder?.task_id) {
    await supabase
      .from("golf_tasks")
      .update({ reminder_sent: true })
      .eq("id", reminder.task_id);
  }
}

/**
 * Send notifications based on reminder type
 */
async function sendNotifications(
  supabase: any,
  reminder: TaskReminder
): Promise<{ success: boolean; error?: string }> {
  const task = reminder.task;
  const reminderType = reminder.reminder_type;

  try {
    // Send in-app notification
    if (reminderType === "in_app" || reminderType === "all") {
      await sendInAppNotification(supabase, task);
    }

    // Send email notification
    if (reminderType === "email" || reminderType === "all") {
      await sendEmailNotification(task);
    }

    // Send push notification
    if (reminderType === "push" || reminderType === "all") {
      await sendPushNotification(task);
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send notification",
    };
  }
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(supabase: any, task: any): Promise<void> {
  const notifications = [];
  const dueText = task.due_date
    ? ` on ${new Date(task.due_date).toLocaleDateString()}`
    : " soon";

  // Notification for assignee
  if (task.assigned_to) {
    notifications.push({
      user_id: task.assigned_to,
      notification_type: "task_reminder",
      title: "Task Reminder",
      body: `Reminder: "${task.title}" is due${dueText}`,
      action_url: `/golf/dashboard/tasks?task=${task.id}`,
      read: false,
    });
  }

  // Notification for creator (if different from assignee)
  if (task.created_by && task.created_by !== task.assigned_to) {
    notifications.push({
      user_id: task.created_by,
      notification_type: "task_reminder",
      title: "Task Reminder",
      body: `Reminder: "${task.title}" is due${dueText}`,
      action_url: `/golf/dashboard/tasks?task=${task.id}`,
      read: false,
    });
  }

  if (notifications.length > 0) {
    const { error } = await supabase.from("notifications").insert(notifications);
    if (error) {
      console.error("Error creating in-app notifications:", error);
      throw error;
    }
  }
}

/**
 * Send email notification
 * Note: In production, integrate with your email service (Resend, SendGrid, etc.)
 */
async function sendEmailNotification(task: any): Promise<void> {
  // Get email service configuration from environment
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@helmsports.com";

  if (!resendApiKey) {
    console.log("Email notification skipped: RESEND_API_KEY not configured");
    return;
  }

  const emails: string[] = [];

  if (task.assignee?.email) {
    emails.push(task.assignee.email);
  }

  if (task.creator?.email && task.creator.email !== task.assignee?.email) {
    emails.push(task.creator.email);
  }

  if (emails.length === 0) {
    console.log("No email recipients found for task:", task.id);
    return;
  }

  const dueText = task.due_date
    ? new Date(task.due_date).toLocaleDateString()
    : "soon";

  // Send email using Resend API
  for (const email of emails) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject: `Task Reminder: ${task.title}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1a1a1a; margin-bottom: 16px;">Task Reminder</h2>
              <div style="background-color: #f8f7f4; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: #16a34a; margin: 0 0 12px 0;">${task.title}</h3>
                ${task.description ? `<p style="color: #525252; margin: 0 0 12px 0;">${task.description}</p>` : ""}
                <p style="color: #858585; margin: 0; font-size: 14px;">Due: ${dueText}</p>
              </div>
              <a href="${Deno.env.get("APP_URL") || "https://helmsports.com"}/golf/dashboard/tasks?task=${task.id}"
                 style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">
                View Task
              </a>
              <p style="color: #858585; font-size: 12px; margin-top: 30px;">
                This is an automated reminder from Helm Sports Labs.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send email to ${email}:`, errorText);
      } else {
        console.log(`Email sent successfully to ${email}`);
      }
    } catch (err) {
      console.error(`Error sending email to ${email}:`, err);
    }
  }
}

/**
 * Send push notification
 * Note: In production, integrate with your push notification service (Firebase, OneSignal, etc.)
 */
async function sendPushNotification(task: any): Promise<void> {
  // Get Firebase configuration from environment
  const fcmServerKey = Deno.env.get("FCM_SERVER_KEY");

  if (!fcmServerKey) {
    console.log("Push notification skipped: FCM_SERVER_KEY not configured");
    return;
  }

  // In production, you would:
  // 1. Look up device tokens for the user(s)
  // 2. Send push notifications via Firebase Cloud Messaging

  console.log(`Push notification would be sent for task: ${task.id}`);

  // Example FCM implementation:
  // const deviceTokens = await getDeviceTokens(task.assigned_to);
  // for (const token of deviceTokens) {
  //   await fetch("https://fcm.googleapis.com/fcm/send", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `key=${fcmServerKey}`,
  //     },
  //     body: JSON.stringify({
  //       to: token,
  //       notification: {
  //         title: "Task Reminder",
  //         body: `Reminder: "${task.title}" is due soon`,
  //       },
  //       data: {
  //         taskId: task.id,
  //         type: "task_reminder",
  //       },
  //     }),
  //   });
  // }
}
