import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { cached, golfCache, invalidateGolf } from './index';

/**
 * Get qualifier leaderboard with caching
 */
export async function getCachedLeaderboard(qualifierId: string) {
  return cached(
    golfCache.leaderboard.key(qualifierId),
    async () => {
      const supabase = await createClient();
      // Use raw SQL call since RPC types may not be generated
      const { data, error } = await supabase
        .from('golf_qualifier_entries')
        .select(`
          id,
          player_id,
          position,
          total_score,
          player:golf_players(id, first_name, last_name)
        `)
        .eq('qualifier_id', qualifierId)
        .order('position', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
    { ttl: golfCache.leaderboard.ttl }
  );
}

/**
 * Get team roster with caching
 */
export async function getCachedRoster(teamId: string) {
  return cached(
    golfCache.roster.key(teamId),
    async () => {
      const supabase = await createClient();
      // Get players via team members junction table
      const { data, error } = await supabase
        .from('golf_team_members')
        .select(`
          golf_players (
            id,
            first_name,
            last_name,
            email,
            phone,
            avatar_url,
            handicap,
            status,
            grad_year,
            jersey_number,
            created_at
          )
        `)
        .eq('team_id', teamId);
      if (error) throw error;
      // Flatten the result
      return (data || []).map(m => m.golf_players).filter(Boolean);
    },
    { ttl: golfCache.roster.ttl }
  );
}

/**
 * Get player stats summary with caching
 */
export async function getCachedPlayerStats(playerId: string) {
  return cached(
    golfCache.playerStats.key(playerId),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('golf_rounds')
        .select(`
          id,
          round_date,
          total_score,
          total_putts,
          round_type,
          course:golf_courses(name)
        `)
        .eq('player_id', playerId)
        .eq('status', 'completed')
        .order('round_date', { ascending: false })
        .limit(20);
      if (error) throw error;

      // Calculate aggregates
      if (!data || data.length === 0) {
        return { rounds: [], stats: null };
      }

      const validScores = data.filter((r) => r.total_score != null);
      const stats = {
        totalRounds: data.length,
        avgScore: validScores.length > 0
          ? Math.round(validScores.reduce((acc, r) => acc + (r.total_score || 0), 0) / validScores.length * 10) / 10
          : null,
        avgPutts: validScores.length > 0
          ? Math.round(validScores.reduce((acc, r) => acc + (r.total_putts || 0), 0) / validScores.length * 10) / 10
          : null,
        bestScore: validScores.length > 0
          ? Math.min(...validScores.map((r) => r.total_score || 999))
          : null,
      };

      return { rounds: data, stats };
    },
    { ttl: golfCache.playerStats.ttl }
  );
}

/**
 * Get team events for a month with caching
 */
export async function getCachedTeamEvents(teamId: string, startDate: string, endDate: string) {
  const monthKey = startDate.slice(0, 7); // YYYY-MM
  return cached(
    golfCache.events.key(teamId, monthKey),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('golf_events')
        .select(`
          id,
          title,
          event_type,
          status,
          start_time,
          end_time,
          location,
          description,
          rsvp_confirmed_count,
          rsvp_total_count
        `)
        .eq('team_id', teamId)
        .gte('start_time', startDate)
        .lte('start_time', endDate)
        .order('start_time');
      if (error) throw error;
      return data;
    },
    { ttl: golfCache.events.ttl }
  );
}

/**
 * Get course data with caching
 */
export async function getCachedCourse(courseId: string) {
  return cached(
    golfCache.course.key(courseId),
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('golf_courses')
        .select(`
          *,
          holes:golf_course_holes(*)
        `)
        .eq('id', courseId)
        .single();
      if (error) throw error;
      return data;
    },
    { ttl: golfCache.course.ttl }
  );
}

/**
 * Get team settings with caching
 */
export async function getCachedTeamSettings(teamId: string) {
  return cached(
    golfCache.teamSettings.key(teamId),
    async () => {
      const supabase = await createClient();
      // Use fromUntyped for columns not in generated types (e.g. sg_benchmark_level)
      const { data, error } = await fromUntyped(supabase, 'golf_team_settings')
        .select('*')
        .eq('team_id', teamId)
        .single();
      if (error && error.code !== 'PGRST116') throw error; // Ignore not found
      return data;
    },
    { ttl: golfCache.teamSettings.ttl }
  );
}

// Re-export invalidation helpers
export { invalidateGolf };
