import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { PlayerHubWrapper } from '@/components/golf/player-hub/PlayerHubWrapper';
import { HubInsightSignalCard } from '@/components/golf/player-hub/HubInsightSignalCard';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { getTopInsightForPlayer } from '@/app/golf/actions/insight-delivery';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayPlayerHubWrapper } from '@/components/fairway/pages/hub';
import { EmptyState, Button } from '@/components/fairway';

export const metadata: Metadata = {
  title: 'My Hub | Helm Golf',
  description: 'Your personal action center — travel, tasks, and event RSVPs.',
};

/**
 * SCOPE (P153): the Hub is intentionally a TRIAGE / action center — travel,
 * tasks, and event RSVPs — NOT a stats dashboard. It deliberately renders no
 * KPI row / sparklines. The premium player stat surface (headline KPIs +
 * trend sparklines, fed by getPlayerDashboardData → FairwayPlayerDashboard)
 * already lives at the main `/golf/dashboard` route; duplicating it here would
 * split the same data across two screens. Per the audit's honest-completeness
 * rule we do NOT fabricate zero-state KPIs on the Hub — a stat strip would only
 * be added behind a real-data (InsufficientData) gate if the Hub's purpose is
 * ever redefined to subsume the dashboard.
 */

interface RawAssignment {
  task_id: string;
  status: string;
  completed_at: string | null;
}

interface HubEventRow {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  rsvp_status: 'pending' | 'accepted' | 'declined' | 'tentative' | null;
  going_count: number;
  maybe_count: number;
}

/**
 * Whether a task expects the player to submit a file. There is no dedicated
 * `requires_upload` column on golf_tasks; the honest signal is the free-text
 * task_type (and, as a fallback, the category) denoting an upload/submission/
 * video task. Keeps the Hub "Upload" badge truthful instead of always-off.
 */
function taskRequiresUpload(taskType: string | null, category: string | null): boolean {
  const haystack = `${taskType ?? ''} ${category ?? ''}`.toLowerCase();
  return /upload|submission|submit|video|film|recording|photo/.test(haystack);
}

export default async function PlayerHubPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard'); // coaches redirect to main dashboard

  const supabase = await createClient();

  // Get player's team
  const { data: teamMember } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id)
    .eq('status', 'active')
    .maybeSingle();

  const teamId = teamMember?.team_id;

  if (!teamId) {
    // ── Fairway fork (ADDITIVE): teamless player → a Fairway EmptyState inside
    // the `.fairway-ds` scope on bg-canvas. Flag OFF → the legacy block below,
    // byte-for-byte unchanged. (b) player-no-team state.
    if (isRedesignEnabled()) {
      return (
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center px-4 py-16 md:px-6">
            <EmptyState
              title="No team found"
              description="Join a team to see your travel, tasks, and event RSVPs in one place."
              action={
                <Button asChild variant="primary">
                  {/* Route straight to the focused invite-code entry flow (a
                      single auto-focused field) rather than the generic Settings
                      page where the user would have to hunt for the code field.
                      (P155 — empty-state CTA points at the action it promises.) */}
                  <Link href="/golf/join">Enter team code</Link>
                </Button>
              }
            />
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">No Team Found</h1>
          <p className="text-warm-600">Join a team to see your travel, tasks, and events.</p>
        </div>
      </div>
    );
  }

  const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player';

  // Fetch all hub data in parallel
  // Use raw SQL for tasks + completions since generated types may be outdated
  const eventSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // P154: project ONLY the columns the trip transform/render reads (no
  // select('*')), bound to a recent window, and cap the fetch. The Trips tab
  // still shows recently-completed trips, so we keep a generous look-back
  // (~120 days) rather than upcoming-only — but ancient itineraries are dropped
  // so the PostgREST 1000-row cap can never silently truncate a long-lived team.
  // Order stays departure_date ASC so the Overview "next trips" slice(0,2)
  // honestly surfaces the 2 SOONEST upcoming trips.
  const tripsSince = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [tripsResult, tasksRaw, eventsResult, announcementsResult, topInsight] = await Promise.all([
    // Travel itineraries for the team (recent + upcoming window only)
    supabase
      .from('golf_travel_itineraries')
      .select(
        'id, event_name, destination, transportation_type, departure_date, departure_time, departure_location, return_date, return_time, hotel_name, hotel_address, hotel_phone, hotel_confirmation, uniform_requirements, gear_list, room_assignments, notes, flight_info',
      )
      .eq('team_id', teamId)
      .gte('departure_date', tripsSince)
      .order('departure_date', { ascending: true })
      .limit(100),

    // Tasks assigned to this player via golf_task_assignments
    // (createTask writes to golf_task_assignments, not golf_tasks.assigned_to)
    supabase
      .from('golf_task_assignments' as 'golf_shots')
      .select('task_id, status, completed_at')
      .eq('player_id' as 'id', player.id) as unknown as Promise<{ data: RawAssignment[] | null; error: unknown }>,

    // Upcoming events + player RSVP + going/maybe counts — single RPC round-trip.
    // Replaces the previous 3-step waterfall (events → my RSVPs → all RSVPs → reduce).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_player_hub_events', {
      p_team_id:   teamId,
      p_player_id: player.id,
      p_since:     eventSince,
    }) as Promise<{ data: HubEventRow[] | null; error: unknown }>,

    // Recent announcements for player hub
    getPlayerHubAnnouncements(teamId, player.id),

    // Top evidence-backed insight for the Hub signal card. Returns null when
    // the player has no surfaceable insight — the card renders nothing in
    // that case, so the Hub stays clean.
    getTopInsightForPlayer(player.id),
  ]);

  // Transform trips
  const trips = (tripsResult.data || []).map(item => ({
    id: item.id,
    event_name: item.event_name || '',
    destination: item.destination || '',
    transportation_type: (item.transportation_type as 'bus' | 'van' | 'fly' | 'carpool') || 'bus',
    departure_date: item.departure_date || '',
    departure_time: item.departure_time,
    departure_location: item.departure_location,
    return_date: item.return_date,
    return_time: item.return_time,
    hotel_name: item.hotel_name,
    hotel_address: item.hotel_address,
    hotel_phone: item.hotel_phone,
    hotel_confirmation: item.hotel_confirmation,
    uniform_requirements: item.uniform_requirements,
    gear_list: Array.isArray(item.gear_list) ? item.gear_list.join(', ') : (item.gear_list as string | null),
    room_assignments: typeof item.room_assignments === 'string'
      ? item.room_assignments
      : (item.room_assignments && typeof item.room_assignments === 'object' && !Array.isArray(item.room_assignments) && 'text' in item.room_assignments
        ? String(item.room_assignments.text)
        : (item.room_assignments ? JSON.stringify(item.room_assignments) : null)),
    notes: item.notes,
    flight_info: typeof item.flight_info === 'string'
      ? item.flight_info
      : (item.flight_info && typeof item.flight_info === 'object' && !Array.isArray(item.flight_info) && 'text' in item.flight_info
        ? String(item.flight_info.text)
        : (item.flight_info ? JSON.stringify(item.flight_info) : null)),
  }));

  // Build tasks from assignments (tasksRaw is now the assignments query result)
  const rawAssignments = (tasksRaw.data || []) as unknown as RawAssignment[];
  const assignmentMap = new Map(rawAssignments.map(a => [a.task_id, a]));
  const taskIds = [...new Set(rawAssignments.map(a => a.task_id))];

  let tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    category: string | null;
    requires_upload: boolean;
    status: 'completed' | 'overdue' | 'pending';
    completed_at: string | null;
  }> = [];

  if (taskIds.length > 0) {
    const { data: taskDetails } = await supabase
      .from('golf_tasks')
      .select('id, title, description, due_date, category, task_type')
      .in('id', taskIds)
      .eq('team_id', teamId)
      .order('due_date', { ascending: true, nullsFirst: false });

    tasks = (taskDetails || []).map(t => {
      const assignment = assignmentMap.get(t.id);
      const isCompleted = assignment?.status === 'completed';
      const completedAt = assignment?.completed_at || null;
      const isOverdue = !isCompleted && t.due_date && new Date(t.due_date) < new Date();
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        category: t.category || null,
        // requires_upload is derived from real task data (not hardcoded false).
        // There's no dedicated column; the honest signal is the task_type —
        // upload/submission/video tasks expect a file. (F135/C21)
        requires_upload: taskRequiresUpload(t.task_type, t.category),
        status: isCompleted ? 'completed' as const : isOverdue ? 'overdue' as const : 'pending' as const,
        completed_at: completedAt,
      };
    });
  }

  // Events + RSVP are already fully shaped by get_player_hub_events RPC above.
  const events = (eventsResult.data ?? []).map(e => ({
    id: e.id,
    event_id: e.event_id,
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    is_mandatory: Boolean(e.is_mandatory),
    rsvp_status: e.rsvp_status ?? null,
    going_count: e.going_count ?? 0,
    maybe_count: e.maybe_count ?? 0,
  }));

  // B3/B4: an error must never masquerade as an empty state. When the
  // announcements fetch fails, we keep the list empty BUT flag the failure so the
  // Hub renders an honest "couldn't load — retry" affordance instead of a silent
  // (cheerful) "no announcements". (P147)
  const announcements = announcementsResult.success ? (announcementsResult.data ?? []) : [];
  const announcementsLoadError = !announcementsResult.success;

  // ── Fairway fork (ADDITIVE): flag ON → the rebuilt Hub inside the `.fairway-ds`
  // scope on bg-canvas. The optimistic write paths (completeTask / respondToEvent)
  // stay in FairwayPlayerHubWrapper — the SAME logic as PlayerHubWrapper — so no
  // mutation moves into this server page; the data + the rendered signalCard are
  // passed down VERBATIM. Flag OFF (default) → the legacy <PlayerHubWrapper/>
  // below, byte-for-byte unchanged. (c) player-with-team state.
  if (isRedesignEnabled()) {
    // Team name for the masthead eyebrow — additive lookup, redesign branch only.
    const { data: teamRow } = await supabase
      .from('golf_teams')
      .select('name')
      .eq('id', teamId)
      .maybeSingle();
    const teamName = teamRow?.name || 'Your team';

    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayPlayerHubWrapper
          trips={trips}
          tasks={tasks}
          events={events}
          announcements={announcements}
          announcementsLoadError={announcementsLoadError}
          playerName={playerName}
          teamName={teamName}
          signalCard={<HubInsightSignalCard insight={topInsight} />}
        />
      </div>
    );
  }

  return (
    <PlayerHubWrapper
      trips={trips}
      tasks={tasks}
      events={events}
      announcements={announcements}
      playerName={playerName}
      signalCard={<HubInsightSignalCard insight={topInsight} />}
    />
  );
}
