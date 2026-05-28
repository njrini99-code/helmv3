import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { PlayerHubWrapper } from '@/components/golf/player-hub/PlayerHubWrapper';
import { HubInsightSignalCard } from '@/components/golf/player-hub/HubInsightSignalCard';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { getTopInsightForPlayer } from '@/app/golf/actions/insight-delivery';

export const metadata: Metadata = {
  title: 'My Hub | Helm Golf',
  description: 'Your personal action center — travel, tasks, and event RSVPs.',
};

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
  const [tripsResult, tasksRaw, eventsResult, announcementsResult, topInsight] = await Promise.all([
    // Travel itineraries for the team
    supabase
      .from('golf_travel_itineraries')
      .select('*')
      .eq('team_id', teamId)
      .order('departure_date', { ascending: true }),

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
      .select('id, title, description, due_date, category')
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
        requires_upload: false,
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

  const announcements = announcementsResult.success ? (announcementsResult.data ?? []) : [];

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
