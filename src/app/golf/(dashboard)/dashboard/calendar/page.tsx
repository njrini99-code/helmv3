import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and class schedule',
};

export default async function GolfCalendarPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userData?.role;
  const isCoach = userRole === 'coach';

  let teamId: string | null = null;
  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];

  if (isCoach) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = coach?.team_id || null;
  } else {
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = player?.team_id || null;
  }

  // Fetch events from golf_events table
  // Include both team events (if user has a team) and personal events (team_id = null)
  let eventsQuery = supabase
    .from('golf_events')
    .select('*')
    .order('start_date', { ascending: true });

  if (teamId) {
    // User has a team: fetch team events OR personal events
    eventsQuery = eventsQuery.or(`team_id.eq.${teamId},team_id.is.null`);
  } else {
    // User has no team: fetch only personal events
    eventsQuery = eventsQuery.is('team_id', null);
  }

  const { data: eventsData } = await eventsQuery;

  // Map golf_events to CalendarEvent format
  // Combine date and time fields into datetime strings for proper calendar positioning
  events = (eventsData || []).map(event => {
    // Combine date and time for start
    const startDateTime = event.start_time
      ? `${event.start_date}T${event.start_time}`
      : event.start_date;

    // Combine date and time for end (use start_date if end_date is null)
    const endDateTime = event.end_time
      ? `${event.end_date || event.start_date}T${event.end_time}`
      : event.end_date || event.start_date;

    return {
      id: event.id,
      team_id: event.team_id || '', // Convert null to empty string
      title: event.title,
      event_type: event.event_type,
      start_date: startDateTime,
      end_date: endDateTime,
      location: event.location,
      description: event.description,
    };
  });

  // Fetch team members for avatar sidebar (only if user has a team)
  if (teamId) {
    const { data: playersData } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .eq('team_id', teamId)
      .order('first_name', { ascending: true });

    // Also fetch coaches on this team for the sidebar
    // Note: golf_coaches uses full_name instead of first_name/last_name
    const { data: coachesData } = await supabase
      .from('golf_coaches')
      .select('id, full_name, avatar_url')
      .eq('team_id', teamId);

    // Combine players and coaches for team members display
    teamMembers = [
      // Parse coach full_name into first/last name parts
      ...(coachesData || []).map(c => {
        const nameParts = (c.full_name || 'Coach').split(' ');
        return {
          id: c.id,
          first_name: nameParts[0] || 'Coach',
          last_name: nameParts.slice(1).join(' ') || '',
          avatar_url: c.avatar_url || undefined,
        };
      }),
      // Players already have first_name/last_name
      ...(playersData || []).map(p => ({
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
