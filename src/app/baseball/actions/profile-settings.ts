'use server';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  requireAuth,
  verifyOrganizationAdmin
} from '@/lib/auth/ownership';
import {
  formatSafeErrorResponse,
  logSecurityEvent
} from '@/lib/validation/server-action-validator';
import {
  OrganizationSchemas
} from '@/lib/validation/action-schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const playerPrivacySettingsSchema = z.object({
  show_contact_info: z.boolean().optional(),
  show_academics: z.boolean().optional(),
  show_videos: z.boolean().optional(),
  show_stats: z.boolean().optional(),
  allow_coach_messages: z.boolean().optional(),
  email_on_profile_view: z.boolean().optional(),
  email_on_watchlist_add: z.boolean().optional(),
  email_on_message: z.boolean().optional(),
});

type PlayerPrivacySettings = z.infer<typeof playerPrivacySettingsSchema>;

export async function updatePlayerPrivacySettings(playerId: string, settings: PlayerPrivacySettings) {
  try {
    // Validate input
    const validatedSettings = playerPrivacySettingsSchema.parse(settings);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Verify player belongs to user
    const { data: player } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('id', playerId)
      .eq('user_id', user.id)
      .single();

    if (!player) {
      throw new Error('Unauthorized: Player not found');
    }

    // Update settings
    const { error } = await supabase
      .from('baseball_player_settings')
      .upsert({
        player_id: playerId,
        ...validatedSettings,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error('Failed to update settings. Please try again.');
    }

    revalidatePath('/baseball/dashboard/settings');
    revalidatePath(`/player/${playerId}`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid privacy settings data');
    }
    throw error;
  }
}

export async function updateOrganizationProfile(
  organizationId: string,
  data: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user } = await requireAuth();

    // Verify admin access
    await verifyOrganizationAdmin(supabase, organizationId, user.id);

    // Validate input with centralized schema
    const validatedData = OrganizationSchemas.update.parse(data);

    // Log security event
    await logSecurityEvent({
      event: 'organization_update',
      action: 'organization_profile_update',
      userId: user.id,
      metadata: { organizationId },
    });

    // Filter out undefined values
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    });

    const { error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId);

    if (error) {
      console.error('[Security] Organization update failed:', { organizationId, userId: user.id, error: error.message });
      return { success: false, error: 'Failed to update organization' };
    }

    revalidatePath('/baseball/dashboard/program');
    revalidatePath(`/program/${organizationId}`);
    return { success: true };

  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

// ============================================================================
// ORGANIZATION SETTINGS
// ============================================================================

const organizationSettingsSchema = z.object({
  // Display settings
  show_description: z.boolean().optional(),
  show_program_stats: z.boolean().optional(),
  show_conference_info: z.boolean().optional(),
  show_facilities: z.boolean().optional(),
  show_staff_bios: z.boolean().optional(),
  show_email: z.boolean().optional(),
  show_phone: z.boolean().optional(),
  show_social_links: z.boolean().optional(),
  // Communication settings
  allow_player_messages: z.boolean().optional(),
  require_verified_email: z.boolean().optional(),
  // Recruiting settings
  show_recruiting_needs: z.boolean().optional(),
  show_roster_spots: z.boolean().optional(),
});

type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;

export async function updateOrganizationSettings(
  organizationId: string,
  settings: OrganizationSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user } = await requireAuth();

    // Verify admin access
    await verifyOrganizationAdmin(supabase, organizationId, user.id);

    // Validate input
    const validatedSettings = organizationSettingsSchema.parse(settings);

    // Log security event
    await logSecurityEvent({
      event: 'organization_settings_update',
      action: 'organization_settings_update',
      userId: user.id,
      metadata: { organizationId },
    });

    // Upsert settings (insert or update)
    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: organizationId,
        ...validatedSettings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id'
      });

    if (error) {
      console.error('[Security] Organization settings update failed:', {
        organizationId,
        userId: user.id,
        error: error.message
      });
      return { success: false, error: 'Failed to update organization settings' };
    }

    revalidatePath('/baseball/dashboard/program');
    revalidatePath(`/program/${organizationId}`);
    return { success: true };

  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

export async function getOrganizationSettings(
  organizationId: string
): Promise<{ data: OrganizationSettingsInput | null; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      return { data: null, error: sanitizeDbError(error, 'profile-settings') };
    }

    // Return settings or defaults
    const defaultSettings: OrganizationSettingsInput = {
      show_description: true,
      show_program_stats: true,
      show_conference_info: true,
      show_facilities: true,
      show_staff_bios: true,
      show_email: true,
      show_phone: true,
      show_social_links: true,
      allow_player_messages: true,
      require_verified_email: false,
      show_recruiting_needs: false,
      show_roster_spots: false,
    };

    if (!data) {
      return { data: defaultSettings };
    }

    // Merge data with defaults, converting null to undefined
    const mergedSettings: OrganizationSettingsInput = {
      show_description: data.show_description ?? defaultSettings.show_description,
      show_program_stats: data.show_program_stats ?? defaultSettings.show_program_stats,
      show_conference_info: data.show_conference_info ?? defaultSettings.show_conference_info,
      show_facilities: data.show_facilities ?? defaultSettings.show_facilities,
      show_staff_bios: data.show_staff_bios ?? defaultSettings.show_staff_bios,
      show_email: data.show_email ?? defaultSettings.show_email,
      show_phone: data.show_phone ?? defaultSettings.show_phone,
      show_social_links: data.show_social_links ?? defaultSettings.show_social_links,
      allow_player_messages: data.allow_player_messages ?? defaultSettings.allow_player_messages,
      require_verified_email: data.require_verified_email ?? defaultSettings.require_verified_email,
      show_recruiting_needs: data.show_recruiting_needs ?? defaultSettings.show_recruiting_needs,
      show_roster_spots: data.show_roster_spots ?? defaultSettings.show_roster_spots,
    };

    return { data: mergedSettings };
  } catch (err) {
    console.error('Failed to fetch organization settings:', err);
    return { data: null, error: 'Failed to fetch settings' };
  }
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

const notificationPreferencesSchema = z.object({
  // Email preferences
  email_messages: z.boolean().optional(),
  email_pipeline_updates: z.boolean().optional(),
  email_event_reminders: z.boolean().optional(),
  email_profile_views: z.boolean().optional(),
  email_announcements: z.boolean().optional(),
  email_task_reminders: z.boolean().optional(),
  // Push preferences
  push_messages: z.boolean().optional(),
  push_events: z.boolean().optional(),
  push_task_reminders: z.boolean().optional(),
});

type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

/**
 * Update the current user's notification preferences
 */
export async function updateNotificationPreferences(
  preferences: NotificationPreferencesInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate input
    const validatedPrefs = notificationPreferencesSchema.parse(preferences);

    // Get current preferences to merge
    const { data: currentUser } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();

    const currentPrefs = (currentUser?.notification_preferences as Record<string, unknown>) || {};
    const mergedPrefs = { ...currentPrefs, ...validatedPrefs };

    // Update preferences
    const { error } = await supabase
      .from('users')
      .update({ notification_preferences: mergedPrefs })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to update notification preferences:', error);
      return { success: false, error: 'Failed to update notification preferences' };
    }

    revalidatePath('/baseball/dashboard/settings');
    revalidatePath('/golf/dashboard/settings');
    return { success: true };

  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: 'Invalid notification preferences data' };
    }
    console.error('Error updating notification preferences:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get the current user's notification preferences
 */
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
      return { data: null, error: sanitizeDbError(error, 'profile-settings') };
    }

    // Default preferences
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
    console.error('Failed to fetch notification preferences:', err);
    return { data: null, error: 'Failed to fetch preferences' };
  }
}
