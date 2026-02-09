'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { IconClipboardList } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getTeamTasks, getPlayerTasks, getTaskAssignments } from '@/app/baseball/actions/tasks';
import type { BaseballTask } from '@/app/baseball/actions/tasks';
import { TasksList } from '@/components/baseball/tasks/TasksList';
import { CreateTaskModal } from '@/components/baseball/tasks/CreateTaskModal';
import { ReminderBanner } from '@/components/baseball/tasks/ReminderBanner';
import { TaskListSkeleton } from '@/components/baseball/tasks/TaskSkeleton';

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

export default function BaseballTasksPage() {
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
    t => t.due_date && new Date(t.due_date) < now && t.status !== 'completed'
  ).length;

  const filters: { value: typeof filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'overdue', label: 'Overdue' },
  ];

  return (
    <>
      <Header
        title="Tasks"
        subtitle={isCoach ? 'Create and manage team tasks' : 'Your assigned tasks'}
      >
        {isCoach && selectedTeamId && (
          <Button onClick={() => setShowCreateModal(true)}>
            Create Task
          </Button>
        )}
      </Header>

      <div className="p-6 lg:p-8">
        {/* Overdue reminder */}
        {overdueCount > 0 && !loading && (
          <ReminderBanner
            overdueCount={overdueCount}
            onViewOverdue={() => setFilter('overdue')}
            className="mb-6"
          />
        )}

        {/* Filters */}
        {!loading && tasks.length > 0 && (
          <div className="flex gap-2 mb-6">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  filter === f.value
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <TaskListSkeleton />
        ) : !selectedTeamId ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconClipboardList size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Team Selected</h3>
              <p className="text-slate-500 max-w-sm mx-auto">
                Please select a team from the sidebar to view tasks.
              </p>
            </CardContent>
          </Card>
        ) : (
          <TasksList
            tasks={tasks}
            filter={filter}
            isCoach={isCoach}
            currentPlayerId={player?.id || null}
            onRefresh={fetchData}
          />
        )}
      </div>

      {/* Create Task Modal */}
      {isCoach && selectedTeamId && (
        <CreateTaskModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onTaskCreated={fetchData}
          teamId={selectedTeamId}
          players={players}
        />
      )}
    </>
  );
}
