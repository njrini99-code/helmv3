'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconPlus, IconFilter } from '@/components/icons';
import { CreateTaskModal } from '@/components/golf/tasks/CreateTaskModal';
import { TasksList } from '@/components/golf/tasks/TasksList';
import { TaskListSkeleton } from '@/components/golf/tasks/TaskSkeleton';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion';

type FilterType = 'all' | 'active' | 'completed';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  assignments: Array<{
    id: string;
    status: string;
    completed_at: string | null;
    player: {
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/golf/login');
        return;
      }

      // Check if coach
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('team_id')
        .eq('user_id', user.id)
        .single();

      if (coach?.team_id) {
        setUserRole('coach');
        setTeamId(coach.team_id);
        await loadCoachData(coach.team_id);
      } else {
        // Check if player
        const { data: player } = await supabase
          .from('golf_players')
          .select('team_id')
          .eq('user_id', user.id)
          .single();

        if (player?.team_id) {
          setUserRole('player');
          setTeamId(player.team_id);
          await loadPlayerData(user.id);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCoachData(teamId: string) {
    const supabase = createClient();

    // Load team players
    const { data: playersData } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('team_id', teamId)
      .order('last_name');

    if (playersData) {
      setPlayers(playersData);
    }

    // Load tasks
    const { data: tasksData } = await supabase
      .from('golf_tasks')
      .select(`
        id,
        title,
        description,
        due_date,
        created_at,
        assignments:golf_task_assignments(
          id,
          status,
          completed_at,
          player:golf_players(first_name, last_name)
        )
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (tasksData) {
      // Type the data properly from Supabase response
      // Derive status from assignments completion
      const typedTasks = tasksData.map(task => {
        // Filter valid assignments and use type assertion
        const validAssignments = Array.isArray(task.assignments)
          ? task.assignments.filter(
              (a) =>
                a !== null &&
                typeof a === 'object' &&
                'id' in a &&
                'status' in a &&
                'player' in a &&
                a.player !== null &&
                typeof a.player === 'object' &&
                !('error' in a.player)
            )
          : [];

        const completedCount = validAssignments.filter((a: any) => a.status === 'completed').length;
        const status = completedCount === validAssignments.length && validAssignments.length > 0 ? 'completed' : 'pending';

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          status: status as 'pending' | 'completed',
          created_at: task.created_at || '',
          assignments: validAssignments.map((assignment: any) => ({
            id: assignment.id,
            status: assignment.status,
            completed_at: assignment.completed_at,
            player: {
              first_name: assignment.player?.first_name || '',
              last_name: assignment.player?.last_name || ''
            }
          }))
        } as unknown as Task;
      });
      setTasks(typedTasks);
    }
  }

  async function loadPlayerData(userId: string) {
    const supabase = createClient();

    // Get player's tasks
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!player) return;

    // Use type assertion for golf_task_assignments table (not yet in types)
    const { data: assignmentsData } = await (supabase as any)
      .from('golf_task_assignments')
      .select(`
        id,
        status,
        completed_at,
        task:golf_tasks(
          id,
          title,
          description,
          due_date,
          created_at
        )
      `)
      .eq('player_id', player.id)
      .order('created_at', { ascending: false });

    if (assignmentsData && assignmentsData.length > 0) {
      // Transform to match Task interface
      const validPlayerAssignments = assignmentsData.filter(
        (assignment: any) =>
          assignment !== null &&
          typeof assignment === 'object' &&
          'task' in assignment &&
          assignment.task !== null &&
          typeof assignment.task === 'object' &&
          !('error' in assignment.task)
      );

      const playerTasks = validPlayerAssignments.map((assignment: any) => ({
        id: assignment.task.id,
        title: assignment.task.title,
        description: assignment.task.description,
        due_date: assignment.task.due_date,
        status: assignment.status as 'pending' | 'completed',
        created_at: assignment.task.created_at || '',
        assignments: [{
          id: assignment.id,
          status: assignment.status,
          completed_at: assignment.completed_at,
          player: { first_name: '', last_name: '' } // Player viewing their own tasks
        }]
      } as unknown as Task));
      setTasks(playerTasks);
    } else {
      setTasks([]);
    }
  }

  const activeCount = tasks.filter(t => t.status === 'active').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F1]">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
          </div>

          {/* Filter Skeleton */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-24 bg-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>

          {/* Tasks Skeleton */}
          <TaskListSkeleton count={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
            <p className="text-slate-500 mt-1">
              {userRole === 'coach' ? 'Assign and track player tasks' : 'View and complete your assigned tasks'}
            </p>
          </div>
          {userRole === 'coach' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <Button onClick={() => setCreateModalOpen(true)}>
                <IconPlus size={18} />
                Create Task
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 mb-6"
        >
          <motion.button
            onClick={() => setFilter('all')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-all',
              filter === 'all'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 shadow-sm'
            )}
          >
            All ({tasks.length})
          </motion.button>
          <motion.button
            onClick={() => setFilter('active')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-all',
              filter === 'active'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 shadow-sm'
            )}
          >
            Active ({activeCount})
          </motion.button>
          <motion.button
            onClick={() => setFilter('completed')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-all',
              filter === 'completed'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 shadow-sm'
            )}
          >
            Completed ({completedCount})
          </motion.button>
        </motion.div>

        {/* Tasks List */}
        <TasksList tasks={tasks} filter={filter} />
      </div>

      {/* Create Task Modal */}
      {userRole === 'coach' && teamId && (
        <CreateTaskModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onTaskCreated={loadData}
          teamId={teamId}
          players={players}
        />
      )}
    </div>
  );
}
