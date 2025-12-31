'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { PipelineStage } from '@/lib/types';
import {
  requireCoach,
  verifyWatchlistOwnership
} from '@/lib/auth/ownership';
import {
  formatSafeErrorResponse,
  logSecurityEvent
} from '@/lib/validation/server-action-validator';
import { WatchlistSchemas } from '@/lib/validation/action-schemas';

export async function addToWatchlist(coachId: string, playerId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify coach belongs to user
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    throw new Error('Unauthorized: Coach not found');
  }

  // Check if already in watchlist
  const { data: existing } = await supabase
    .from('watchlists')
    .select('id')
    .eq('coach_id', coachId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (existing) {
    return { success: false, message: 'Player already in watchlist' };
  }

  // Add to watchlist
  const { error } = await supabase
    .from('watchlists')
    .insert({
      coach_id: coachId,
      player_id: playerId,
      pipeline_stage: 'watchlist',
      priority: 0,
    });

  if (error) {
    throw new Error('Failed to add to watchlist');
  }

  // Log engagement event
  await supabase
    .from('player_engagement_events')
    .insert({
      player_id: playerId,
      coach_id: coachId,
      engagement_type: 'watchlist_add',
      engagement_date: new Date().toISOString(),
      is_anonymous: false,
      metametadata: { source: 'discover' },
    });

  revalidatePath('/baseball/dashboard/discover');
  revalidatePath('/baseball/dashboard/watchlist');
  revalidatePath('/baseball/dashboard/pipeline');

  return { success: true };
}

export async function removeFromWatchlist(coachId: string, playerId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify coach belongs to user
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    throw new Error('Unauthorized: Coach not found');
  }

  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('coach_id', coachId)
    .eq('player_id', playerId);

  if (error) {
    throw new Error('Failed to remove from watchlist');
  }

  revalidatePath('/baseball/dashboard/discover');
  revalidatePath('/baseball/dashboard/watchlist');
  revalidatePath('/baseball/dashboard/pipeline');

  return { success: true };
}

export async function updateWatchlistStatus(
  watchlistId: string,
  status: PipelineStage
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, coach } = await requireCoach();

    // Validate input with centralized schema
    const validatedData = WatchlistSchemas.updateStatus.parse({
      watchlist_id: watchlistId,
      status
    });

    // Verify ownership
    await verifyWatchlistOwnership(supabase, validatedData.watchlist_id, coach.id);

    // Log security event
    await logSecurityEvent({
      event: 'watchlist_update',
      action: 'watchlist_action',
      userId: coach.user_id,
      metadata: { watchlistId: validatedData.watchlist_id, newStatus: validatedData.status }
    });

    const { error } = await supabase
      .from('watchlists')
      .update({
        pipeline_stage: validatedData.status as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coach.id); // Belt and suspenders

    if (error) {
      console.error('[Security] Watchlist update failed:', { watchlistId, coachId: coach.id, error: error.message });
      return { success: false, error: 'Failed to update status' };
    }

    revalidatePath('/baseball/dashboard/watchlist');
    revalidatePath('/baseball/dashboard/pipeline');
    return { success: true };

  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

export async function updateWatchlistPriority(
  watchlistId: string,
  isHighPriority: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, coach } = await requireCoach();

    // Validate input with centralized schema
    const validatedData = WatchlistSchemas.updatePriority.parse({
      watchlist_id: watchlistId,
      is_high_priority: isHighPriority
    });

    await verifyWatchlistOwnership(supabase, validatedData.watchlist_id, coach.id);

    // Log security event
    await logSecurityEvent({
      event: 'watchlist_update',
      action: 'watchlist_action',
      userId: coach.user_id,
      metadata: { watchlistId: validatedData.watchlist_id, isHighPriority: validatedData.is_high_priority }
    });

    const { error } = await supabase
      .from('watchlists')
      .update({
        priority: validatedData.is_high_priority ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coach.id);

    if (error) {
      console.error('[Security] Watchlist priority update failed:', { watchlistId, coachId: coach.id, error: error.message });
      return { success: false, error: 'Failed to update priority' };
    }

    revalidatePath('/baseball/dashboard/watchlist');
    return { success: true };

  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

export async function addWatchlistNote(
  watchlistId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, coach } = await requireCoach();

    // Validate input with centralized schema
    const validatedData = WatchlistSchemas.addNote.parse({
      watchlist_id: watchlistId,
      note
    });

    await verifyWatchlistOwnership(supabase, validatedData.watchlist_id, coach.id);

    // Log security event
    await logSecurityEvent({
      event: 'watchlist_update',
      action: 'watchlist_action',
      userId: coach.user_id,
      metadata: { watchlistId: validatedData.watchlist_id, noteLength: validatedData.note.length }
    });

    const { error } = await supabase
      .from('watchlists')
      .update({
        notes: validatedData.note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coach.id);

    if (error) {
      console.error('[Security] Watchlist note update failed:', { watchlistId, coachId: coach.id, error: error.message });
      return { success: false, error: 'Failed to add note' };
    }

    revalidatePath('/baseball/dashboard/watchlist');
    return { success: true };

  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}
