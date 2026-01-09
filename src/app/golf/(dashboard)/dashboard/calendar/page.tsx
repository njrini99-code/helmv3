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
      .select('id, team_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('golf_players')
      .select('id, team_id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const userRole = userRoleResult.data?.role;
  const isCoach = userRole === 'coach';
  const teamId = coachResult.data?.team_id || playerResult.data?.team_id || null;

  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];

  // OPTIMIZATION: Fetch events, players, and coaches in parallel with optimized selects
  const [
    { data: eventsData },
    { data: playersData },
    { data: coachesData }
  ] = teamId
    ? await Promise.all([
        supabase
          .from('golf_events')
          .select('id, team_id, title, event_type, start_date, end_date, start_time, end_time, location, description, requires_rsvp, rsvp_deadline, max_attendees')
          .eq('team_id', teamId)
          .order('start_date', { ascending: true }),
        supabase
          .from('golf_players')
          .select('id, first_name, last_name, avatar_url')
          .eq('team_id', teamId)
          .order('first_name', { ascending: true }),
        supabase
          .from('golf_coaches')
          .select('id, full_name, avatar_url')
          .eq('team_id', teamId)
          .order('full_name', { ascending: true })
      ])
    : [{ data: null }, { data: null }, { data: null }];

  // Map golf_events to CalendarEvent format
  // Combine date and time fields into datetime strings for proper calendar positioning
  events = (eventsData || []).map(event => {

    // CRITICAL FIX: Extract just the date portion from start_date
    // Supabase returns timestamptz as full ISO string like "2026-01-21T00:00:00+00:00"
    // We need just "2026-01-21" to combine with the time
    const startDateOnly = typeof event.start_date === 'string' 
      ? event.start_date.split('T')[0] 
      : event.start_date;
    const endDateOnly = event.end_date && typeof event.end_date === 'string'
      ? event.end_date.split('T')[0]
      : event.end_date;

    // Combine date and time for start
    const startDateTime = event.start_time
      ? `${startDateOnly}T${event.start_time}`
      : event.start_date;

    // Combine date and time for end
    // For recurring events (classes), end_date represents semester end, not the event end time
    // So we use start_date with end_time to get the correct event duration
    const endDateTime = event.end_time
      ? `${startDateOnly}T${event.end_time}`
      : endDateOnly || event.start_date;

    return {
      id: event.id,
      team_id: event.team_id || '', // Convert null to empty string
      title: event.title,
      event_type: event.event_type,
      start_date: startDateTime,
      end_date: endDateTime,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      description: event.description,
      requires_rsvp: event.requires_rsvp ?? false,
      rsvp_deadline: event.rsvp_deadline ?? null,
      max_attendees: event.max_attendees ?? null,
    };
  });

  // Combine players and coaches for team members display (data already fetched in parallel above)
  if (teamId && (playersData || coachesData)) {
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
