'use server';

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
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
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
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
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
export async function registerForCamp(
  campId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, player, error: authError } = await requireAuthPlayer();

  if (authError || !player) {
    return { success: false, error: authError ?? 'Unauthorized' };
  }

  const { data: existing } = await fromUntyped(supabase, 'baseball_camp_registrations')
    .select('id, status')
    .eq('camp_id', campId)
    .eq('player_id', player.id)
    .maybeSingle();

  if (existing && existing.status !== 'cancelled') {
    return { success: false, error: 'Already registered for this camp' };
  }

  if (existing && existing.status === 'cancelled') {
    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .update({ status: 'registered', registered_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) {
      return { success: false, error: 'Failed to register for camp' };
    }
  } else {
    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .insert({
        camp_id: campId,
        player_id: player.id,
        status: 'registered',
        registered_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

    if (error) {
      return { success: false, error: 'Failed to register for camp' };
    }
  }

  revalidatePath(CAMPS_PATH);
  return { success: true };
}

/**
 * Unregister (cancel) a player's camp registration.
 * Verifies the caller is the authenticated player.
 */
export async function unregisterFromCamp(
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
