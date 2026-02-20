import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
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

  // Role + profiles in parallel (all need user.id)
  const [userRoleResult, coachResult, playerResult] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    supabase.from('golf_coaches').select('id, organization_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('golf_players').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  const isCoach = userRoleResult.data?.role === 'coach';

  // Get team_id + coaches in parallel (both depend on role result, but not each other)
  let teamId: string | null = null;
  const orgId = coachResult.data?.organization_id;
  const playerId = playerResult.data?.id;

  const [coachTeamResult, playerTeamResult, coachListResult] = await Promise.all([
    orgId
      ? supabase.from('golf_teams').select('id').eq('organization_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    playerId
      ? supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()
      : Promise.resolve({ data: null }),
    orgId
      ? supabase.from('golf_coaches').select('id, full_name, avatar_url').eq('organization_id', orgId).order('full_name', { ascending: true }).limit(20)
      : Promise.resolve({ data: null }),
  ]);

  teamId = coachTeamResult.data?.id || playerTeamResult.data?.team_id || null;
  const coachList = coachListResult.data || [];

  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];

  // Fetch events, players, and team settings in parallel
  const [
    { data: eventsData },
    { data: teamMembersData },
    { data: teamSettingsData },
  ] = teamId
    ? await Promise.all([
        supabase
          .from('golf_events')
          .select('id, team_id, title, event_type, start_time, end_time, location, description, status, all_day, created_by, requires_rsvp, rsvp_deadline, max_attendees')
          .eq('team_id', teamId)
          .neq('status', 'cancelled')
          .order('start_time', { ascending: true })
          .limit(500),
        // Get players via golf_team_members junction table
        supabase
          .from('golf_team_members')
          .select('player:golf_players(id, first_name, last_name, avatar_url)')
          .eq('team_id', teamId)
          .limit(100),
        // Get team timezone
        supabase
          .from('golf_team_settings')
          .select('timezone')
          .eq('team_id', teamId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const teamTimezone = teamSettingsData?.timezone || null;

  // Extract players from team members join result
  const playersData = teamMembersData?.map((tm: { player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null }) => tm.player).filter((p): p is NonNullable<typeof p> => p !== null) || [];

  // Map golf_events to CalendarEvent format
  // The start_time and end_time columns are ISO datetime strings (timestamptz)
  events = (eventsData || []).map(event => {
    return {
      id: event.id,
      team_id: event.team_id || '',
      title: event.title,
      event_type: event.event_type,
      start_date: event.start_time, // start_time is the datetime column
      end_date: event.end_time || event.start_time,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      description: event.description,
      status: event.status ?? undefined,
      all_day: event.all_day ?? undefined,
      created_by: event.created_by,
      requires_rsvp: event.requires_rsvp ?? false,
      rsvp_deadline: event.rsvp_deadline,
      max_attendees: event.max_attendees,
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

  // Calculate event type summary for the header
  const eventTypeCounts = events.reduce((acc, event) => {
    const type = event.event_type || 'other';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const upcomingEvents = events.filter(e => new Date(e.start_time || e.start_date) >= new Date()).length;

  const eventTypeConfig: Record<string, { label: string; dot: string }> = {
    practice: { label: 'Practice', dot: 'bg-primary-500' },
    tournament: { label: 'Tournament', dot: 'bg-blue-500' },
    qualifying: { label: 'Qualifying', dot: 'bg-purple-500' },
    meeting: { label: 'Meeting', dot: 'bg-amber-500' },
    travel: { label: 'Travel', dot: 'bg-warm-500' },
    other: { label: 'Other', dot: 'bg-warm-400' },
  };

  return (
    <AnimatedPage>
      <AnimatedItem>
        <div
          className="h-[calc(100dvh-64px-5.5rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-64px)] flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 33%, #FAF5EB 66%, #F5F0E6 100%)',
          }}
        >
          {/* Event Summary Strip */}
          {events.length > 0 && (
            <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-2">
              <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
                <span className="text-sm font-medium text-warm-600 whitespace-nowrap">
                  {upcomingEvents} upcoming event{upcomingEvents !== 1 ? 's' : ''}
                </span>
                <span className="text-warm-300">|</span>
                {Object.entries(eventTypeCounts).map(([type, count]) => {
                  const fallback = { label: type, dot: 'bg-warm-400' };
                  const config = eventTypeConfig[type] ?? fallback;
                  return (
                    <span key={type} className="flex items-center gap-1.5 text-xs text-warm-600 whitespace-nowrap">
                      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                      {count} {config.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1 p-4 md:p-6 pt-2 md:pt-2 min-h-0">
            <GolfCalendarWrapper
              initialEvents={events}
              teamMembers={teamMembers}
              isCoach={isCoach}
              teamTimezone={teamTimezone}
            />
          </div>
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
