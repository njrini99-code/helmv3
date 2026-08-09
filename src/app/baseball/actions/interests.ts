'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
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
import { describeError } from '@/lib/utils/describe-error';

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
      `Unexpected error: ${describeError(error)}`,
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

    // The `error` is READ. This dedup guard exists to make adding an interest
    // IDEMPOTENT — the branch below deliberately returns success for a duplicate.
    // Discarded, a failed read looked like "not on the list yet", the insert
    // below then hit
    // UNIQUE (player_id, organization_id) — verified against production — and the
    // player got a hard failure for an interest they had already added. The
    // friendly path was designed; a dropped read should not take it away.
    const { data: existing, error: existingError } = await supabase
      .from('baseball_recruiting_interests')
      .select('id')
      .eq('player_id', playerId)
      .eq('organization_id', validated.organization_id)
      .maybeSingle();

    if (existingError) {
      throw new BaseballActionError('Could not check your current interests. Please try again.');
    }

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
      `Unexpected error: ${describeError(error)}`,
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

export async function updateInterestStatus(
  interestId: string,
  status: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateInterestStatusAction(interestId, status);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'interests.updateInterestStatus', featureArea: 'baseball-interests' },
    );
    return mapInterestActionError(error);
  }
}

const updateInterestStatusAction = withBaseballAction(
  'updateInterestStatus',
  { featureArea: 'baseball-interests' },
  async (ctx, interestId: string, status: string): Promise<{ success: boolean; error?: string }> => {
    const validated = RecruitingSchemas.updateStatus.parse({
      interest_id: interestId,
      status,
    });

    const playerId = ctx.activePlayerId;
    if (!playerId) {
      throw new BaseballActionError('Player not found');
    }

    const supabase = await createClient();

    // Verify ownership before mutating (mirrors verifyWatchlistOwnership's
    // pattern on the coach side): the interest must belong to this player.
    const { data: existing, error: fetchError } = await supabase
      .from('baseball_recruiting_interests')
      .select('id, player_id')
      .eq('id', validated.interest_id)
      .maybeSingle();

    if (fetchError || !existing) {
      throw new BaseballActionError('Interest not found');
    }
    if (existing.player_id !== playerId) {
      throw new BaseballActionError('Not your interest');
    }

    await logSecurityEvent({
      event: 'recruiting_interest_status_update',
      action: 'interests.updateInterestStatus',
      userId: ctx.user.id,
      metadata: {
        playerId,
        interestId: validated.interest_id,
        newStatus: validated.status,
      },
    });

    const { error } = await supabase
      .from('baseball_recruiting_interests')
      .update({
        status: validated.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.interest_id)
      .eq('player_id', playerId);

    if (error) {
      await logServerError(`[interests] Failed to update interest status: ${error.message}`, {
        action: 'interests.updateInterestStatus',
        metadata: { playerId, interestId: validated.interest_id },
      });
      throw new BaseballActionError('Failed to update status');
    }

    revalidateInterestPaths();
    return { success: true };
  },
);

async function getPlayerInterestsImpl() {
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

export const getPlayerInterests = withAdminObserved(
  'getPlayerInterests',
  { sport: 'baseball', feature: 'baseball_interests', featureArea: 'baseball-interests' },
  getPlayerInterestsImpl,
);
