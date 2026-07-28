'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { describeError } from '@/lib/utils/describe-error';

const CAMPS_PATH = '/baseball/dashboard/camps';

// ============================================================================
// HELPERS
// ============================================================================

function mapCampsActionError(error: unknown): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'Unauthorized' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the camp action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

export interface CampInput {
  name: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
  capacity: number | null;
  price_cents: number | null;
  is_free: boolean;
}

async function requireAuthPlayer() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase, user: null, player: null, error: 'Not authenticated' as const };
  }

  const { data: player } = await fromUntyped(supabase, 'baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { supabase, user, player: null, error: 'Player not found' as const };
  }

  return { supabase, user, player, error: null };
}

// ============================================================================
// COACH — CAMP MANAGEMENT
// ============================================================================

/**
 * Create a new camp.
 *
 * Always writes `status: 'published'` — the RLS SELECT policy on
 * `baseball_camps` only exposes non-owner (player) reads when
 * `status = 'published'`. A camp created with any other status is
 * invisible to players even though the coach (who passes via the owner
 * EXISTS clause) sees it fine, so this must never drift.
 */
export async function createCamp(
  input: CampInput
): Promise<{ success: boolean; error?: string; campId?: string }> {
  try {
    return await createCampAction(input);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'camps.createCamp', featureArea: 'baseball-camps' },
    );
    return mapCampsActionError(error);
  }
}

const createCampAction = withBaseballAction(
  'createCamp',
  { featureArea: 'baseball-camps', requiredCapability: 'can_manage_settings' },
  async (
    ctx,
    input: CampInput,
  ): Promise<{ success: boolean; error?: string; campId?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: coachRow } = await fromUntyped(supabase, 'baseball_coaches')
      .select('organization_id')
      .eq('id', coachId)
      .single();

    const { data, error } = await fromUntyped(supabase, 'baseball_camps')
      .insert({
        name: input.name,
        description: input.description,
        location: input.location,
        start_date: input.start_date,
        end_date: input.end_date,
        capacity: input.capacity,
        price_cents: input.price_cents,
        is_free: input.is_free,
        coach_id: coachId,
        organization_id: coachRow?.organization_id ?? null,
        status: 'published',
      })
      .select('id')
      .single();

    if (error) {
      await logServerError(`createCamp: failed to create camp: ${error.message}`, {
        action: 'camps.createCamp',
        metadata: { coachId },
      });
      return { success: false, error: 'Failed to create camp' };
    }

    revalidatePath(CAMPS_PATH);
    return { success: true, campId: data?.id };
  },
);

/**
 * Update an existing camp.
 * Verifies the caller is the coach who owns the camp.
 *
 * Also writes `status: 'published'` — see createCamp for why. Edits made
 * through this action always keep the camp visible to players; there is
 * no separate "unpublish" flow today.
 */
export async function updateCamp(
  campId: string,
  input: CampInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateCampAction(campId, input);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'camps.updateCamp', featureArea: 'baseball-camps' },
    );
    return mapCampsActionError(error);
  }
}

const updateCampAction = withBaseballAction(
  'updateCamp',
  { featureArea: 'baseball-camps', requiredCapability: 'can_manage_settings' },
  async (
    ctx,
    campId: string,
    input: CampInput,
  ): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: camp } = await fromUntyped(supabase, 'baseball_camps')
      .select('id, coach_id')
      .eq('id', campId)
      .single();

    if (!camp) {
      return { success: false, error: 'Camp not found' };
    }

    if (camp.coach_id !== coachId) {
      await logServerError('[Security] updateCamp: coach does not own camp', {
        action: 'camps.updateCamp',
        metadata: { campId, coachId, campCoachId: camp.coach_id },
      });
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await fromUntyped(supabase, 'baseball_camps')
      .update({
        name: input.name,
        description: input.description,
        location: input.location,
        start_date: input.start_date,
        end_date: input.end_date,
        capacity: input.capacity,
        price_cents: input.price_cents,
        is_free: input.is_free,
        status: 'published',
      })
      .eq('id', campId);

    if (error) {
      await logServerError(`updateCamp: failed to update camp: ${error.message}`, {
        action: 'camps.updateCamp',
        metadata: { campId },
      });
      return { success: false, error: 'Failed to update camp' };
    }

    revalidatePath(CAMPS_PATH);
    return { success: true };
  },
);

/**
 * Delete a camp and its registrations.
 * Verifies the caller is the coach who owns the camp.
 */
export async function deleteCamp(
  campId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await deleteCampAction(campId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'camps.deleteCamp', featureArea: 'baseball-camps' },
    );
    return mapCampsActionError(error);
  }
}

const deleteCampAction = withBaseballAction(
  'deleteCamp',
  { featureArea: 'baseball-camps', requiredCapability: 'can_manage_settings' },
  async (ctx, campId: string): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: camp } = await fromUntyped(supabase, 'baseball_camps')
      .select('id, coach_id')
      .eq('id', campId)
      .single();

    if (!camp) {
      return { success: false, error: 'Camp not found' };
    }

    if (camp.coach_id !== coachId) {
      await logServerError('[Security] deleteCamp: coach does not own camp', {
        action: 'camps.deleteCamp',
        metadata: { campId, coachId, campCoachId: camp.coach_id },
      });
      return { success: false, error: 'Unauthorized' };
    }

    const { error: regsError } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .delete()
      .eq('camp_id', campId);

    if (regsError) {
      await logServerError(`deleteCamp: failed to delete registrations: ${regsError.message}`, {
        action: 'camps.deleteCamp',
        metadata: { campId },
      });
      return { success: false, error: 'Failed to delete camp registrations' };
    }

    const { error: campError } = await fromUntyped(supabase, 'baseball_camps')
      .delete()
      .eq('id', campId);

    if (campError) {
      await logServerError(`deleteCamp: failed to delete camp: ${campError.message}`, {
        action: 'camps.deleteCamp',
        metadata: { campId },
      });
      return { success: false, error: 'Failed to delete camp' };
    }

    revalidatePath(CAMPS_PATH);
    return { success: true };
  },
);

/**
 * Check in a player at a camp (set status to 'attended').
 * Verifies the caller is the coach who owns the camp.
 */
export async function checkInCampPlayer(
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await checkInCampPlayerAction(registrationId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'camps.checkInCampPlayer', featureArea: 'baseball-camps' },
    );
    return mapCampsActionError(error);
  }
}

const checkInCampPlayerAction = withBaseballAction(
  'checkInCampPlayer',
  { featureArea: 'baseball-camps', requiredCapability: 'can_manage_settings' },
  async (ctx, registrationId: string): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: reg } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .select('id, camp_id, baseball_camps!inner(coach_id)')
      .eq('id', registrationId)
      .single();

    if (!reg) {
      return { success: false, error: 'Registration not found' };
    }

    const campCoachId = reg.baseball_camps?.coach_id;
    if (campCoachId !== coachId) {
      await logServerError('[Security] checkInCampPlayer: coach does not own camp', {
        action: 'camps.checkInCampPlayer',
        metadata: { registrationId, coachId },
      });
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .update({
        status: 'attended',
        attended_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      return { success: false, error: 'Failed to check in player' };
    }

    revalidatePath(CAMPS_PATH);
    return { success: true };
  },
);

/**
 * Mark a player as no-show at a camp.
 * Verifies the caller is the coach who owns the camp.
 */
export async function markCampNoShow(
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await markCampNoShowAction(registrationId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'camps.markCampNoShow', featureArea: 'baseball-camps' },
    );
    return mapCampsActionError(error);
  }
}

const markCampNoShowAction = withBaseballAction(
  'markCampNoShow',
  { featureArea: 'baseball-camps', requiredCapability: 'can_manage_settings' },
  async (ctx, registrationId: string): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: reg } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .select('id, camp_id, baseball_camps!inner(coach_id)')
      .eq('id', registrationId)
      .single();

    if (!reg) {
      return { success: false, error: 'Registration not found' };
    }

    const campCoachId = reg.baseball_camps?.coach_id;
    if (campCoachId !== coachId) {
      await logServerError('[Security] markCampNoShow: coach does not own camp', {
        action: 'camps.markCampNoShow',
        metadata: { registrationId, coachId },
      });
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .update({ status: 'no_show' })
      .eq('id', registrationId);

    if (error) {
      return { success: false, error: 'Failed to update status' };
    }

    revalidatePath(CAMPS_PATH);
    return { success: true };
  },
);

// ============================================================================
// PLAYER — CAMP REGISTRATION
// ============================================================================

/**
 * Register a player for a camp.
 * Verifies the caller is the authenticated player.
 */
async function registerForCampImpl(
  campId: string
): Promise<{ success: boolean; error?: string }> {
  // The atomic RPC below resolves the player from auth.uid() itself and can
  // never register anyone else, so we only need to confirm the caller is
  // authenticated here. The explicit getUser() also satisfies the
  // server-action auth-check gate, which cannot see through requireAuthPlayer.
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Capacity is enforced atomically in the DB. baseball_register_for_camp locks
  // the camp row, counts active (non-cancelled) registrations, and rejects
  // over-capacity joins inside one transaction — a client-side insert (or this
  // action's old count-free insert) could overbook under concurrent sign-ups.
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc(
    'baseball_register_for_camp',
    { p_camp_id: campId },
  );

  if (error) {
    return { success: false, error: 'Failed to register for camp' };
  }

  switch (data as string) {
    case 'registered':
      revalidatePath(CAMPS_PATH);
      return { success: true };
    case 'full':
      return { success: false, error: 'This camp is full' };
    case 'already_registered':
      return { success: false, error: 'Already registered for this camp' };
    case 'not_found':
      return { success: false, error: 'Camp not found' };
    case 'unauthorized':
      return { success: false, error: 'Unauthorized' };
    default:
      return { success: false, error: 'Failed to register for camp' };
  }
}

/**
 * Unregister (cancel) a player's camp registration.
 * Verifies the caller is the authenticated player.
 */
async function unregisterFromCampImpl(
  campId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, player, error: authError } = await requireAuthPlayer();

  if (authError || !player) {
    return { success: false, error: authError ?? 'Unauthorized' };
  }

  const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
    .update({ status: 'cancelled' })
    .eq('camp_id', campId)
    .eq('player_id', player.id);

  if (error) {
    return { success: false, error: 'Failed to cancel registration' };
  }

  revalidatePath(CAMPS_PATH);
  return { success: true };
}

export const registerForCamp = withAdminObserved(
  'registerForCamp',
  { sport: 'baseball', feature: 'baseball_camps', featureArea: 'baseball-camps' },
  registerForCampImpl,
);

export const unregisterFromCamp = withAdminObserved(
  'unregisterFromCamp',
  { sport: 'baseball', feature: 'baseball_camps', featureArea: 'baseball-camps' },
  unregisterFromCampImpl,
);
