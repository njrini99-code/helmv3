import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { CalendarSkeleton } from '@/components/ui/skeleton';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import type { Metadata } from 'next';

// Code-split the two calendar surfaces: the route serves EXACTLY ONE of them
// per request (redesign flag), so static imports made every visitor download
// both implementations (~97KB gzip marginal, audit finding #26). next/dynamic
// gives each its own chunk, loaded only when actually rendered.
const EditorialCalendarSurface = dynamic(
  () =>
    import('@/components/golf/calendar/editorial/EditorialCalendarSurface').then(
      (m) => m.EditorialCalendarSurface,
    ),
  { loading: () => <CalendarSkeleton /> },
);
const FairwayCalendar = dynamic(
  () =>
    import('@/components/fairway/pages/calendar/FairwayCalendar').then((m) => m.FairwayCalendar),
  { loading: () => <CalendarSkeleton /> },
);

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
    const [coachTeamId, playerTeamResult, coachListResult] = await Promise.all([
      orgId
        ? resolveCoachTeamIdWithCookie(supabase, orgId, coach?.id ?? null)
        : Promise.resolve(null),
      playerId
        ? supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()
        : Promise.resolve({ data: null }),
      orgId
        ? supabase.from('golf_coaches').select('id, full_name, avatar_url').eq('organization_id', orgId).order('full_name', { ascending: true }).limit(20)
        : Promise.resolve({ data: null }),
    ]);

    teamId = coachTeamId || playerTeamResult.data?.team_id || null;
    coachList = coachListResult.data || [];
  } catch {
    // Team resolution failed (network/DB) — rendering an empty calendar here
    // is indistinguishable from "my season got wiped" (audit finding #20).
    // Throw so the route error boundary renders a real, retryable error state.
    throw new Error('Failed to load your team for the calendar. Please try again.');
  }

  let events: CalendarEvent[] = [];
  let teamMembers: { id: string; first_name: string; last_name: string; avatar_url?: string }[] = [];

  // Fetch events (scoped to +/- 3 months), players, and team settings in parallel
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAhead = new Date();
  threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

  let eventsData: { id: string; team_id: string; title: string; event_type: string; start_time: string; end_time: string | null; location: string | null; description: string | null; status: string | null; all_day: boolean | null; created_by: string | null; requires_rsvp: boolean | null; rsvp_deadline: string | null; max_attendees: number | null; parent_event_id: string | null; recurrence_rule: string | null }[] | null = null;
  let playersData: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[] = [];
  let teamTimezone: string | null = null;

  if (teamId) {
    // NOTE: cancelled events are INCLUDED on purpose — they render distinctly
    // (strike/badge) instead of silently disappearing (soft-cancel lifecycle).
    // parent_event_id + recurrence_rule are REQUIRED end-to-end: without them
    // series members render as one-offs and the edit/delete scope picker never
    // appears (audit finding #6, which armed the P0 cascade delete).
    const [eventsResult, teamMembersResult, teamSettingsResult] = await Promise.all([
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
    teamTimezone = teamSettingsResult.data?.timezone || null;
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

  // Count upcoming events using a stable server timestamp to avoid hydration mismatch.
  // Used by the editorial hero subtitle. Cancelled events still render (struck
  // through) but don't count as upcoming.
  const serverNow = new Date().toISOString();
  const upcomingCount = events.filter(
    e => (e.start_time || e.start_date) >= serverNow && e.status !== 'cancelled'
  ).length;

  // ── Fairway redesign fork (ADDITIVE + GATED) ─────────────────────────────
  // When NEXT_PUBLIC_REDESIGN is on, render the re-skinned Calendar shell. It
  // reuses the SAME events/teamMembers/timezone payload and the SAME legacy
  // engine (PremiumCalendarClient grid + DnD + realtime + EventDetailModal)
  // UNCHANGED behind the fork. Flag OFF → the legacy branch below runs
  // byte-for-byte unchanged.
  if (isRedesignEnabled()) {
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
        />
      </div>
    );
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <div className="min-h-full flex flex-col">
          <LargeTitleHeader title="Calendar" />

          {/* Editorial calendar surface — hero plinth + day strip + view
              toggle + agenda/grid body + detail drawer.
              We pass `serverNow` so the surface seeds its initial focus date
              from a server-stable timestamp. Without this, both server and
              client invoke `new Date()` independently and produce divergent
              "today" markup → React hydration error #418. */}
          <div className="flex-1 px-4 md:px-6 pt-2 pb-6 min-h-0">
            <EditorialCalendarSurface
              events={events}
              teamMembers={teamMembers}
              isCoach={isCoach}
              teamTimezone={teamTimezone}
              upcomingCount={upcomingCount}
              serverNow={serverNow}
            />
          </div>
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
