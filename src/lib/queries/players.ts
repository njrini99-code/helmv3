import { createClient } from '@/lib/supabase/server';
import type { DiscoverPlayer, DiscoverFilters, DiscoverSortOption } from '@/lib/types';

/**
 * Get players for the discover page with filters and pagination
 */
export async function getDiscoverPlayers(
  filters: DiscoverFilters = {},
  sort: DiscoverSortOption = 'updated_desc',
  page: number = 1,
  limit: number = 50
) {
  const supabase = await createClient();
  const offset = (page - 1) * limit;

  let query = supabase
    .from('players')
    .select(
      `
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
        id,
        name,
        location_city,
        location_state
      )
    `,
      { count: 'exact' }
    )
    .eq('recruiting_activated', true);

  // Apply filters
  if (filters.gradYear) {
    query = query.eq('grad_year', filters.gradYear);
  }
  if (filters.position) {
    query = query.eq('primary_position', filters.position);
  }
  if (filters.state) {
    query = query.eq('state', filters.state);
  }
  if (filters.bats) {
    query = query.eq('bats', filters.bats);
  }
  if (filters.throws) {
    query = query.eq('throws', filters.throws);
  }
  if (filters.minGPA) {
    query = query.gte('gpa', filters.minGPA);
  }
  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`
    );
  }

  // Apply sorting
  switch (sort) {
    case 'name_asc':
      query = query.order('last_name', { ascending: true });
      break;
    case 'name_desc':
      query = query.order('last_name', { ascending: false });
      break;
    case 'grad_year_asc':
      query = query.order('grad_year', { ascending: true });
      break;
    case 'grad_year_desc':
      query = query.order('grad_year', { ascending: false });
      break;
    case 'gpa_desc':
      query = query.order('gpa', { ascending: false, nullsFirst: false });
      break;
    case 'updated_desc':
    default:
      query = query.order('updated_at', { ascending: false });
      break;
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching discover players:', error);
    throw error;
  }

  return {
    players: data as unknown as DiscoverPlayer[],
    total: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
}

/**
 * Get a single player's full profile
 */
export async function getPlayerProfile(playerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('players')
    .select(
      `
      *,
      user:users(*),
      high_school_org:organizations!players_high_school_org_id_fkey(*),
      showcase_org:organizations!players_showcase_org_id_fkey(*),
      college_org:organizations!players_college_org_id_fkey(*),
      settings:player_settings(*),
      metrics:player_metrics(*),
      achievements:player_achievements(*)
    `
    )
    .eq('id', playerId)
    .single();

  if (error) {
    console.error('Error fetching player profile:', error);
    throw error;
  }

  return data;
}

/**
 * Get a player's teams
 */
export async function getPlayerTeams(playerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('team_members')
    .select(
      `
      *,
      team:teams(
        *,
        organization:organizations(*),
        head_coach:coaches(*)
      )
    `
    )
    .eq('player_id', playerId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (error) {
    console.error('Error fetching player teams:', error);
    throw error;
  }

  return data;
}

/**
 * Get a player's engagement events (profile views, watchlist adds, etc.)
 */
export async function getPlayerEngagement(
  playerId: string,
  limit: number = 50
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('player_engagement_events')
    .select(
      `
      *,
      coach:coaches(
        id,
        full_name,
        coach_type,
        organization:organizations(name, division, location_city, location_state)
      )
    `
    )
    .eq('player_id', playerId)
    .order('engagement_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching player engagement:', error);
    throw error;
  }

  return data;
}

/**
 * Get recruiting interests for a player (schools they're interested in)
 */
export async function getPlayerRecruitingInterests(playerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recruiting_interests')
    .select(
      `
      *,
      organization:organizations(*)
    `
    )
    .eq('player_id', playerId)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('Error fetching recruiting interests:', error);
    throw error;
  }

  return data;
}

/**
 * Update player profile
 */
export async function updatePlayerProfile(
  playerId: string,
  updates: Record<string, any>
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('players')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId)
    .select()
    .single();

  if (error) {
    console.error('Error updating player profile:', error);
    throw error;
  }

  return data;
}

/**
 * Activate recruiting for a player
 */
export async function activateRecruiting(playerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('players')
    .update({
      recruiting_activated: true,
      recruiting_activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId)
    .select()
    .single();

  if (error) {
    console.error('Error activating recruiting:', error);
    throw error;
  }

  return data;
}
