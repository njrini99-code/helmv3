import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { FairwayCalendarSkeleton } from '@/components/fairway/pages/calendar/FairwayCalendarSkeleton';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import type { Metadata } from 'next';
import { logServerError, logServerException } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { attributeClassEvents, type ClassOwnerIndex } from '@/lib/calendar/class-events';
import { splitDisplayName } from '@/lib/types/calendar';

// Code-split the Fairway calendar surface — it's the ONLY tree the route
// renders, so this next/dynamic keeps its chunk loaded only when actually
// rendered rather than bundled into the route's initial JS.
const FairwayCalendar = dynamic(
  () =>
    import('@/components/fairway/pages/calendar/FairwayCalendar').then((m) => m.FairwayCalendar),
  // P235: the Fairway chunk's own loading fallback must mirror the agenda-default
  // Fairway first paint (token-true).
  { loading: () => <FairwayCalendarSkeleton /> },
);

export const metadata: Metadata = {
  title: 'Calendar | Helm Sports',
  description: 'View and manage your team events, practices, and class schedule',
};

// 30s cache: balances freshness vs cold-fetch timeouts (was 0 → 100% P75 30s)
export const revalidate = 30;

interface GolfCalendarPageProps {
  /**
   * `?event=<id>` — the Travel→Calendar cross-link (FairwayTripDetail's "Linked
   * calendar event" chip) deep-links here so the specific event's detail
   * drawer auto-opens instead of landing on the general calendar hub.
   */
  searchParams: Promise<{ event?: string }>;
}

export default async function GolfCalendarPage({ searchParams }: GolfCalendarPageProps) {
  const { event: initialEventId } = await searchParams;
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
  /** DB error from the membership read — checked after the try/catch, not inside it. */
  let playerTeamError: { message?: string; code?: string } | null = null;
  try {
    const [coachTeamId, playerTeamResult, coachListResult] = await Promise.all([
      orgId
        ? resolveCoachTeamIdWithCookie(supabase, orgId, coach?.id ?? null)
        : Promise.resolve(null),
      // `.eq('status','active')` matches what the DASHBOARD LAYOUT already
      // filters on. The two disagreed: the layout resolved "my team" from
      // active memberships only, this page from any membership. That asymmetry
      // is what would let the shell print the right team name in the header
      // while the body underneath rendered an empty season — the worst possible
      // presentation of the failure.
      //
      // It also removes the maybeSingle cardinality hazard: without the filter,
      // a transferred player holding an old inactive row plus a new active one
      // matches two rows, and maybeSingle synthesises PGRST116 client-side.
      // (Not firing today — all 69 membership rows are active — but the same
      // swallow on the same table was already a live bug in the join flow.)
      playerId
        ? supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).eq('status', 'active').maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      orgId
        ? supabase.from('golf_coaches').select('id, full_name, avatar_url').eq('organization_id', orgId).order('full_name', { ascending: true }).limit(20)
        : Promise.resolve({ data: null }),
    ]);

    // Captured, not swallowed — checked immediately after this block. It cannot
    // be checked in here, because the catch below would swallow its own throw
    // and log the failure twice.
    playerTeamError = playerTeamResult.error ?? null;

    teamId = coachTeamId || playerTeamResult.data?.team_id || null;
    coachList = coachListResult.data || [];
  } catch (error) {
    void logServerException(error, { action: 'calendar-load', route: '/golf/dashboard/calendar', source: 'server_component', sport: 'golf' }, 'warning');
    // Catches the NETWORK-layer exceptions supabase-js does throw (fetch
    // failure, aborted request) and anything resolveCoachTeamIdWithCookie
    // raises. It does NOT catch database errors — see below.
    throw new Error('Failed to load your team for the calendar. Please try again.');
  }

  // The `error` is READ.
  //
  // The try/catch above was written to guard exactly this failure — its own
  // comment said rendering an empty calendar "is indistinguishable from 'my
  // season got wiped'" — but it was dead for the channel it guarded:
  // supabase-js does not REJECT on a database error, it RESOLVES with
  // `{ data: null, error }`. So a statement timeout, pool exhaustion or a
  // PostgREST 5xx fell straight past the catch, teamId became null, the entire
  // events block was skipped, and the player got a silent empty calendar —
  // precisely the outcome that comment exists to prevent. `revalidate = 30`
  // then cached the empty render for 30 seconds, so the swallow actively
  // prolonged the bad state.
  //
  // The same file already gets this right for the events fetch further down
  // (`if (eventsResult.error) throw`). This is that pattern applied to the read
  // which gates it.
  if (playerTeamError) {
    void logServerException(playerTeamError, { action: 'calendar-load', route: '/golf/dashboard/calendar', source: 'server_component', sport: 'golf' }, 'warning');
    throw new Error('Failed to load your team for the calendar. Please try again.');
  }

  let events: CalendarEvent[] = [];
  let teamMembers: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
    /** Which side of the merge below this row came from. Optional so existing
     *  consumers are unaffected; surfaces that mean *players* filter on it. */
    role?: 'coach' | 'player';
  }[] = [];

  // Fetch events (scoped to +/- 3 months), players, and team settings in parallel
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAhead = new Date();
  threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

  let eventsData: { id: string; team_id: string; title: string; event_type: string; start_time: string; end_time: string | null; location: string | null; description: string | null; status: string | null; all_day: boolean | null; created_by: string | null; requires_rsvp: boolean | null; rsvp_deadline: string | null; max_attendees: number | null; parent_event_id: string | null; recurrence_rule: string | null }[] | null = null;
  let playersData: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[] = [];
  let teamTimezone: string | null = null;
  // Class id → owning player. Class meetings live on the team calendar with no
  // owner column, so this index is what lets the "All" lens say whose class a
  // block is. `classOwnersResolved` distinguishes "nobody owns classes" from
  // "the lookup failed" — see attributeClassEvents.
  let classOwners: ClassOwnerIndex = {};
  let classOwnersResolved = false;

  if (teamId) {
    // NOTE: cancelled events are INCLUDED on purpose — they render distinctly
    // (strike/badge) instead of silently disappearing (soft-cancel lifecycle).
    // parent_event_id + recurrence_rule are REQUIRED end-to-end: without them
    // series members render as one-offs and the edit/delete scope picker never
    // appears (audit finding #6, which armed the P0 cascade delete).
    const [eventsResult, teamMembersResult, teamSettingsResult, classOwnersResult] = await Promise.all([
      // Paginate past the PostgREST 1000-row server cap (audit F102): a busy
      // team's ±3-month window can exceed a single page, and a bare `.limit(500)`
      // silently dropped the overflow (events vanish from the calendar). A
      // secondary `.order('id')` gives a STABLE page boundary so rows can't
      // drift or repeat across pages.
      fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_events')
          .select('id, team_id, title, event_type, start_time, end_time, location, description, status, all_day, created_by, requires_rsvp, rsvp_deadline, max_attendees, parent_event_id, recurrence_rule')
          .eq('team_id', teamId)
          .gte('start_time', threeMonthsAgo.toISOString())
          .lte('start_time', threeMonthsAhead.toISOString())
          .order('start_time', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
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
      // Who owns which class. RLS does the scoping for us: a coach reads every
      // rostered player's classes, a player reads only their own — so this
      // index is already viewer-correct before attributeClassEvents runs.
      supabase
        .from('golf_player_classes')
        .select('id, player_id')
        .eq('team_id', teamId)
        .limit(1000),
    ]);

    // A failed events fetch must NOT render as a cheerful empty calendar
    // (audit finding #20) — throw to the route error boundary, which offers
    // a retry. Players/timezone failures degrade gracefully below.
    if (eventsResult.error) {
      throw new Error('Failed to load calendar events. Please try again.');
    }

    eventsData = eventsResult.data;
    playersData = (teamMembersResult.data ?? [])
      .map((tm: { player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null }) => tm.player)
      .filter((p): p is NonNullable<typeof p> => p !== null);
    // Both secondary reads now bind their error. Neither THROWS, deliberately:
    // the primary events read above already does that, and null/empty are
    // genuine states here — a team may simply not have set a timezone, and the
    // classOwnersResolved guard below already fails closed on an empty roster.
    // What was missing was any record that the degrade happened at all, so the
    // guard could soften class ownership, or the day-grouping could fall back
    // to a different zone, for a reason nobody could see.
    if (teamMembersResult.error) {
      await logServerError(
        `[calendar] roster read failed for team ${teamId}; class ownership will degrade with no other signal: ${describeError(teamMembersResult.error)}`,
        { action: 'golf.calendarPage.loadRoster', featureArea: 'calendar' },
        'warning',
      );
    }

    if (teamSettingsResult.error) {
      await logServerError(
        `[calendar] team settings read failed for team ${teamId}; timezone falls back and events can group onto the wrong day: ${describeError(teamSettingsResult.error)}`,
        { action: 'golf.calendarPage.loadTeamSettings', featureArea: 'calendar' },
        'warning',
      );
    }

    teamTimezone = teamSettingsResult.data?.timezone || null;

    // Only claim the ownership index is authoritative when the query actually
    // succeeded — an error here must not read as "these classes belong to
    // nobody", which would strip a player's own classes off their calendar.
    const classRows = classOwnersResult.data ?? [];
    // Resolved means we could genuinely map every readable class to a player:
    // the class query succeeded AND either we have the roster to map onto or
    // there are no classes to map. A silently-empty roster fetch would
    // otherwise masquerade as "no classes have owners".
    if (!classOwnersResult.error && (playersData.length > 0 || classRows.length === 0)) {
      classOwnersResolved = true;
      const playerById = new Map(playersData.map((p) => [p.id, p]));
      classOwners = Object.fromEntries(
        classRows.flatMap((row) => {
          const player = row.player_id ? playerById.get(row.player_id) : undefined;
          if (!player) return [];
          return [[row.id, {
            playerId: player.id,
            firstName: player.first_name,
            lastName: player.last_name,
          }] as const];
        }),
      );
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
      parent_event_id: event.parent_event_id,
      recurrence_rule: event.recurrence_rule,
    };
  });

  // Label each class occurrence with the player it belongs to (and, for a
  // player viewer, drop teammates' classes — see attributeClassEvents). Done
  // here so `upcomingCount` below counts what the viewer will actually see;
  // FairwayCalendar re-runs the same pure pass over client-fetched pages.
  events = attributeClassEvents(events, classOwners, {
    isCoach,
    playerId,
    ownersResolved: classOwnersResolved,
  });

  // Combine players and coaches for team members display (data already fetched in parallel above)
  //
  // Both kinds go into ONE array, and until now nothing in it said which was
  // which. The calendar's "filter by player" rail therefore listed the coaches
  // too — the signed-in coach AND every other coach in the organisation, since
  // `coachList` is scoped to `organization_id`, not to this team. A control
  // whose entire purpose is "show me one player's schedule" offered `NR` (you)
  // and `C` (Coach (Demo)) as options. Downstream could not fix it: the
  // entries are structurally identical, so the rail was reduced to guessing by
  // id, which only ever caught the current user.
  //
  // Tagging the origin here is the fix. `role` is optional so existing
  // consumers (the event editor's invite grid, which legitimately wants staff)
  // are unaffected; only the surfaces that mean *players* filter on it.
  if (teamId && (playersData.length > 0 || coachList.length > 0)) {
    teamMembers = [
      // Parse coach full_name into first/last name parts via the shared,
      // documented `splitDisplayName` helper (`@/lib/types/calendar`).
      //
      // NOTE: this split is also why the invite grid used to render "Coach
      // (." — a coach stored as "Coach (Demo)" yields last_name "(Demo)",
      // and a consumer abbreviating to a first initial printed the bracket.
      // The invite grid's display was fixed to render full names; the two
      // remaining first/last-initial consumers in this feature
      // (`CalendarAvatarSidebar.tsx`, `PremiumCalendarClient.tsx`) now use
      // `safeInitial()` from the same helper module, which refuses to turn
      // punctuation into an initial instead of indexing `last_name[0]`
      // directly. The split itself stays a first-token/rest split — it is
      // faithfully reconstructable (`${first_name} ${last_name}` always
      // reproduces the original name), which is what the full-name renders
      // rely on; see `splitDisplayName`'s doc comment for why a single
      // `full_name` column can't be parsed more precisely than that.
      ...coachList.map(c => {
        const { first_name, last_name } = splitDisplayName(c.full_name || 'Coach');
        return {
          id: c.id,
          first_name: first_name || 'Coach',
          last_name,
          avatar_url: c.avatar_url || undefined,
          role: 'coach' as const,
        };
      }),
      // Players already have first_name/last_name
      ...playersData.map(p => ({
        id: p.id,
        first_name: p.first_name || 'Player',
        last_name: p.last_name || '',
        avatar_url: p.avatar_url || undefined,
        role: 'player' as const,
      })),
    ];
  }

  // Count upcoming events using a stable server timestamp to avoid hydration mismatch.
  // Used by the editorial hero subtitle. Cancelled events still render (struck
  // through) but don't count as upcoming.
  const serverNow = new Date().toISOString();
  const upcomingCount = events.filter(
    e => (e.start_time || e.start_date) >= serverNow && e.status !== 'cancelled'
  ).length;

  // Fairway is the only tree (Wave W1) — it reuses the SAME events/
  // teamMembers/timezone payload computed above.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayCalendar
        events={events}
        teamMembers={teamMembers}
        isCoach={isCoach}
        teamTimezone={teamTimezone}
        upcomingCount={upcomingCount}
        serverNow={serverNow}
        currentUserId={coach?.id ?? playerId ?? undefined}
        teamId={teamId}
        loadedRangeStart={threeMonthsAgo.toISOString()}
        loadedRangeEnd={threeMonthsAhead.toISOString()}
        initialEventId={initialEventId}
        classOwners={classOwners}
        classOwnersResolved={classOwnersResolved}
        viewerPlayerId={playerId}
      />
    </div>
  );
}
