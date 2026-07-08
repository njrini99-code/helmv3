import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { CalendarFairway } from '@/components/baseball/calendar/CalendarFairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and game schedule',
};

export const revalidate = 60;

/**
 * Display-only default for a missing `end_time` — mirrors the drag-reschedule
 * fallback in PremiumCalendarClient ("Fallback: 1 hour duration"). NEVER
 * written back to the DB; `event.end_time` on the mapped CalendarEvent stays
 * the raw (possibly null) column value.
 */
function defaultEndTime(startIso: string): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return startIso;
  return new Date(start.getTime() + 60 * 60 * 1000).toISOString();
}

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
    // Bounded window — 90 days back / 365 days forward — so a long-lived team
    // doesn't drag its entire event history into every calendar render (no
    // limit/window previously meant this query grew unbounded forever).
    // Practices/games far outside this range are pagination's job, not a
    // single dashboard page's.
    const eventsWindowStart = new Date();
    eventsWindowStart.setDate(eventsWindowStart.getDate() - 90);
    const eventsWindowEnd = new Date();
    eventsWindowEnd.setDate(eventsWindowEnd.getDate() + 365);

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
        .gte('start_time', eventsWindowStart.toISOString())
        .lte('start_time', eventsWindowEnd.toISOString())
        .order('start_time', { ascending: true })
        .limit(500),
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
      // NULL end_time previously collapsed to `event.start_time`, producing a
      // zero-duration timed event (invisible/unclickable in the hour grid).
      // Default to start + 1h for display only — `end_time` on the returned
      // CalendarEvent below stays the raw (possibly null) value.
      const endDate = event.all_day
        ? normalizeAllDay(event.end_time || event.start_time)
        : event.end_time || defaultEndTime(event.start_time);
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
  //
  // "Upcoming" = start time at or after local midnight TODAY (not the exact
  // `now` instant) — an event scheduled earlier today still counts as
  // upcoming for the rest of the day, and the boundary can't drift mid-render
  // between the two numbers below.
  //
  // Both the headline count and the per-type badges are derived from the SAME
  // filtered list. Previously `upcomingEvents` filtered by date while
  // `eventTypeCounts` summed EVERY event this team has ever had (no date
  // filter at all) — on a team with only past/demo events that showed the
  // contradictory "0 upcoming events · 1 Practice · 1 Meeting · 1 Game" (the
  // badges counting events the headline had already excluded). Single source
  // of truth below so the two numbers can never disagree again.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingEventsList = events.filter(
    (e) => new Date(e.start_time || e.start_date) >= startOfToday
  );
  const upcomingEvents = upcomingEventsList.length;
  const eventTypeCounts = upcomingEventsList.reduce<Record<string, number>>((acc, e) => {
    const t = e.event_type || 'other';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // ── College coach with no team: recruiting-focused empty state ─────────────

  if (isCollegeCoach && !teamId) {
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
