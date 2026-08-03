'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getTeamTasks, getPlayerTasks, getTaskAssignments } from '@/app/baseball/actions/tasks';
import type { BaseballTask } from '@/app/baseball/actions/tasks';
import { TasksFairway } from '@/components/baseball/tasks/TasksFairway';
import { fairwayScope } from '@/lib/redesign/flag';
import { parseDateOnly } from '@/lib/utils/date-only';

interface RosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Assignment {
  id: string;
  player_id: string;
  status: string;
  completed_at: string | null;
  player_first_name: string;
  player_last_name: string;
}

interface TaskWithAssignments {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string | null;
  category: string | null;
  created_at: string;
  reminder_at?: string | null;
  assignments: Assignment[];
}

export default function TasksClient() {
  const { user, player, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();

  const [tasks, setTasks] = useState<TaskWithAssignments[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'overdue'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const isCoach = user?.role === 'coach';

  const fetchData = useCallback(async () => {
    if (!selectedTeamId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isCoach) {
      // Coach: get all team tasks with assignments
      const result = await getTeamTasks(selectedTeamId);
      if (result.success && result.data) {
        // Fetch assignments for each task
        const tasksWithAssignments: TaskWithAssignments[] = await Promise.all(
          result.data.map(async (task: BaseballTask) => {
            const assignResult = await getTaskAssignments(task.id);
            return {
              id: task.id,
              title: task.title,
              description: task.description,
              due_date: task.due_date,
              status: task.status || 'active',
              priority: task.priority,
              category: task.category,
              created_at: task.created_at || new Date().toISOString(),
              reminder_at: task.reminder_at,
              assignments: assignResult.success && assignResult.data ? assignResult.data : [],
            };
          })
        );
        setTasks(tasksWithAssignments);
      }

      // Fetch roster for create modal
      const supabase = createClient();
      const { data: members } = await supabase
        .from('baseball_team_members')
        .select('player_id, player:baseball_players(id, first_name, last_name)')
        .eq('team_id', selectedTeamId)
        .eq('status', 'active');

      const rosterPlayers = (members || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any) => m.player)
        .filter(Boolean)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
        }));

      setPlayers(rosterPlayers);
    } else if (player?.id) {
      // Player: get their assigned tasks
      const result = await getPlayerTasks(player.id);
      if (result.success && result.data) {
        const playerTasks: TaskWithAssignments[] = result.data.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          due_date: t.due_date,
          status: t.assignment_status === 'completed' ? 'completed' : 'active',
          priority: t.priority,
          category: t.category,
          created_at: t.created_at || new Date().toISOString(),
          assignments: [{
            id: t.assignment_id,
            player_id: player.id,
            status: t.assignment_status,
            completed_at: t.completed_at,
            player_first_name: '',
            player_last_name: '',
          }],
        }));
        setTasks(playerTasks);
      }
    }

    setLoading(false);
  }, [selectedTeamId, user, isCoach, player?.id]);

  useEffect(() => {
    if (authLoading) return;
    fetchData();
  }, [authLoading, fetchData]);

  if (authLoading) return <PageLoading />;

  const now = new Date();
  const overdueCount = tasks.filter(
    t => t.due_date && parseDateOnly(t.due_date) < now && t.status !== 'completed'
  ).length;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <TasksFairway
        tasks={tasks}
        filter={filter}
        onFilterChange={setFilter}
        isCoach={isCoach}
        currentPlayerId={player?.id || null}
        selectedTeamId={selectedTeamId}
        loading={loading}
        overdueCount={overdueCount}
        players={players}
        showCreateModal={showCreateModal}
        onShowCreateModal={setShowCreateModal}
        onRefresh={fetchData}
      />
    </div>
  );
}
