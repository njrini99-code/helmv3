'use server';

import { createClient } from '@/lib/supabase/server';

export interface HoleData {
  hole_number: number;
  par: number;
  yardage: number;
}

export interface RecentCourse {
  course_name: string;
  tees_played: string;
  total_par: number;
  total_yardage: number;
  last_played: string;
}

/**
 * Get recently played courses for current user
 */
export async function getRecentCourses(): Promise<RecentCourse[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  // Get player first
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return [];
  }

  // Get unique course/tee combinations from user's rounds
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('course_name, tees_played, round_date')
    .eq('player_id', player.id)
    .order('round_date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching recent courses:', error);
    return [];
  }

  // Get unique combinations
  const uniqueCourses = new Map<string, RecentCourse>();

  for (const round of data || []) {
    const key = `${round.course_name}-${round.tees_played}`;
    if (!uniqueCourses.has(key)) {
      uniqueCourses.set(key, {
        course_name: round.course_name,
        tees_played: round.tees_played || 'Unknown Tees',
        total_par: 72, // Will be calculated from golf_holes when loaded
        total_yardage: 0, // Will be calculated from golf_holes when loaded
        last_played: round.round_date
      });
    }
  }

  return Array.from(uniqueCourses.values()).slice(0, 3);
}

/**
 * Get course data from a previous round
 */
export async function getCourseFromRound(courseName: string, teesPlayed: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get player first
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    throw new Error('Player not found');
  }

  // Find most recent round with this course/tee combination
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('*, golf_holes(*)')
    .eq('player_id', player.id)
    .eq('course_name', courseName)
    .eq('tees_played', teesPlayed)
    .order('round_date', { ascending: false })
    .limit(1)
    .single();

  if (roundError) {
    console.error('Error fetching round:', roundError);
    throw roundError;
  }

  return round;
}

// Sample courses removed - users must create their own courses through the round setup flow
