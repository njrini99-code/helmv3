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
import { notifyWatchlistAdd, notifyPipelineStageChange } from '@/lib/notifications';
import { WatchlistSchemas } from '@/lib/validation/action-schemas';
import { logServerError } from '@/lib/server-error-logger';

export async function addToWatchlist(coachId: string, playerId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify coach belongs to user
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    throw new Error('Unauthorized: Coach not found');
  }

  // Check if already in watchlist
  const { data: existing } = await supabase
    .from('baseball_watchlists')
    .select('id')
    .eq('coach_id', coachId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (existing) {
    return { success: false, message: 'Player already in watchlist' };
  }

  // Add to watchlist
  const { error } = await supabase
    .from('baseball_watchlists')
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
    .from('baseball_player_engagement_events')
    .insert({
      player_id: playerId,
      coach_id: coachId,
      engagement_type: 'watchlist_add',
      is_anonymous: false,
      metadata: { source: 'discover' },
    });

  revalidatePath('/baseball/dashboard/discover');
  revalidatePath('/baseball/dashboard/watchlist');
  revalidatePath('/baseball/dashboard/pipeline');


  // Notify the player (fire-and-forget)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: playerRow } = await supabase.from('baseball_players' as any)
      .select('user_id').eq('id', playerId).single() as { data: { user_id: string } | null };

    if (playerRow?.user_id) {
      const { data: userRow } = await supabase.from('users')
        .select('email').eq('id', playerRow.user_id).single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: coachRow } = await supabase.from('baseball_coaches' as any)
        .select('full_name, organization_id').eq('id', coachId).single() as
        { data: { full_name: string; organization_id: string | null } | null };

      let schoolName = 'a program';
      if (coachRow?.organization_id) {
        const { data: org } = await supabase.from('organizations')
          .select('name').eq('id', coachRow.organization_id).single();
        if (org?.name) schoolName = org.name;
      }

      if (userRow?.email) {
        await notifyWatchlistAdd(
          playerRow.user_id, userRow.email,
          coachRow?.full_name?.trim() || 'A coach', schoolName
        );
      }
    }
  } catch (notifErr) {
    await logServerError(`[addToWatchlist] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'watchlist.addToWatchlist' });
  }

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
    .from('baseball_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    throw new Error('Unauthorized: Coach not found');
  }

  const { error } = await supabase
    .from('baseball_watchlists')
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
      .from('baseball_watchlists')
      .update({
        pipeline_stage: validatedData.status as PipelineStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coach.id); // Belt and suspenders

    if (error) {
      await logServerError(`[Security] Watchlist update failed: ${error.message}`, { action: 'watchlist.updateWatchlistStatus', metadata: { watchlistId, coachId: coach.id } });
      return { success: false, error: 'Failed to update status' };
    }


    // Notify the player of their status change (fire-and-forget)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: watchlistRow } = await supabase.from('baseball_watchlists' as any)
        .select('player_id').eq('id', validatedData.watchlist_id).single() as
        { data: { player_id: string } | null };

      if (watchlistRow?.player_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: playerRow } = await supabase.from('baseball_players' as any)
          .select('user_id').eq('id', watchlistRow.player_id).single() as
          { data: { user_id: string } | null };

        if (playerRow?.user_id) {
          const { data: userRow } = await supabase.from('users')
            .select('email').eq('id', playerRow.user_id).single();

          let schoolName = 'a program';
          if (coach.organization_id) {
            const { data: org } = await supabase.from('organizations')
              .select('name').eq('id', coach.organization_id).single();
            if (org?.name) schoolName = org.name;
          }

          if (userRow?.email) {
            await notifyPipelineStageChange(
              playerRow.user_id, userRow.email, schoolName, validatedData.status
            );
          }
        }
      }
    } catch (notifErr) {
      await logServerError(`[updateWatchlistStatus] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'watchlist.updateWatchlistStatus' });
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
      .from('baseball_watchlists')
      .update({
        priority: validatedData.is_high_priority ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coach.id);

    if (error) {
      await logServerError(`[Security] Watchlist priority update failed: ${error.message}`, { action: 'watchlist.updateWatchlistPriority', metadata: { watchlistId, coachId: coach.id } });
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
      .from('baseball_watchlists')
      .update({
        notes: validatedData.note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coach.id);

    if (error) {
      await logServerError(`[Security] Watchlist note update failed: ${error.message}`, { action: 'watchlist.addWatchlistNote', metadata: { watchlistId, coachId: coach.id } });
      return { success: false, error: 'Failed to add note' };
    }

    revalidatePath('/baseball/dashboard/watchlist');
    return { success: true };

  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

// Simplified actions that get coach internally - for use in client components
export async function toggleWatchlistPlayer(playerId: string): Promise<{
  success: boolean;
  action?: 'added' | 'removed';
  error?: string
}> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Check if already in watchlist
    const { data: existing } = await supabase
      .from('baseball_watchlists')
      .select('id')
      .eq('coach_id', coach.id)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing) {
      // Remove from watchlist
      const { error } = await supabase
        .from('baseball_watchlists')
        .delete()
        .eq('coach_id', coach.id)
        .eq('player_id', playerId);

      if (error) {
        return { success: false, error: 'Failed to remove from watchlist' };
      }

      // Log engagement event for removal
      await supabase
        .from('baseball_player_engagement_events')
        .insert({
          player_id: playerId,
          coach_id: coach.id,
          engagement_type: 'watchlist_remove',
          is_anonymous: false,
          metadata: { source: 'toggle_action' },
        });

      revalidatePath('/baseball/dashboard/discover');
      revalidatePath('/baseball/dashboard/watchlist');
      revalidatePath('/baseball/dashboard/pipeline');

      return { success: true, action: 'removed' };
    } else {
      // Add to watchlist
      const { error } = await supabase
        .from('baseball_watchlists')
        .insert({
          coach_id: coach.id,
          player_id: playerId,
          pipeline_stage: 'watchlist',
          priority: 0,
        });

      if (error) {
        return { success: false, error: 'Failed to add to watchlist' };
      }

      // Log engagement event
      await supabase
        .from('baseball_player_engagement_events')
        .insert({
          player_id: playerId,
          coach_id: coach.id,
          engagement_type: 'watchlist_add',
          is_anonymous: false,
          metadata: { source: 'player_profile' },
        });

      revalidatePath('/baseball/dashboard/discover');
      revalidatePath('/baseball/dashboard/watchlist');
      revalidatePath('/baseball/dashboard/pipeline');

      return { success: true, action: 'added' };
    }
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function checkWatchlistStatus(playerId: string): Promise<{
  isInWatchlist: boolean;
  watchlistId?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { isInWatchlist: false };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { isInWatchlist: false };
    }

    const { data } = await supabase
      .from('baseball_watchlists')
      .select('id')
      .eq('coach_id', coach.id)
      .eq('player_id', playerId)
      .maybeSingle();

    return {
      isInWatchlist: !!data,
      watchlistId: data?.id
    };
  } catch {
    return { isInWatchlist: false };
  }
}
