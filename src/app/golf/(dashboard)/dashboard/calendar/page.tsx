import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and class schedule',
};

// Cache calendar for 60 seconds (events change moderately)
export const revalidate = 60;

export default async function GolfCalendarPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // OPTIMIZATION: Query user role, coach, and player in parallel
  const [userRoleResult, coachResult, playerResult] = await Promise.all([
    supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const userRole = userRoleResult.data?.role;
  const isCoach = userRole === 'coach';

  // Get team_id based on role
  let teamId: string | null = null;
  if (coachResult.data?.organization_id) {
    // Coach: get team via organization
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coachResult.data.organization_id)
      .maybeSingle();
    teamId = team?.id || null;
  } else if (playerResult.data?.id) {
    // Player: get team via golf_team_members junction table
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerResult.data.id)
      .maybeSingle();
    teamId = membership?.team_id || null;
  }

  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];

  // OPTIMIZATION: Fetch events, players, and coaches in parallel with optimized selects
  const [
    { data: eventsData },
    { data: teamMembersData },
    { data: coachesData }
  ] = teamId
    ? await Promise.all([
        supabase
          .from('golf_events')
          .select('id, team_id, title, event_type, start_time, end_time, location, description')
          .eq('team_id', teamId)
          .order('start_time', { ascending: true }),
        // Get players via golf_team_members junction table
        supabase
          .from('golf_team_members')
          .select('player:golf_players(id, first_name, last_name, avatar_url)')
          .eq('team_id', teamId),
        // Coaches are linked via organization, not team_id directly
        supabase
          .from('golf_teams')
          .select('organization_id')
          .eq('id', teamId)
          .single()
      ])
    : [{ data: null }, { data: null }, { data: null }];

  // Now fetch coaches if we have the organization_id
  let coachList: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
  if (coachesData?.organization_id) {
    const { data: coaches } = await supabase
      .from('golf_coaches')
      .select('id, full_name, avatar_url')
      .eq('organization_id', coachesData.organization_id)
      .order('full_name', { ascending: true });
    coachList = coaches || [];
  }

  // Extract players from team members join result
  const playersData = teamMembersData?.map((tm: { player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null }) => tm.player).filter((p): p is NonNullable<typeof p> => p !== null) || [];

  // Map golf_events to CalendarEvent format
  // The start_time and end_time columns are ISO datetime strings (timestamptz)
  events = (eventsData || []).map(event => {
    return {
      id: event.id,
      team_id: event.team_id || '', // Convert null to empty string
      title: event.title,
      event_type: event.event_type,
      start_date: event.start_time, // start_time is the datetime column
      end_date: event.end_time || event.start_time, // end_time is the datetime column
      start_time: null, // No separate time field needed, it's in start_time
      end_time: null, // No separate time field needed, it's in end_time
      location: event.location,
      description: event.description,
      requires_rsvp: false, // Not stored in DB, default to false
      rsvp_deadline: null, // Not stored in DB
      max_attendees: null, // Not stored in DB
    };
  });

  // Combine players and coaches for team members display (data already fetched in parallel above)
  if (teamId && (playersData.length > 0 || coachList.length > 0)) {
    teamMembers = [
      // Parse coach full_name into first/last name parts
      ...coachList.map(c => {
        const nameParts = (c.full_name || 'Coach').split(' ');
        return {
          id: c.id,
          first_name: nameParts[0] || 'Coach',
          last_name: nameParts.slice(1).join(' ') || '',
          avatar_url: c.avatar_url || undefined,
        };
      }),
      // Players already have first_name/last_name
      ...playersData.map(p => ({
        id: p.id,
        first_name: p.first_name || 'Player',
        last_name: p.last_name || '',
        avatar_url: p.avatar_url || undefined,
      })),
    ];
  }

  return (
    <div
      className="h-[calc(100vh-64px)] p-6"
      style={{
        background: 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 33%, #FAF5EB 66%, #F5F0E6 100%)',
      }}
    >
      <GolfCalendarWrapper
        initialEvents={events}
        teamMembers={teamMembers}
        isCoach={isCoach}
      />
    </div>
  );
}
