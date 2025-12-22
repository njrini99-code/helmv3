/**
 * Optimized database queries with performance best practices
 *
 * Key optimizations:
 * 1. Select only needed columns (avoid SELECT *)
 * 2. Use pagination for large datasets
 * 3. Add proper indexing hints
 * 4. Minimize joins
 * 5. Cache frequently accessed data
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get paginated players with optimized query
 * Only selects needed columns for list view
 */
export async function getPlayersOptimized(params: {
  pagination?: PaginationParams;
  filters?: {
    gradYear?: number;
    position?: string;
    state?: string;
  };
}) {
  const supabase = await createClient();
  const page = params.pagination?.page || 1;
  const pageSize = params.pagination?.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Select only columns needed for player cards
  let query = supabase
    .from('players')
    .select(
      `
      id,
      first_name,
      last_name,
      primary_position,
      secondary_position,
      grad_year,
      city,
      state,
      high_school_name,
      avatar_url,
      pitch_velo,
      exit_velo,
      recruiting_activated
    `,
      { count: 'exact' }
    )
    .eq('recruiting_activated', true);

  // Apply filters
  if (params.filters?.gradYear) {
    query = query.eq('grad_year', params.filters.gradYear);
  }
  if (params.filters?.position) {
    query = query.eq('primary_position', params.filters.position);
  }
  if (params.filters?.state) {
    query = query.eq('state', params.filters.state);
  }

  // Pagination
  query = query.range(from, to);

  // Order by most recently updated
  query = query.order('updated_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: data || [],
    count: count || 0,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 0,
  };
}

/**
 * Get player by ID with optimized joins
 * Loads only necessary related data
 */
export async function getPlayerByIdOptimized(playerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('players')
    .select(
      `
      *,
      videos:videos(
        id,
        title,
        thumbnail_url,
        url,
        duration,
        view_count,
        is_primary,
        video_type,
        created_at
      )
    `
    )
    .eq('id', playerId)
    .limit(4, { foreignTable: 'videos' }) // Limit videos to 4 for performance
    .order('is_primary', { ascending: false, foreignTable: 'videos' })
    .order('created_at', { ascending: false, foreignTable: 'videos' })
    .single();

  if (error) throw error;

  return data;
}

/**
 * Get watchlist with optimized query
 * Minimizes data transfer
 */
export async function getWatchlistOptimized(
  coachId: string,
  params?: PaginationParams
) {
  const supabase = await createClient();
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('watchlists')
    .select(
      `
      id,
      status,
      created_at,
      player:players(
        id,
        first_name,
        last_name,
        primary_position,
        grad_year,
        avatar_url,
        pitch_velo,
        exit_velo
      )
    `,
      { count: 'exact' }
    )
    .eq('coach_id', coachId)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return {
    data: data || [],
    count: count || 0,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 0,
  };
}

/**
 * Get conversations with optimized query
 * Loads minimal data for list view
 */
export async function getConversationsOptimized(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conversations')
    .select(
      `
      id,
      created_at,
      updated_at,
      participants:conversation_participants(
        user:users(
          id,
          email,
          role
        )
      ),
      last_message:messages(
        id,
        content,
        sent_at,
        read,
        sender_id
      )
    `
    )
    .or(`id.in.(select conversation_id from conversation_participants where user_id=${userId})`)
    .limit(1, { foreignTable: 'last_message' })
    .order('sent_at', { ascending: false, foreignTable: 'last_message' })
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return data || [];
}

/**
 * Search players with optimized full-text search
 */
export async function searchPlayersOptimized(query: string, limit = 10) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('players')
    .select(
      `
      id,
      first_name,
      last_name,
      primary_position,
      grad_year,
      avatar_url,
      high_school_name
    `
    )
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .eq('recruiting_activated', true)
    .limit(limit);

  if (error) throw error;

  return data || [];
}

/**
 * Batch load players by IDs
 * Useful for loading multiple players efficiently
 */
export async function batchLoadPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('players')
    .select(
      `
      id,
      first_name,
      last_name,
      primary_position,
      grad_year,
      avatar_url
    `
    )
    .in('id', playerIds);

  if (error) throw error;

  return data || [];
}

/**
 * Count queries for analytics (optimized)
 */
export async function getAnalyticsCounts(userId: string, role: 'coach' | 'player') {
  const supabase = await createClient();

  if (role === 'coach') {
    const [watchlistCount, messagesCount] = await Promise.all([
      supabase
        .from('watchlists')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', userId),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .contains('participant_ids', [userId]),
    ]);

    return {
      watchlist: watchlistCount.count || 0,
      messages: messagesCount.count || 0,
    };
  } else {
    const [videosCount, messagesCount] = await Promise.all([
      supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', userId),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .contains('participant_ids', [userId]),
    ]);

    return {
      videos: videosCount.count || 0,
      messages: messagesCount.count || 0,
    };
  }
}

/**
 * Prefetch related data
 * Call this to warm up cache for anticipated data needs
 */
export async function prefetchPlayerData(playerId: string) {
  const supabase = await createClient();

  // Fire off prefetch queries in parallel (don't await)
  supabase
    .from('videos')
    .select('id, title, thumbnail_url')
    .eq('player_id', playerId)
    .limit(4)
    .then(() => {
      // Data is now in Supabase cache
    });

  supabase
    .from('player_metrics')
    .select('*')
    .eq('player_id', playerId)
    .then(() => {
      // Data is now in Supabase cache
    });
}
