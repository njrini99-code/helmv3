import { createClient } from '@/lib/supabase/server';
import { cached, baseballCache, invalidateBaseball } from './index';

/**
 * Get colleges list with caching (reference data)
 */
export async function getCachedColleges() {
  return cached(
    baseballCache.colleges.key(),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, division, conference, state, city')
        .eq('type', 'college')
        .order('name');
      if (error) throw error;
      return data;
    },
    { ttl: baseballCache.colleges.ttl }
  );
}

/**
 * Get high schools by state with caching
 */
export async function getCachedHighSchools(state: string) {
  return cached(
    baseballCache.highSchools.key(state),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, city, state')
        .eq('type', 'high_school')
        .eq('state', state)
        .order('name');
      if (error) throw error;
      return data;
    },
    { ttl: baseballCache.highSchools.ttl }
  );
}

/**
 * Get player public profile with caching
 */
export async function getCachedPlayerProfile(playerId: string) {
  return cached(
    baseballCache.playerProfile.key(playerId),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('baseball_players')
        .select(`
          id,
          first_name,
          last_name,
          avatar_url,
          city,
          state,
          primary_position,
          secondary_position,
          grad_year,
          height_feet,
          height_inches,
          weight_lbs,
          bats,
          throws,
          high_school_name,
          gpa,
          pitch_velo,
          exit_velo,
          sixty_time,
          pop_time,
          arm_strength,
          about_me,
          recruiting_activated,
          has_video
        `)
        .eq('id', playerId)
        .eq('recruiting_activated', true)
        .single();
      if (error) throw error;
      return data;
    },
    { ttl: baseballCache.playerProfile.ttl }
  );
}

/**
 * Get organization data with caching
 */
export async function getCachedOrganization(orgId: string) {
  return cached(
    baseballCache.organization.key(orgId),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          id,
          name,
          type,
          division,
          conference,
          location_city,
          location_state,
          logo_url,
          banner_url,
          website_url,
          description,
          primary_color,
          secondary_color
        `)
        .eq('id', orgId)
        .single();
      if (error) throw error;
      return data;
    },
    { ttl: baseballCache.organization.ttl }
  );
}

/**
 * Get coach watchlist with caching
 */
export async function getCachedWatchlist(coachId: string) {
  return cached(
    baseballCache.watchlist.key(coachId),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('baseball_watchlists')
        .select(`
          id,
          player_id,
          status,
          notes,
          rating,
          created_at,
          updated_at,
          player:baseball_players(
            id,
            first_name,
            last_name,
            avatar_url,
            primary_position,
            grad_year,
            state,
            high_school_name
          )
        `)
        .eq('coach_id', coachId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    { ttl: baseballCache.watchlist.ttl }
  );
}

// Re-export invalidation helpers
export { invalidateBaseball };
