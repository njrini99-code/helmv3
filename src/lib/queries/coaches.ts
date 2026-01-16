import { createClient } from '@/lib/supabase/server';

/**
 * Get a coach's full profile with organization
 */
export async function getCoachProfile(coachId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('baseball_coaches')
    .select(
      `
      *,
      user:users(*),
      organization:organizations(*)
    `
    )
    .eq('id', coachId)
    .single();

  if (error) {
    console.error('Error fetching coach profile:', error);
    throw error;
  }

  return data;
}

/**
 * Get a coach's teams (for HS/JUCO/Showcase coaches)
 */
export async function getCoachTeams(coachId: string) {
  const supabase = await createClient();

  // Get teams where coach is head coach
  const { data: headCoachTeams, error: headCoachError } = await supabase
    .from('baseball_teams')
    .select(
      `
      *,
      organization:organizations(*),
      members:baseball_team_members(count)
    `
    )
    .eq('head_coach_id', coachId)
    .order('created_at', { ascending: false });

  if (headCoachError) {
    console.error('Error fetching head coach teams:', headCoachError);
    throw headCoachError;
  }

  // Get teams where coach is staff
  const { data: staffTeams, error: staffError } = await supabase
    .from('baseball_team_coach_staff')
    .select(
      `
      *,
      team:baseball_teams(
        *,
        organization:organizations(*),
        members:baseball_team_members(count)
      )
    `
    )
    .eq('coach_id', coachId)
    .order('joined_at', { ascending: false});

  if (staffError) {
    console.error('Error fetching staff teams:', staffError);
    throw staffError;
  }

  return {
    headCoachTeams: headCoachTeams || [],
    staffTeams: staffTeams || [],
  };
}

/**
 * Get a coach's camps
 */
export async function getCoachCamps(coachId: string, status?: string) {
  const supabase = await createClient();

  let query = supabase
    .from('baseball_camps')
    .select(
      `
      *,
      organization:organizations(*),
      registrations:baseball_camp_registrations(count)
    `
    )
    .eq('coach_id', coachId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query.order('start_date', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching coach camps:', error);
    throw error;
  }

  return data;
}

/**
 * Update coach profile
 */
export async function updateCoachProfile(
  coachId: string,
  updates: Record<string, unknown>
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('baseball_coaches')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', coachId)
    .select()
    .single();

  if (error) {
    console.error('Error updating coach profile:', error);
    throw error;
  }

  return data;
}
