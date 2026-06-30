'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { RecruitingSchemas } from '@/lib/validation/action-schemas';
import {
  formatSafeErrorResponse,
  logSecurityEvent,
} from '@/lib/validation/server-action-validator';
import { logServerError } from '@/lib/server-error-logger';

const ALLOWED_ORG_TYPES = new Set(['college', 'juco']);

export async function addToInterests(
  organizationId: string,
): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
  try {
    const validated = RecruitingSchemas.addInterest.parse({
      organization_id: organizationId,
    });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { data: player } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      throw new Error('Player not found');
    }

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, type')
      .eq('id', validated.organization_id)
      .maybeSingle();

    if (orgError || !organization) {
      throw new Error('College program not found');
    }

    if (!ALLOWED_ORG_TYPES.has(organization.type)) {
      throw new Error('Only college and JUCO programs can be added to interests');
    }

    const { data: existing } = await supabase
      .from('baseball_recruiting_interests')
      .select('id')
      .eq('player_id', player.id)
      .eq('organization_id', validated.organization_id)
      .maybeSingle();

    if (existing) {
      return { success: true, alreadyExists: true };
    }

    await logSecurityEvent({
      event: 'recruiting_interest_add',
      action: 'interests.addToInterests',
      userId: user.id,
      metadata: {
        playerId: player.id,
        organizationId: validated.organization_id,
      },
    });

    const { error } = await fromUntyped(supabase, 'baseball_recruiting_interests').insert({
      player_id: player.id,
      organization_id: validated.organization_id,
      status: 'interested',
      interest_level: 'researching',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      await logServerError(`[interests] Failed to add interest: ${error.message}`, {
        action: 'interests.addToInterests',
        metadata: { playerId: player.id, organizationId: validated.organization_id },
      });
      throw new Error('Failed to add to interests');
    }

    revalidatePath('/baseball/dashboard/colleges');
    revalidatePath('/baseball/dashboard/journey');

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

export async function removeFromInterests(
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const validated = RecruitingSchemas.removeInterest.parse({
      organization_id: organizationId,
    });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { data: player } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      throw new Error('Player not found');
    }

    await logSecurityEvent({
      event: 'recruiting_interest_remove',
      action: 'interests.removeFromInterests',
      userId: user.id,
      metadata: {
        playerId: player.id,
        organizationId: validated.organization_id,
      },
    });

    const { error } = await supabase
      .from('baseball_recruiting_interests')
      .delete()
      .eq('player_id', player.id)
      .eq('organization_id', validated.organization_id);

    if (error) {
      await logServerError(`[interests] Failed to remove interest: ${error.message}`, {
        action: 'interests.removeFromInterests',
        metadata: { playerId: player.id, organizationId: validated.organization_id },
      });
      throw new Error('Failed to remove from interests');
    }

    revalidatePath('/baseball/dashboard/colleges');
    revalidatePath('/baseball/dashboard/journey');

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

export async function getPlayerInterests() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { interests: [] };
  }

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    return { interests: [] };
  }

  const { data: interests } = await supabase
    .from('baseball_recruiting_interests')
    .select('*')
    .eq('player_id', player.id);

  return { interests: interests || [] };
}
