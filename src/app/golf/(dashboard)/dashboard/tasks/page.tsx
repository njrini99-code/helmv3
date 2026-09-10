'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useTaskRealtime } from '@/hooks/golf/use-task-realtime';
import { completeTask } from '@/app/golf/actions/tasks';
import { fairwayScope } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';
import { FairwayTasks } from '@/components/fairway/pages/tasks';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

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

  // KEYED ON teamId, NOT MOUNT-ONLY.
  //
  // This ran once with `[]`, so a program head toggling between the men's and
  // women's squads kept the FIRST team's roster in `players` for the rest of
  // the session. "Assign to all players" then wrote the new team's task to the
  // old team's players — a compliance task landing on ten men who were never
  // asked, while the six women it was for never saw it. The page looked
  // entirely correct throughout: right task, right team header, wrong people.
  //
  // The roster is cleared before the refetch so the picker cannot briefly show
  // the previous squad's names, which is the same wrong answer in miniature.
  useEffect(() => {
    if (userRole === 'coach' && teamId) {
      setPlayers([]);
      setPlayersError(false);
      loadPlayers(teamId);
    }
    setInitialLoading(false);
  }, [userRole, teamId]);

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

  // This fallback is NOT redundant with the route's loading.tsx: this page is
  // a 'use client' component, so the route Suspense boundary (loading.tsx)
  // only covers the gap until GolfTasksPage itself mounts — it resolves as
  // soon as the client bundle is ready, which is BEFORE `useTaskRealtime`'s
  // own useEffect-driven fetch (a plain useState/useEffect fetch, invisible
  // to Suspense) has returned real tasks/stats. Without this branch there'd
  // be a beat of an empty/undefined board between mount and first data.
  //
  // Facelift (docs/design/fairway-facelift/screens/tasks.md): this mirrors
  // loading.tsx's shape exactly (same masthead → StatMatrix → toolbar → one
  // matte Surface of seam rows) so the swap between the two loading states is
  // invisible — see loading.tsx's docblock for why the two files duplicate
  // this markup instead of sharing a component.
  if (loading) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8"
        >
          <span className="sr-only">Loading tasks…</span>

          {/* Masthead — ViewHeader (eyebrow · title · description · meta) +
              primary CTA + the header overflow (From template). */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-52 max-w-full" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <Skeleton className="h-10 w-32 rounded-fw-md" />
              <Skeleton circle className="h-9 w-9" />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-6">
            {/* StatMatrix — Open · Active · Completed · Overdue (2×2 on
                phone, one row of 4 from `sm`), the same inset-well seams the
                real component draws. */}
            <div className="grid grid-cols-2 overflow-hidden rounded-fw-md bg-surface-sunken sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col items-center gap-1.5 border-border-subtle px-3 py-3',
                    i % 2 === 1 && 'border-l',
                    i >= 2 && 'border-t sm:border-t-0',
                    i !== 0 && 'sm:border-l',
                  )}
                >
                  <Skeleton className="h-7 w-10" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>

            {/* Toolbar — search · status Segmented · category filter, one row. */}
            <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-card border border-border-subtle bg-surface px-3 py-2">
              <Skeleton className="h-10 w-full rounded-fw-md sm:min-w-[180px] sm:max-w-sm sm:flex-1 lg:w-72 lg:flex-none" />
              <Skeleton className="h-9 w-48 rounded-fw-sm" />
              <Skeleton className="ml-auto h-8 w-28 rounded-full" />
            </div>

            {/* The task list — ONE matte Surface of seam rows. */}
            <Surface
              elevation="border"
              padding="none"
              className="divide-y divide-border-subtle overflow-hidden"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
                  <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - (i % 3) * 8}%` }} />
                  <Skeleton className="hidden h-8 w-28 flex-shrink-0 sm:block" />
                  <Skeleton className="h-4 w-12 flex-shrink-0 sm:w-16" />
                  <Skeleton className="hidden h-6 w-20 flex-shrink-0 rounded-full sm:block" />
                  <Skeleton className="hidden h-4 w-4 flex-shrink-0 sm:block" />
                </div>
              ))}
            </Surface>
          </div>
        </div>
      </div>
    );
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
