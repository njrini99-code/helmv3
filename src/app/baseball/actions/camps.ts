'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';

// ============================================================================
// AUTH HELPERS
// ============================================================================

async function requireAuthCoach() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase, user: null, coach: null, error: 'Not authenticated' as const };
  }

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { supabase, user, coach: null, error: 'Coach not found' as const };
  }

  return { supabase, user, coach, error: null };
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
  const { supabase, coach, error: authError } = await requireAuthCoach();

  if (authError || !coach) {
    return { success: false, error: authError ?? 'Unauthorized' };
  }

  // Verify coach owns this camp
  const { data: camp } = await fromUntyped(supabase, 'baseball_camps')
    .select('id, coach_id')
    .eq('id', campId)
    .single();

  if (!camp) {
    return { success: false, error: 'Camp not found' };
  }

  if (camp.coach_id !== coach.id) {
    await logServerError('[Security] deleteCamp: coach does not own camp', {
      action: 'camps.deleteCamp',
      metadata: { campId, coachId: coach.id, campCoachId: camp.coach_id },
    });
    return { success: false, error: 'Unauthorized' };
  }

  // Delete all registrations first (FK constraint)
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

  // Delete the camp
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

  revalidatePath('/baseball/dashboard/camps');
  return { success: true };
}

/**
 * Check in a player at a camp (set status to 'attended').
 * Verifies the caller is the coach who owns the camp.
 */
export async function checkInCampPlayer(
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, coach, error: authError } = await requireAuthCoach();

  if (authError || !coach) {
    return { success: false, error: authError ?? 'Unauthorized' };
  }

  // Verify the registration belongs to a camp owned by this coach
  const { data: reg } = await fromUntyped(supabase, 'baseball_camp_registrations')
    .select('id, camp_id, baseball_camps!inner(coach_id)')
    .eq('id', registrationId)
    .single();

  if (!reg) {
    return { success: false, error: 'Registration not found' };
  }

  const campCoachId = reg.baseball_camps?.coach_id;
  if (campCoachId !== coach.id) {
    await logServerError('[Security] checkInCampPlayer: coach does not own camp', {
      action: 'camps.checkInCampPlayer',
      metadata: { registrationId, coachId: coach.id },
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

  revalidatePath('/baseball/dashboard/camps');
  return { success: true };
}

/**
 * Mark a player as no-show at a camp.
 * Verifies the caller is the coach who owns the camp.
 */
export async function markCampNoShow(
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, coach, error: authError } = await requireAuthCoach();

  if (authError || !coach) {
    return { success: false, error: authError ?? 'Unauthorized' };
  }

  // Verify the registration belongs to a camp owned by this coach
  const { data: reg } = await fromUntyped(supabase, 'baseball_camp_registrations')
    .select('id, camp_id, baseball_camps!inner(coach_id)')
    .eq('id', registrationId)
    .single();

  if (!reg) {
    return { success: false, error: 'Registration not found' };
  }

  const campCoachId = reg.baseball_camps?.coach_id;
  if (campCoachId !== coach.id) {
    await logServerError('[Security] markCampNoShow: coach does not own camp', {
      action: 'camps.markCampNoShow',
      metadata: { registrationId, coachId: coach.id },
    });
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
    .update({ status: 'no_show' })
    .eq('id', registrationId);

  if (error) {
    return { success: false, error: 'Failed to update status' };
  }

  revalidatePath('/baseball/dashboard/camps');
  return { success: true };
}

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

  // Check if already registered (non-cancelled)
  const { data: existing } = await fromUntyped(supabase, 'baseball_camp_registrations')
    .select('id, status')
    .eq('camp_id', campId)
    .eq('player_id', player.id)
    .maybeSingle();

  if (existing && existing.status !== 'cancelled') {
    return { success: false, error: 'Already registered for this camp' };
  }

  if (existing && existing.status === 'cancelled') {
    // Re-activate cancelled registration
    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .update({ status: 'registered', registered_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) {
      return { success: false, error: 'Failed to register for camp' };
    }
  } else {
    // Insert new registration
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

  revalidatePath('/baseball/dashboard/camps');
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

  revalidatePath('/baseball/dashboard/camps');
  return { success: true };
}
