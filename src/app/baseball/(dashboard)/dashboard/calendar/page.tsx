import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BaseballCalendarWrapper } from '@/components/baseball/calendar/BaseballCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and game schedule',
};

export default async function BaseballCalendarPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

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
    // Get coach and their team
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .single();

      teamId = team?.id || null;
    }
  } else {
    // Get player's team
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('player_id', user.id)
      .single();

    teamId = teamMember?.team_id || null;
  }

  if (teamId) {
    // Fetch events from events table
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .eq('team_id', teamId)
      .order('start_time', { ascending: true });

    // Map events to CalendarEvent format
    events = (eventsData || []).map(event => ({
      id: event.id,
      team_id: event.team_id || '',
      title: event.name,
      event_type: event.event_type || 'other',
      start_date: event.start_time,
      end_date: event.end_time || event.start_time,
      start_time: event.start_time,
      end_time: event.end_time || event.start_time,
      location: event.location_venue || undefined,
      description: event.description || undefined,
    }));

    // Fetch team members (players on this team)
    const { data: playersData } = await supabase
      .from('team_members')
      .select(`
        player_id,
        players:player_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('team_id', teamId);

    // Get organization_id for coaches
    const { data: teamData } = await supabase
      .from('teams')
      .select('organization_id')
      .eq('id', teamId)
      .single();

    // Also fetch coaches on this team (coaches use full_name, not first_name/last_name)
    const { data: coachesData } = teamData?.organization_id
      ? await supabase
          .from('coaches')
          .select('id, full_name, avatar_url')
          .eq('organization_id', teamData.organization_id)
      : { data: [] };

    // Combine players and coaches for team members display
    teamMembers = [
      // Coaches - parse full_name into first/last
      ...(coachesData || []).map(c => {
        const nameParts = (c.full_name || 'Coach').split(' ');
        return {
          id: c.id,
          first_name: nameParts[0] || 'Coach',
          last_name: nameParts.slice(1).join(' ') || '',
          avatar_url: c.avatar_url || undefined,
        };
      }),
      // Players
      ...(playersData || [])
        .filter(p => p.players)
        .map(p => {
          const player = p.players as { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null };
          return {
            id: player.id,
            first_name: player.first_name || 'Player',
            last_name: player.last_name || '',
            avatar_url: player.avatar_url || undefined,
          };
        }),
    ];
  }

  return (
    <div
      className="h-[calc(100vh-64px)] p-6"
      style={{
        background: 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 33%, #FAF5EB 66%, #F5F0E6 100%)',
      }}
    >
      <BaseballCalendarWrapper
        initialEvents={events}
        teamMembers={teamMembers}
        isCoach={isCoach}
      />
    </div>
  );
}
