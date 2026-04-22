'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logServerError } from '@/lib/server-error-logger';

// ============================================================================
// NOTIFICATION PREFERENCES (shared across sports)
// ============================================================================

const notificationPreferencesSchema = z.object({
  email_messages: z.boolean().optional(),
  email_pipeline_updates: z.boolean().optional(),
  email_event_reminders: z.boolean().optional(),
  email_profile_views: z.boolean().optional(),
  email_announcements: z.boolean().optional(),
  email_task_reminders: z.boolean().optional(),
  push_messages: z.boolean().optional(),
  push_events: z.boolean().optional(),
  push_task_reminders: z.boolean().optional(),
});

type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export async function updateNotificationPreferences(
  preferences: NotificationPreferencesInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const validatedPrefs = notificationPreferencesSchema.parse(preferences);

    const { data: currentUser } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();

    const currentPrefs = (currentUser?.notification_preferences as Record<string, unknown>) || {};
    const mergedPrefs = { ...currentPrefs, ...validatedPrefs };

    const { error } = await supabase
      .from('users')
      .update({ notification_preferences: mergedPrefs })
      .eq('id', user.id);

    if (error) {
      await logServerError(`Failed to update notification preferences: ${error instanceof Error ? error.message : String(error)}`, { action: 'notification_preferences.updateNotificationPreferences' });
      return { success: false, error: 'Failed to update notification preferences' };
    }

    revalidatePath('/baseball/dashboard/settings');
    revalidatePath('/golf/dashboard/settings');
    return { success: true };

  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: 'Invalid notification preferences data' };
    }
    await logServerError(`Error updating notification preferences: ${err instanceof Error ? err.message : String(err)}`, { action: 'notification_preferences.updateNotificationPreferences' });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function getNotificationPreferences(): Promise<{
  data: NotificationPreferencesInput | null;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: 'Unauthorized' };
    }

    const { data, error } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    const defaultPrefs: NotificationPreferencesInput = {
      email_messages: true,
      email_pipeline_updates: true,
      email_event_reminders: true,
      email_profile_views: false,
      email_announcements: true,
      email_task_reminders: true,
      push_messages: false,
      push_events: false,
      push_task_reminders: true,
    };

    const prefs = (data?.notification_preferences as NotificationPreferencesInput) || {};
    return { data: { ...defaultPrefs, ...prefs } };
  } catch (err) {
    await logServerError(`Failed to fetch notification preferences: ${err instanceof Error ? err.message : String(err)}`, { action: 'notification_preferences.getNotificationPreferences' });
    return { data: null, error: 'Failed to fetch preferences' };
  }
}
