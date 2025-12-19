import { createClient } from '@/lib/supabase/server';
import type { WatchlistFilters, PipelineStage } from '@/lib/types';

/**
 * Get a coach's watchlist with filters
 */
export async function getWatchlist(
  coachId: string,
  filters: WatchlistFilters = {}
) {
  const supabase = await createClient();

  let query = supabase
    .from('watchlists')
    .select(
      `
      *,
      player:players(
        id,
        first_name,
        last_name,
        full_name,
        avatar_url,
        city,
        state,
        primary_position,
        secondary_position,
        grad_year,
        bats,
        throws,
        gpa,
        high_school_org:organizations!players_high_school_org_id_fkey(
          name,
          location_city,
          location_state
        )
      )
    `
    )
    .eq('coach_id', coachId);

  // Apply filters
  if (filters.stage) {
    query = query.eq('pipeline_stage', filters.stage);
  }
  if (filters.gradYear) {
    query = query.eq('player.grad_year', filters.gradYear);
  }
  if (filters.position) {
    query = query.eq('player.primary_position', filters.position);
  }
  if (filters.search) {
    query = query.or(
      `player.first_name.ilike.%${filters.search}%,player.last_name.ilike.%${filters.search}%,player.full_name.ilike.%${filters.search}%`
    );
  }

  query = query.order('added_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching watchlist:', error);
    throw error;
  }

  return data;
}

/**
 * Add a player to watchlist
 */
export async function addToWatchlist(
  coachId: string,
  playerId: string,
  stage: PipelineStage = 'watchlist',
  notes?: string,
  tags?: string[]
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('watchlists')
    .upsert({
      coach_id: coachId,
      player_id: playerId,
      pipeline_stage: stage,
      notes,
      tags,
      added_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding to watchlist:', error);
    throw error;
  }

  // Log engagement event
  await supabase
    .from('player_engagement_events')
    .insert({
      player_id: playerId,
      coach_id: coachId,
      engagement_type: 'watchlist_add',
      engagement_date: new Date().toISOString(),
      metadata: { stage },
    });

  return data;
}

/**
 * Remove a player from watchlist
 */
export async function removeFromWatchlist(coachId: string, playerId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('coach_id', coachId)
    .eq('player_id', playerId);

  if (error) {
    console.error('Error removing from watchlist:', error);
    throw error;
  }

  // Log engagement event
  await supabase
    .from('player_engagement_events')
    .insert({
      player_id: playerId,
      coach_id: coachId,
      engagement_type: 'watchlist_remove',
      engagement_date: new Date().toISOString(),
    });

  return true;
}

/**
 * Update watchlist item (change stage, notes, etc.)
 */
export async function updateWatchlistItem(
  coachId: string,
  playerId: string,
  updates: {
    pipeline_stage?: PipelineStage;
    notes?: string;
    tags?: string[];
    priority?: number;
  }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('watchlists')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('coach_id', coachId)
    .eq('player_id', playerId)
    .select()
    .single();

  if (error) {
    console.error('Error updating watchlist item:', error);
    throw error;
  }

  return data;
}

/**
 * Get watchlist stats for a coach
 */
export async function getWatchlistStats(coachId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('watchlists')
    .select('pipeline_stage')
    .eq('coach_id', coachId);

  if (error) {
    console.error('Error fetching watchlist stats:', error);
    throw error;
  }

  const stats = {
    total: data.length,
    watchlist: data.filter((item) => item.pipeline_stage === 'watchlist').length,
    high_priority: data.filter((item) => item.pipeline_stage === 'high_priority').length,
    offer_extended: data.filter((item) => item.pipeline_stage === 'offer_extended').length,
    committed: data.filter((item) => item.pipeline_stage === 'committed').length,
    uninterested: data.filter((item) => item.pipeline_stage === 'uninterested').length,
  };

  return stats;
}

/**
 * Check if player is in coach's watchlist
 */
export async function isInWatchlist(coachId: string, playerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('watchlists')
    .select('id')
    .eq('coach_id', coachId)
    .eq('player_id', playerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found
    console.error('Error checking watchlist:', error);
    throw error;
  }

  return !!data;
}
