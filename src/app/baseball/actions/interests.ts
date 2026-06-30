'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { RecruitingSchemas } from '@/lib/validation/action-schemas';
import { logSecurityEvent } from '@/lib/validation/server-action-validator';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { z } from 'zod';

const ALLOWED_ORG_TYPES = new Set(['college', 'juco']);

const INTEREST_PATHS = [
  '/baseball/dashboard/colleges',
  '/baseball/dashboard/journey',
] as const;

function revalidateInterestPaths() {
  for (const path of INTEREST_PATHS) {
    revalidatePath(path);
  }
}

function mapInterestActionError(
  error: unknown,
): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Player or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage interests' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the interest action. Please try again.' };
  }
  if (error instanceof z.ZodError) {
    const firstError = error.issues?.[0];
    return { success: false, error: firstError?.message || 'Invalid input data' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

export async function addToInterests(
  organizationId: string,
): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
  try {
    return await addToInterestsAction(organizationId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'interests.addToInterests', featureArea: 'baseball-interests' },
    );
    return mapInterestActionError(error);
  }
}

const addToInterestsAction = withBaseballAction(
  'addToInterests',
  { featureArea: 'baseball-interests' },
  async (ctx, organizationId: string): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> => {
    const validated = RecruitingSchemas.addInterest.parse({
      organization_id: organizationId,
    });

    const playerId = ctx.activePlayerId;
    if (!playerId) {
      throw new BaseballActionError('Player not found');
    }

    const supabase = await createClient();

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, type')
      .eq('id', validated.organization_id)
      .maybeSingle();

    if (orgError || !organization) {
      throw new BaseballActionError('College program not found');
    }

    if (!ALLOWED_ORG_TYPES.has(organization.type)) {
      throw new BaseballActionError('Only college and JUCO programs can be added to interests');
    }

    const { data: existing } = await supabase
      .from('baseball_recruiting_interests')
      .select('id')
      .eq('player_id', playerId)
      .eq('organization_id', validated.organization_id)
      .maybeSingle();

    if (existing) {
      return { success: true, alreadyExists: true };
    }

    await logSecurityEvent({
      event: 'recruiting_interest_add',
      action: 'interests.addToInterests',
      userId: ctx.user.id,
      metadata: {
        playerId,
        organizationId: validated.organization_id,
      },
    });

    const { error } = await fromUntyped(supabase, 'baseball_recruiting_interests').insert({
      player_id: playerId,
      organization_id: validated.organization_id,
      status: 'interested',
      interest_level: 'researching',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      await logServerError(`[interests] Failed to add interest: ${error.message}`, {
        action: 'interests.addToInterests',
        metadata: { playerId, organizationId: validated.organization_id },
      });
      throw new BaseballActionError('Failed to add to interests');
    }

    revalidateInterestPaths();
    return { success: true };
  },
);

export async function removeFromInterests(
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await removeFromInterestsAction(organizationId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'interests.removeFromInterests', featureArea: 'baseball-interests' },
    );
    return mapInterestActionError(error);
  }
}

const removeFromInterestsAction = withBaseballAction(
  'removeFromInterests',
  { featureArea: 'baseball-interests' },
  async (ctx, organizationId: string): Promise<{ success: boolean; error?: string }> => {
    const validated = RecruitingSchemas.removeInterest.parse({
      organization_id: organizationId,
    });

    const playerId = ctx.activePlayerId;
    if (!playerId) {
      throw new BaseballActionError('Player not found');
    }

    const supabase = await createClient();

    await logSecurityEvent({
      event: 'recruiting_interest_remove',
      action: 'interests.removeFromInterests',
      userId: ctx.user.id,
      metadata: {
        playerId,
        organizationId: validated.organization_id,
      },
    });

    const { error } = await supabase
      .from('baseball_recruiting_interests')
      .delete()
      .eq('player_id', playerId)
      .eq('organization_id', validated.organization_id);

    if (error) {
      await logServerError(`[interests] Failed to remove interest: ${error.message}`, {
        action: 'interests.removeFromInterests',
        metadata: { playerId, organizationId: validated.organization_id },
      });
      throw new BaseballActionError('Failed to remove from interests');
    }

    revalidateInterestPaths();
    return { success: true };
  },
);

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
