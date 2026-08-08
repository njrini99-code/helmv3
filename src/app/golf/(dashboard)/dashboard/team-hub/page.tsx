import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayTeamHubWrapper } from '@/components/fairway/pages/team-hub';
import { EmptyState, Button, FeatureUnavailable } from '@/components/fairway';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

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
  // Deep-link target (Cmd+K / bookmarks): /team-hub?tab=travel etc.
  const initialTab = (await searchParams)?.tab;

  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) {
    // #1251 — a coach here used to `redirect('/golf/dashboard')`, and that
    // redirect crashed React (#310, "rendered more hooks than during the
    // previous render") on every coach load, thrown inside Next's client
    // router rather than in any app component. The framework-level fix used
    // for the bare redirect shims — intercepting the path in `next.config.mjs`
    // `redirects()` before the page renders — cannot apply, because whether to
    // redirect depends on the visitor's role and the config layer has no
    // session. Rendering `<FeatureUnavailable>` IN PLACE removes the redirect
    // (and whatever it was crashing on) rather than papering over it, and is
    // the pattern every coach-only page already uses for the mirror case.
    return (
      <FeatureUnavailable
        title="Team Hub"
        message="Team Hub collects a player's own tasks, announcements, travel, and class schedule. As a coach you manage those from the team surfaces on your dashboard."
        actionHref="/golf/dashboard"
        actionLabel="Back to Dashboard"
      />
    );
  }

  const supabase = await createClient();

  // Resolve the player's active team.
  const { data: teamMember, error: teamMemberError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id)
    .eq('status', 'active')
    .maybeSingle();

  // "No team found. Join a team to see tasks, announcements, travel…" is the
  // right thing to say to someone genuinely without a team, and it stays. It is
  // the wrong thing to say to a rostered player whose membership read failed —
  // they are told to enter a team code for a team they are already on, and the
  // page they came here for is simply gone.
  //
  // This is a player's home surface, so it throws to the dashboard error
  // boundary instead: "something went wrong, try again" is recoverable, and an
  // invitation to re-join is not.
  if (teamMemberError) {
    void logServerError(
      `[team hub] membership read failed for player ${player.id}: ${describeError(teamMemberError)}`,
      { action: 'teamHub.resolveTeam', featureArea: 'teams' },
      'error',
    );
    throw new Error("Couldn't load your team. Please try again.");
  }

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

  // Every panel below reads `.data || []`, so a failed fetch renders as an
  // empty panel — "no trips", "no tasks", "no teammates" — stated to the player
  // as fact. The Hub is deliberately tolerant (one dead panel should not take
  // the page down), so these still degrade; what changes is that the failure
  // now leaves a trace instead of looking like a quiet week.

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
    // standalone player roster route used; excludes the viewer). F083: active
    // members only, so pending/removed rows don't surface in the Teammates tab.
    supabase
      .from('golf_team_members')
      .select(`
        player:golf_players!inner (
          id, first_name, last_name, avatar_url, handicap, graduation_year,
          user:users(last_seen)
        )
      `)
      .eq('team_id', teamId)
      .eq('status', 'active')
      .neq('player_id', player.id),
  ]);

  // ── Trips (jsonb → string, text[] → csv) — verbatim from hub/page.tsx ──────
  for (const [panel, failed] of [
    ['trips', tripsResult.error],
    ['tasks', tasksRaw.error],
    ['classes', classesResult.error],
    ['team', teamResult.error],
    ['teammates', teammatesResult.error],
  ] as const) {
    if (!failed) continue;
    void logServerError(
      `[team hub] ${panel} read failed for team ${teamId}; that panel will render empty: ${describeError(failed)}`,
      { action: 'teamHub.load', featureArea: 'teams' },
      'warning',
    );
  }

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
    const { data: taskDetails, error: taskDetailsError } = await supabase
      .from('golf_tasks')
      .select('id, title, description, due_date, category')
      .in('id', taskIds)
      .eq('team_id', teamId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (taskDetailsError) {
      // The assignments exist; only their titles are missing. Rendering the
      // task list empty tells the player they have nothing to do.
      void logServerError(
        `[team hub] task detail read failed for team ${teamId}; assigned tasks will not render: ${describeError(taskDetailsError)}`,
        { action: 'teamHub.load', featureArea: 'tasks' },
        'warning',
      );
    }

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
  // W1 count-coherence audit: a FAILED fetch (RPC error, permission denial,
  // transient network hiccup) must never be indistinguishable from a team
  // that has genuinely posted nothing — folding it into `[]` above silently
  // renders "No announcements" while the dedicated /dashboard/announcements
  // page (a separate query path) may still show real rows. Mirrors the same
  // `announcementsLoadError` flag player-hub-data.ts already derives for
  // PlayerActionCenter's identical AnnouncementsList usage.
  const announcementsLoadError = !announcementsResult.success;

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
        announcementsLoadError={announcementsLoadError}
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
