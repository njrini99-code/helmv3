'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useTaskRealtime } from '@/hooks/golf/use-task-realtime';
import { completeTask } from '@/app/golf/actions/tasks';
import { fairwayScope } from '@/lib/redesign/flag';
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
  // What WAS wrong: this fallback used its own bespoke shape (max-w-[720px],
  // bg-transparent, single column, no Templates rail) instead of matching the
  // page it precedes — so a single load painted THREE different layouts:
  // loading.tsx (1280px/3-col) → this branch (720px/1-col) → FairwayTasks
  // (1280px/3-col), the middle one 560px narrower than both neighbours. This
  // now mirrors loading.tsx's shape exactly (same masthead/pills/search/list+
  // rail skeleton) so the swap between the two loading states is invisible.
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

          {/* Masthead — ViewHeader (eyebrow · title · description · meta) + CTA */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-9 w-52 max-w-full" />
              <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
            </div>
            <Skeleton className="h-10 w-32 rounded-fw-md" />
          </div>

          <div className="mt-8 flex flex-col gap-6">
            {/* Status filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              {[64, 72, 96].map((w) => (
                <Skeleton key={w} className="h-9 rounded-full" style={{ width: w }} />
              ))}
            </div>

            {/* Search */}
            <Skeleton className="h-11 w-full max-w-md rounded-fw-md" />

            {/* List (col-span-2) + Templates rail */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-3 lg:col-span-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Surface key={i} elevation="border" padding="none" className="overflow-hidden">
                    <div className="flex items-start gap-4 p-4 md:p-5">
                      <Skeleton className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-fw-sm" />
                      <div className="min-w-0 flex-1">
                        <Skeleton className="h-4 w-2/5" />
                        <Skeleton className="mt-2 h-3.5 w-3/4" />
                        <div className="mt-3 flex items-center gap-2">
                          <Skeleton className="h-6 w-20 rounded-full" />
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </Surface>
                ))}
              </div>

              <div className="lg:col-span-1">
                <Surface elevation="border" padding="none" className="overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                    <Skeleton className="h-[18px] w-[18px] rounded-fw-sm" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex flex-col gap-2 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-fw-md" />
                    ))}
                  </div>
                </Surface>
              </div>
            </div>
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
