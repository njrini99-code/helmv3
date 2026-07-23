'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useTaskRealtime } from '@/hooks/golf/use-task-realtime';
import { completeTask } from '@/app/golf/actions/tasks';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayTasks } from '@/components/fairway/pages/tasks';
import { TasksSkeleton } from './TasksSkeleton';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  reminder_at: string | null;
  category: string | null;
  assignments: Array<{
    id: string;
    status: string;
    completed_at: string | null;
    player: {
      id: string;
      first_name: string;
      last_name: string;
    };
  }>;
}

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export default function GolfTasksPage() {
  const golfUser = useGolfUser();
  const [initialLoading, setInitialLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  // P292 — distinguish "roster fetch failed" from a genuinely empty roster, so
  // the create modal doesn't show "No players on the roster yet" on an outage.
  const [playersError, setPlayersError] = useState(false);

  // Use IDs from context — no auth/role queries needed
  const teamId = golfUser.teamId || null;
  const playerId = golfUser.playerId || null;
  const userRole = golfUser.role;

  // Real-time tasks subscription
  const { tasks: realtimeTasks, stats, loading: tasksLoading, error: tasksError, refetch } = useTaskRealtime(teamId, {
    playerId: userRole === 'player' ? playerId : undefined,
    assignedToPlayerOnly: userRole === 'player',
  });

  // Transform real-time tasks to expected format. `assignments` comes straight
  // from the hook's golf_task_assignments rows (the M:N join create/complete
  // actually write) — NOT the never-written golf_tasks.assigned_to — so the
  // coach progress read-out (N of M) and player completion both reflect truth.
  const tasks: Task[] = realtimeTasks.map(task => ({
    id: task.id,
    title: task.title,
    description: task.description,
    due_date: task.due_date,
    status: task.status === 'completed' ? 'completed' : 'active',
    created_at: task.created_at || '',
    reminder_at: task.reminder_at,
    category: task.category,
    assignments: task.assignments.map(a => ({
      id: a.id,
      status: a.status,
      completed_at: a.completed_at,
      player: {
        id: a.player.id,
        first_name: a.player.first_name,
        last_name: a.player.last_name,
      },
    })),
  }));

  useEffect(() => {
    if (userRole === 'coach' && teamId) {
      loadPlayers(teamId);
    }
    setInitialLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlayers(tId: string) {
    const supabase = createClient();

    // P292 — surface fetch errors instead of swallowing them. On failure the
    // roster stays empty, which is indistinguishable from a genuinely empty
    // roster unless we record that the fetch itself failed.
    const { data: teamMembers, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', tId);

    if (membersError) {
      setPlayersError(true);
      return;
    }

    const playerIds = (teamMembers || []).map(tm => tm.player_id);

    if (playerIds.length > 0) {
      const { data: playersData, error: playersDataError } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .in('id', playerIds)
        .order('last_name');

      if (playersDataError) {
        setPlayersError(true);
        return;
      }

      if (playersData) {
        setPlayers(playersData);
      }
    }
    // Reached here without an error → the roster is genuinely as fetched.
    setPlayersError(false);
  }

  const loading = initialLoading || tasksLoading;

  // Player complete handler. Completes via golf_task_assignments (the
  // completeTask action), then refetches so the live list + stats reflect the
  // change.
  //
  // P284 — completeTask returns an ActionResult { success, error } and does NOT
  // throw on a soft failure (RLS denial, "not assigned", etc). We RETURN that
  // result so the caller can surface honest success/failure feedback.
  const handleCompleteTask = async (taskId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await completeTask(taskId);
    await refetch();
    return result;
  };

  if (loading) {
    // Fairway-shaped skeleton — shape-matches this route's own loading.tsx
    // Suspense fallback (max-w-[1280px] masthead + filter pills + grid
    // lg:grid-cols-3 list/Templates rail) so the client-side loading state
    // paints in place with no shell-swap on hydrate.
    return <TasksSkeleton />;
  }

  // Presentation surface. Reuses the SAME live tasks/stats/players + the SAME
  // refetch, and the unchanged completeTask action for the player path.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayTasks
        role={userRole === 'coach' ? 'coach' : 'player'}
        teamId={teamId}
        tasks={tasks}
        stats={stats}
        players={players}
        playersError={playersError}
        error={tasksError}
        onRefetch={refetch}
        onCompleteTask={userRole === 'player' ? handleCompleteTask : undefined}
      />
    </div>
  );
}
