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
      await sendPushNotification(supabase, task);
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
 * Send push notification using Web Push protocol
 * Uses VAPID for authentication and sends to all user's registered push subscriptions
 */
async function sendPushNotification(supabase: any, task: any): Promise<void> {
  // Get VAPID configuration from environment
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@helmsportslabs.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log("Push notification skipped: VAPID keys not configured");
    return;
  }

  // Get users who should receive the notification
  const userIds: string[] = [];
  if (task.assigned_to) userIds.push(task.assigned_to);
  if (task.created_by && task.created_by !== task.assigned_to) {
    userIds.push(task.created_by);
  }

  if (userIds.length === 0) {
    console.log("Push notification skipped: No recipients");
    return;
  }

  // Fetch push subscriptions for these users
  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, keys")
    .in("user_id", userIds);

  if (subError) {
    // Table might not exist yet
    if (subError.code === "42P01") {
      console.log("Push notification skipped: push_subscriptions table does not exist");
      return;
    }
    console.error("Error fetching push subscriptions:", subError);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log("Push notification skipped: No push subscriptions found for users");
    return;
  }

  const dueText = task.due_date
    ? new Date(task.due_date).toLocaleDateString()
    : "soon";

  const payload = JSON.stringify({
    title: "Task Reminder",
    body: `Reminder: "${task.title}" is due ${dueText}`,
    tag: `task-reminder-${task.id}`,
    data: {
      url: `/golf/dashboard/tasks?task=${task.id}`,
      taskId: task.id,
      type: "task_reminder",
    },
    requireInteraction: true,
  });

  let sentCount = 0;
  let failedCount = 0;

  // Send to each subscription
  for (const subscription of subscriptions) {
    try {
      const result = await sendWebPushNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        payload,
        {
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject,
        }
      );

      if (result.success) {
        sentCount++;
        // Update last_push_at timestamp
        await supabase
          .from("push_subscriptions")
          .update({ last_push_at: new Date().toISOString(), failed_count: 0 })
          .eq("id", subscription.id);
        console.log(`Push sent to subscription ${subscription.id}`);
      } else {
        failedCount++;
        console.error(`Push failed for subscription ${subscription.id}:`, result.error);

        // If subscription is expired/invalid (404 or 410), remove it
        if (result.statusCode === 404 || result.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
          console.log(`Removed expired subscription ${subscription.id}`);
        } else {
          // Increment failed count for other errors
          await supabase
            .from("push_subscriptions")
            .update({ failed_count: (subscription.failed_count || 0) + 1 })
            .eq("id", subscription.id);
        }
      }
    } catch (err) {
      failedCount++;
      console.error(`Error sending push to ${subscription.id}:`, err);
    }
  }

  console.log(`Push notifications: ${sentCount} sent, ${failedCount} failed`);
}

/**
 * Send a Web Push notification using the Web Push protocol
 * Implements VAPID authentication for push services
 */
async function sendWebPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidConfig: { vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string }
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    // Parse the endpoint URL to get the audience
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

    // Create VAPID JWT token
    const vapidToken = await createVapidToken(
      audience,
      vapidConfig.vapidSubject,
      vapidConfig.vapidPublicKey,
      vapidConfig.vapidPrivateKey
    );

    // Encrypt the payload using the subscription keys
    const encryptedPayload = await encryptPayload(
      payload,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    // Send the push notification
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": encryptedPayload.ciphertext.byteLength.toString(),
        TTL: "86400", // 24 hours
        Authorization: `vapid t=${vapidToken}, k=${vapidConfig.vapidPublicKey}`,
      },
      body: encryptedPayload.ciphertext,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true };
    }

    const errorText = await response.text();
    return {
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status}: ${errorText}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Create a VAPID JWT token for Web Push authentication
 */
async function createVapidToken(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Import the private key for signing
  const privateKeyBytes = base64UrlDecode(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${unsignedToken}.${encodedSignature}`;
}

/**
 * Encrypt payload using aes128gcm for Web Push
 * This is a simplified implementation - for production, consider using a library
 */
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<{ ciphertext: Uint8Array }> {
  // Decode the subscription keys
  const userPublicKey = base64UrlDecode(p256dhKey);
  const userAuth = base64UrlDecode(authSecret);

  // Generate a local key pair for ECDH
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import the user's public key
  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret using ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userKey },
    localKeyPair.privateKey,
    256
  );

  // Export local public key
  const localPublicKey = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive the content encryption key and nonce using HKDF
  const keyInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
  ]);
  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: nonce\0"),
  ]);

  // Import shared secret for HKDF
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(sharedSecret),
    "HKDF",
    false,
    ["deriveBits"]
  );

  // Derive PRK from auth secret and shared secret
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"),
    ...new Uint8Array(userPublicKey),
    ...new Uint8Array(localPublicKey),
  ]);

  // Derive the IKM
  const ikm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: userAuth, info: authInfo },
    hkdfKey,
    256
  );

  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);

  // Derive CEK (Content Encryption Key)
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: keyInfo },
    ikmKey,
    128
  );

  // Derive nonce
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    ikmKey,
    96
  );

  // Import CEK for AES-GCM
  const cek = await crypto.subtle.importKey(
    "raw",
    cekBits,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // Add padding to payload (Web Push requires at least 2 bytes of padding)
  const paddedPayload = new Uint8Array([
    ...new TextEncoder().encode(payload),
    2, 0, // Padding delimiter and padding
  ]);

  // Encrypt the payload
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonceBits },
    cek,
    paddedPayload
  );

  // Build the aes128gcm record
  // Header: salt (16) + record size (4) + key id length (1) + key id (65 for P-256)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);

  const header = new Uint8Array([
    ...salt,
    ...recordSize,
    65, // Key ID length (uncompressed P-256 public key)
    ...new Uint8Array(localPublicKey),
  ]);

  // Combine header and encrypted payload
  const ciphertext = new Uint8Array(header.length + encrypted.byteLength);
  ciphertext.set(header, 0);
  ciphertext.set(new Uint8Array(encrypted), header.length);

  return { ciphertext };
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(data: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if necessary
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) {
    padded += "=";
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
