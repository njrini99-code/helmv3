import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and class schedule',
};

// 30s cache: balances freshness vs cold-fetch timeouts (was 0 → 100% P75 30s)
export const revalidate = 30;

export default async function GolfCalendarPage() {
  // React.cache() dedupes getUser() + profile queries — free after layout runs them
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role, coach, player } = session;
  const isCoach = role === 'coach';
  const orgId = coach?.organization_id ?? null;
  const playerId = player?.id ?? null;

  // Supabase client for team/event data lookups only
  const supabase = await createClient();

  let teamId: string | null = null;

  let coachList: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
  try {
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
    coachList = coachListResult.data || [];
  } catch {
    // Network failure — proceed with null teamId and empty coachList
  }

  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];

  // Fetch events (scoped to +/- 3 months), players, and team settings in parallel
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAhead = new Date();
  threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

  let eventsData: { id: string; team_id: string; title: string; event_type: string; start_time: string; end_time: string | null; location: string | null; description: string | null; status: string | null; all_day: boolean | null; created_by: string | null; requires_rsvp: boolean | null; rsvp_deadline: string | null; max_attendees: number | null }[] | null = null;
  let playersData: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[] = [];
  let teamTimezone: string | null = null;

  if (teamId) {
    try {
      const [eventsResult, teamMembersResult, teamSettingsResult] = await Promise.all([
        supabase
          .from('golf_events')
          .select('id, team_id, title, event_type, start_time, end_time, location, description, status, all_day, created_by, requires_rsvp, rsvp_deadline, max_attendees')
          .eq('team_id', teamId)
          .neq('status', 'cancelled')
          .gte('start_time', threeMonthsAgo.toISOString())
          .lte('start_time', threeMonthsAhead.toISOString())
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
      ]);

      eventsData = eventsResult.data;
      playersData = (teamMembersResult.data ?? [])
        .map((tm: { player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null }) => tm.player)
        .filter((p): p is NonNullable<typeof p> => p !== null);
      teamTimezone = teamSettingsResult.data?.timezone || null;
    } catch {
      // Network failure — proceed with empty data
    }
  }

  // Map golf_events to CalendarEvent format
  // The start_time and end_time columns are ISO datetime strings (timestamptz)
  events = (eventsData || []).map(event => {
    let startDate = event.start_time;
    let endDate = event.end_time || event.start_time;

    // For all-day events, normalize dates to prevent timezone shift.
    // All-day dates are stored as date-only strings (e.g. "2026-03-07") which Postgres
    // interprets as midnight UTC. JavaScript new Date() converts to local time, shifting
    // the date backward in western timezones. Strip the timezone to parse as local midnight.
    if (event.all_day) {
      const normalizeAllDayDate = (d: string) => {
        const datePart = d.slice(0, 10); // extract "YYYY-MM-DD"
        return `${datePart}T00:00:00`; // local midnight, no timezone
      };
      startDate = normalizeAllDayDate(startDate);
      endDate = normalizeAllDayDate(endDate);
    }

    return {
      id: event.id,
      team_id: event.team_id || '',
      title: event.title,
      event_type: event.event_type,
      start_date: startDate,
      end_date: endDate,
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

  // Count upcoming events using a stable server timestamp to avoid hydration mismatch
  const serverNow = new Date().toISOString();
  const upcomingEvents = events.filter(e => (e.start_time || e.start_date) >= serverNow).length;

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
        <div className="min-h-full flex flex-col">
          <LargeTitleHeader title="Calendar" />
          {events.length > 0 && (
            <div className="flex-shrink-0 px-4 md:px-6 pb-2">
              <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
                <span className="text-sm font-medium text-warm-600 whitespace-nowrap" suppressHydrationWarning>
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
