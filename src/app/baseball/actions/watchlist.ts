'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { PipelineStage } from '@/lib/types';

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
      metadata: { source: 'discover' },
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

export async function updateWatchlistStatus(watchlistId: string, status: PipelineStage) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('watchlists')
    .update({
      pipeline_stage: status as any, // Type assertion for new enum values
      updated_at: new Date().toISOString(),
    })
    .eq('id', watchlistId);

  if (error) {
    throw new Error('Failed to update status');
  }

  revalidatePath('/baseball/dashboard/watchlist');
  revalidatePath('/baseball/dashboard/pipeline');

  return { success: true };
}

export async function updateWatchlistPriority(watchlistId: string, isHighPriority: boolean) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('watchlists')
    .update({
      priority: isHighPriority ? 1 : 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', watchlistId);

  if (error) {
    throw new Error('Failed to update priority');
  }

  revalidatePath('/baseball/dashboard/watchlist');

  return { success: true };
}

export async function addWatchlistNote(watchlistId: string, note: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('watchlists')
    .update({
      notes: note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', watchlistId);

  if (error) {
    throw new Error('Failed to add note');
  }

  revalidatePath('/baseball/dashboard/watchlist');

  return { success: true };
}
