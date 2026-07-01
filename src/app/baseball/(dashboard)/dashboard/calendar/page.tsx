import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BaseballCalendarWrapper } from '@/components/baseball/calendar/BaseballCalendarWrapper';
import { CalendarFairway } from '@/components/baseball/calendar/CalendarFairway';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and game schedule',
};

export const revalidate = 60;

const EVENT_TYPE_CONFIG: Record<string, { label: string; dot: string }> = {
  game:     { label: 'Game',     dot: 'bg-blue-500' },
  practice: { label: 'Practice', dot: 'bg-primary-500' },
  camp:     { label: 'Camp',     dot: 'bg-purple-500' },
  tryout:   { label: 'Tryout',   dot: 'bg-amber-500' },
  meeting:  { label: 'Meeting',  dot: 'bg-warm-500' },
  travel:   { label: 'Travel',   dot: 'bg-sky-500' },
  other:    { label: 'Other',    dot: 'bg-warm-400' },
};

export default async function BaseballCalendarPage() {
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const isCoach = session.role === 'coach';

  let teamId: string | null = null;
  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];
  let currentUserId: string | undefined;

  // ── Resolve team ────────────────────────────────────────────────────────────

  const isCollegeCoach = isCoach && session.coach?.coach_type === 'college';

  if (isCoach && session.coach?.organization_id) {
    const [teamResult, coachResult] = await Promise.all([
      supabase
        .from('baseball_teams')
        .select('id')
        .eq('organization_id', session.coach.organization_id)
        .maybeSingle(),
      supabase
        .from('baseball_coaches')
        .select('id')
        .eq('user_id', session.userId)
        .maybeSingle(),
    ]);
    teamId = teamResult.data?.id || null;
    currentUserId = coachResult.data?.id;
  } else if (!isCoach) {
    const playerId = session.player?.id;
    if (playerId) {
      const { data: teamMember } = await supabase
        .from('baseball_team_members')
        .select('team_id')
        .eq('player_id', playerId)
        .maybeSingle();
      teamId = teamMember?.team_id || null;
    }
  }

  // ── Fetch events + roster ───────────────────────────────────────────────────

  if (teamId) {
    const [eventsResult, membersResult, teamOrgResult] = await Promise.all([
      // Read via fromUntyped so the select is not type-checked against the
      // generated baseball_events types (which drift from the live schema).
      //
      // IMPORTANT: the column list MUST match the live baseball_events schema.
      // A previous revision selected `requires_rsvp`, which does NOT exist on
      // baseball_events — PostgREST rejected the whole query, so `.data` came
      // back null and the calendar rendered EMPTY even with seeded events.
      // `all_day` / `status` / `recurring` DO exist and are needed so the grid
      // places all-day events correctly and dims cancelled ones.
      fromUntyped(supabase, 'baseball_events')
        .select('id, team_id, title, event_type, start_time, end_time, location, description, is_mandatory, max_attendees, rsvp_deadline, all_day, status, recurring, created_by')
        .eq('team_id', teamId)
        .order('start_time', { ascending: true }),
      supabase
        .from('baseball_team_members')
        .select('player_id, baseball_players!inner(id, first_name, last_name, avatar_url)')
        .eq('team_id', teamId)
        .limit(100),
      supabase
        .from('baseball_teams')
        .select('organization_id')
        .eq('id', teamId)
        .maybeSingle(),
    ]);

    // Map baseball_events → CalendarEvent. Row is annotated because the query
    // uses fromUntyped (the generated types drift from the live schema).
    // All-day events are normalized to local midnight so the week/day grid
    // places them in the all-day rail rather than at a UTC-shifted hour.
    events = (eventsResult.data || []).map((event: {
      id: string;
      team_id: string | null;
      title: string;
      event_type: string | null;
      start_time: string;
      end_time: string | null;
      location: string | null;
      description: string | null;
      is_mandatory: boolean | null;
      max_attendees: number | null;
      rsvp_deadline: string | null;
      all_day: boolean | null;
      status: string | null;
      recurring: boolean | null;
      created_by: string | null;
    }) => {
      const normalizeAllDay = (d: string) => `${d.slice(0, 10)}T00:00:00`;
      const startDate = event.all_day ? normalizeAllDay(event.start_time) : event.start_time;
      const endDate = event.all_day
        ? normalizeAllDay(event.end_time || event.start_time)
        : event.end_time || event.start_time;
      return {
        id: event.id,
        team_id: event.team_id || '',
        title: event.title,
        event_type: event.event_type || 'other',
        start_date: startDate,
        end_date: endDate,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location || undefined,
        description: event.description || undefined,
        is_mandatory: event.is_mandatory ?? false,
        max_attendees: event.max_attendees,
        rsvp_deadline: event.rsvp_deadline,
        all_day: event.all_day ?? false,
        status: event.status ?? undefined,
        recurring: event.recurring ?? false,
        created_by: event.created_by,
        // baseball_events has no requires_rsvp column; RSVP is not modeled here.
        requires_rsvp: false,
      };
    });

    // Coaches on this team. Read non-PII identity from the baseball_coaches_public
    // view (not the base table) so this player-reachable roster panel keeps
    // listing coaches after baseball_coaches RLS is narrowed away from blanket
    // read — a player is not a teammate of every org coach on the base table.
    const orgId = teamOrgResult.data?.organization_id;
    const coachesResult = orgId
      ? await supabase
          .from('baseball_coaches_public')
          .select('id, full_name, avatar_url')
          .eq('organization_id', orgId)
          .limit(20)
      : { data: [] };

    teamMembers = [
      // Parse coach full_name → first/last
      ...(coachesResult.data || [])
        .filter((c): c is typeof c & { id: string } => Boolean(c.id))
        .map((c) => {
        const parts = (c.full_name || 'Coach').split(' ');
        return {
          id: c.id,
          first_name: parts[0] || 'Coach',
          last_name: parts.slice(1).join(' ') || '',
          avatar_url: c.avatar_url || undefined,
        };
      }),
      // Players
      ...(membersResult.data || [])
        .filter((m) => m.baseball_players)
        .map((m) => {
          const p = m.baseball_players as { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null };
          return {
            id: p.id,
            first_name: p.first_name || 'Player',
            last_name: p.last_name || '',
            avatar_url: p.avatar_url || undefined,
          };
        }),
    ];
  }

  // ── Event summary strip ─────────────────────────────────────────────────────

  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.start_time || e.start_date) >= now).length;
  const eventTypeCounts = events.reduce<Record<string, number>>((acc, e) => {
    const t = e.event_type || 'other';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // ── College coach with no team: recruiting-focused empty state ─────────────

  if (isCollegeCoach && !teamId) {
    if (isRedesignEnabled()) {
      return (
        <CalendarFairway
          recruitingEmpty
          events={events}
          teamMembers={teamMembers}
          teamId={teamId}
          isCoach={isCoach}
          currentUserId={currentUserId}
          upcomingEvents={upcomingEvents}
          eventTypeCounts={eventTypeCounts}
        />
      );
    }
    return (
      <div
        className="h-[calc(100vh-5.5rem-env(safe-area-inset-bottom))] md:h-screen flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #F7F5F2 0%, #F4EFE6 33%, #F1ECE0 66%, #ECE5D6 100%)',
        }}
      >
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            {/* Calendar icon */}
            <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-warm-900 mb-2">
              Your recruiting calendar is empty
            </h2>
            <p className="text-sm text-warm-500 mb-8 leading-relaxed">
              Camp visits and official visit windows will appear here as you schedule recruiting activity.
            </p>

            {/* CTA */}
            <Link
              href="/baseball/dashboard/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              Browse Prospects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isRedesignEnabled()) {
    return (
      <CalendarFairway
        recruitingEmpty={false}
        events={events}
        teamMembers={teamMembers}
        teamId={teamId}
        isCoach={isCoach}
        currentUserId={currentUserId}
        upcomingEvents={upcomingEvents}
        eventTypeCounts={eventTypeCounts}
      />
    );
  }

  return (
    <div
      className="h-[calc(100vh-5.5rem-env(safe-area-inset-bottom))] md:h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #F7F5F2 0%, #F4EFE6 33%, #F1ECE0 66%, #ECE5D6 100%)',
      }}
    >
      {/* Event summary strip — only shown when there are events */}
      {events.length > 0 && (
        <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-2">
          <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
            <span className="text-sm font-medium text-warm-600 whitespace-nowrap">
              {upcomingEvents} upcoming event{upcomingEvents !== 1 ? 's' : ''}
            </span>
            <span className="text-warm-300">|</span>
            {Object.entries(eventTypeCounts).map(([type, count]) => {
              const cfg = EVENT_TYPE_CONFIG[type] ?? { label: type, dot: 'bg-warm-400' };
              return (
                <span key={type} className="flex items-center gap-1.5 text-xs text-warm-600 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {count} {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar — overflow-hidden is required so PremiumCalendarClient's h-full resolves correctly.
          Golf's main is overflow-y-auto (which anchors heights); baseball's is not, so we add it here. */}
      <div className="flex-1 p-4 md:p-6 pt-2 md:pt-2 min-h-0 overflow-hidden">
        <BaseballCalendarWrapper
          initialEvents={events}
          teamMembers={teamMembers}
          teamId={teamId}
          isCoach={isCoach}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
