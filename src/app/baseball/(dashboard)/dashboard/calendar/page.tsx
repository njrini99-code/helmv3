import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { BaseballCalendarWrapper } from '@/components/baseball/calendar/BaseballCalendarWrapper';
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
    const { data: teamMember } = await supabase
      .from('baseball_team_members')
      .select('team_id')
      .eq('player_id', session.userId)
      .maybeSingle();
    teamId = teamMember?.team_id || null;
  }

  // ── Fetch events + roster ───────────────────────────────────────────────────

  if (teamId) {
    const [eventsResult, membersResult, teamOrgResult] = await Promise.all([
      supabase
        .from('baseball_events')
        .select('id, team_id, title, event_type, start_time, end_time, location, description, is_mandatory, max_attendees, rsvp_deadline, created_by')
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

    // Map baseball_events → CalendarEvent
    events = (eventsResult.data || []).map((event) => ({
      id: event.id,
      team_id: event.team_id || '',
      title: event.title,
      event_type: event.event_type || 'other',
      start_date: event.start_time,
      end_date: event.end_time || event.start_time,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location || undefined,
      description: event.description || undefined,
      is_mandatory: event.is_mandatory ?? false,
      max_attendees: event.max_attendees,
      rsvp_deadline: event.rsvp_deadline,
      created_by: event.created_by,
      requires_rsvp: false,
    }));

    // Coaches on this team
    const orgId = teamOrgResult.data?.organization_id;
    const coachesResult = orgId
      ? await supabase
          .from('baseball_coaches')
          .select('id, full_name, avatar_url')
          .eq('organization_id', orgId)
          .limit(20)
      : { data: [] };

    teamMembers = [
      // Parse coach full_name → first/last
      ...(coachesResult.data || []).map((c) => {
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

  return (
    <div
      className="h-[calc(100vh-64px-5.5rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-64px)] flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 33%, #FAF5EB 66%, #F5F0E6 100%)',
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

      {/* Calendar */}
      <div className="flex-1 p-4 md:p-6 pt-2 md:pt-2 min-h-0">
        <BaseballCalendarWrapper
          initialEvents={events}
          teamMembers={teamMembers}
          isCoach={isCoach}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
