'use server';

import { createClient } from '@/lib/supabase/server';
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
      .from('players')
      .select('id')
      .eq('id', playerId)
      .eq('user_id', user.id)
      .single();

    if (!player) {
      throw new Error('Unauthorized: Player not found');
    }

    // Update settings
    const { error } = await supabase
      .from('player_settings')
      .upsert({
        player_id: playerId,
        ...validatedSettings,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to update settings: ${error.message}`);
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

export async function updateOrganizationSettings(_organizationId: string, _settings: unknown) {
  // TODO: Implement when organization_settings table is created
  throw new Error('Not implemented');

  /* const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Update settings
  const { error } = await supabase
    .from('organization_settings')
    .upsert({
      organization_id: organizationId,
      ...settings,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to update settings: ${error.message}`);
  }

  revalidatePath('/baseball/dashboard/program');
  revalidatePath(`/program/${organizationId}`); */
}
