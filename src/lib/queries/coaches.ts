import { createClient } from '@/lib/supabase/server';

/**
 * Get a coach's full profile with organization
 */
export async function getCoachProfile(coachId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('coaches')
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
    .from('teams')
    .select(
      `
      *,
      organization:organizations(*),
      members:team_members(count)
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
    .from('team_coach_staff')
    .select(
      `
      *,
      team:teams(
        *,
        organization:organizations(*),
        members:team_members(count)
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
 * Get a coach's calendar events
 */
export async function getCoachCalendarEvents(
  coachId: string,
  startDate?: string,
  endDate?: string
) {
  const supabase = await createClient();

  let query = supabase
    .from('coach_calendar_events')
    .select('*')
    .eq('coach_id', coachId);

  if (startDate) {
    query = query.gte('start_time', startDate);
  }
  if (endDate) {
    query = query.lte('start_time', endDate);
  }

  query = query.order('start_time', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching coach calendar events:', error);
    throw error;
  }

  return data;
}

/**
 * Get a coach's camps
 */
export async function getCoachCamps(coachId: string, status?: string) {
  const supabase = await createClient();

  let query = supabase
    .from('camps')
    .select(
      `
      *,
      organization:organizations(*),
      registrations:camp_registrations(count)
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
  updates: Record<string, any>
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('coaches')
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
