import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayTeamHubWrapper } from '@/components/fairway/pages/team-hub';
import { EmptyState, Button } from '@/components/fairway';

export const metadata: Metadata = {
  title: 'Team Hub | Helm Golf',
  description: 'Tasks, announcements, travel, and your class schedule — all in one place.',
};

interface RawAssignment {
  task_id: string;
  status: string;
  completed_at: string | null;
}

export default async function TeamHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Team Hub is a redesign-only consolidation. With the flag OFF the four
  // surfaces remain on their own routes (and the rail entry is hidden), so a
  // direct hit falls back to the player Hub. Nothing legacy changes.
  if (!isRedesignEnabled()) redirect('/golf/dashboard/hub');

  // Deep-link target (Cmd+K / bookmarks): /team-hub?tab=travel etc.
  const initialTab = (await searchParams)?.tab;

  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard'); // coaches → main dashboard

  const supabase = await createClient();

  // Resolve the player's active team.
  const { data: teamMember } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id)
    .eq('status', 'active')
    .maybeSingle();

  const teamId = teamMember?.team_id;

  if (!teamId) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center px-4 py-16 md:px-6">
          <EmptyState
            title="No team found"
            description="Join a team to see tasks, announcements, travel, and your classes in one place."
            action={
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/settings">Enter team code</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player';

  // Fetch the four datasets in parallel — SAME queries the player Hub uses.
  // (golf_task_assignments + the casts mirror hub/page.tsx because the table is
  // not in the generated types.)
  const [tripsResult, tasksRaw, announcementsResult, classesResult, teamResult, teammatesResult] = await Promise.all([
    supabase
      .from('golf_travel_itineraries')
      .select('*')
      .eq('team_id', teamId)
      .order('departure_date', { ascending: true }),

    supabase
      .from('golf_task_assignments' as 'golf_shots')
      .select('task_id, status, completed_at')
      .eq('player_id' as 'id', player.id) as unknown as Promise<{ data: RawAssignment[] | null; error: unknown }>,

    getPlayerHubAnnouncements(teamId, player.id),

    supabase
      .from('golf_player_classes')
      .select('id, class_name, instructor, days, start_time, end_time, building, room, credits, color')
      .eq('player_id', player.id)
      .order('start_time', { ascending: true }),

    supabase.from('golf_teams').select('name').eq('id', teamId).maybeSingle(),

    // Teammates — the player roster, folded into the hub (SAME query the
    // standalone player roster route used; excludes the viewer).
    supabase
      .from('golf_team_members')
      .select(`
        player:golf_players!inner (
          id, first_name, last_name, avatar_url, handicap, graduation_year,
          user:users(last_seen)
        )
      `)
      .eq('team_id', teamId)
      .neq('player_id', player.id),
  ]);

  // ── Trips (jsonb → string, text[] → csv) — verbatim from hub/page.tsx ──────
  const trips = (tripsResult.data || []).map((item) => ({
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
    room_assignments:
      typeof item.room_assignments === 'string'
        ? item.room_assignments
        : item.room_assignments &&
            typeof item.room_assignments === 'object' &&
            !Array.isArray(item.room_assignments) &&
            'text' in item.room_assignments
          ? String(item.room_assignments.text)
          : item.room_assignments
            ? JSON.stringify(item.room_assignments)
            : null,
    notes: item.notes,
    flight_info:
      typeof item.flight_info === 'string'
        ? item.flight_info
        : item.flight_info &&
            typeof item.flight_info === 'object' &&
            !Array.isArray(item.flight_info) &&
            'text' in item.flight_info
          ? String(item.flight_info.text)
          : item.flight_info
            ? JSON.stringify(item.flight_info)
            : null,
  }));

  // ── Tasks from golf_task_assignments → golf_tasks — verbatim from hub ──────
  const rawAssignments = (tasksRaw.data || []) as unknown as RawAssignment[];
  const assignmentMap = new Map(rawAssignments.map((a) => [a.task_id, a]));
  const taskIds = [...new Set(rawAssignments.map((a) => a.task_id))];

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

    tasks = (taskDetails || []).map((t) => {
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
        status: isCompleted ? ('completed' as const) : isOverdue ? ('overdue' as const) : ('pending' as const),
        completed_at: completedAt,
      };
    });
  }

  // ── Class schedule (read-only display) ─────────────────────────────────────
  const classes = (classesResult.data || []).map((c) => ({
    id: c.id,
    class_name: c.class_name,
    instructor: c.instructor ?? null,
    days: Array.isArray(c.days) ? (c.days as string[]) : null,
    start_time: c.start_time ?? null,
    end_time: c.end_time ?? null,
    building: c.building ?? null,
    room: c.room ?? null,
    credits: c.credits ?? null,
    color: c.color ?? null,
  }));

  const announcements = announcementsResult.success ? (announcementsResult.data ?? []) : [];

  // ── Teammates (read-only roster grid in the Teammates tab) ──────────────────
  const teammates = (teammatesResult.data || [])
    .filter((tm) => tm.player && !('error' in tm.player))
    .map((tm) => {
      const p = tm.player as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        handicap: number | null;
        graduation_year: number | null;
        user?: { last_seen: string | null } | null;
      };
      return {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        avatar_url: p.avatar_url,
        handicap: p.handicap,
        graduation_year: p.graduation_year,
        last_seen: p.user?.last_seen || null,
      };
    })
    .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayTeamHubWrapper
        tasks={tasks}
        announcements={announcements}
        trips={trips}
        classes={classes}
        teammates={teammates}
        playerName={playerName}
        teamName={teamResult.data?.name || 'Your team'}
        initialTab={initialTab}
      />
    </div>
  );
}
