'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconPlus, IconClipboardList, IconChevronRight, IconChevronDown } from '@/components/icons';
import { CreateTaskModal } from '@/components/golf/tasks/CreateTaskModal';
import { TasksList } from '@/components/golf/tasks/TasksList';
import { TaskListSkeleton } from '@/components/golf/tasks/TaskSkeleton';
import { TaskTemplateList } from '@/components/golf/tasks/TaskTemplateList';
import { CreateFromTemplateModal } from '@/components/golf/tasks/CreateFromTemplateModal';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion';
import { useTaskRealtime } from '@/hooks/golf/use-task-realtime';
import type { TaskTemplate } from '@/app/golf/actions/tasks';

type FilterType = 'all' | 'active' | 'completed';

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);

  // Real-time tasks subscription
  const { tasks: realtimeTasks, stats, loading: tasksLoading, refetch } = useTaskRealtime(teamId, {
    playerId: userRole === 'player' ? playerId : undefined,
    assignedToPlayerOnly: userRole === 'player',
  });

  // Transform real-time tasks to expected format
  const tasks: Task[] = realtimeTasks.map(task => ({
    id: task.id,
    title: task.title,
    description: task.description,
    due_date: task.due_date,
    status: task.status === 'completed' ? 'completed' : 'active',
    created_at: task.created_at || '',
    reminder_at: task.reminder_at,
    category: task.category,
    assignments: task.assigned_to_name ? [{
      id: task.id,
      status: task.status || 'pending',
      completed_at: task.completed_at,
      player: {
        first_name: task.assigned_to_name.split(' ')[0] || '',
        last_name: task.assigned_to_name.split(' ').slice(1).join(' ') || '',
      }
    }] : [],
  }));

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setInitialLoading(true);
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
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (coach?.organization_id) {
        // Get team_id from golf_teams via organization_id
        const { data: orgTeam } = await supabase
          .from('golf_teams')
          .select('id')
          .eq('organization_id', coach.organization_id)
          .maybeSingle();

        if (orgTeam?.id) {
          setUserRole('coach');
          setTeamId(orgTeam.id);
          await loadPlayers(orgTeam.id);
        }
      } else {
        // Check if player - get team via golf_team_members
        const { data: player } = await supabase
          .from('golf_players')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (player?.id) {
          setPlayerId(player.id);
          const { data: teamMember } = await supabase
            .from('golf_team_members')
            .select('team_id')
            .eq('player_id', player.id)
            .maybeSingle();

          if (teamMember?.team_id) {
            setUserRole('player');
            setTeamId(teamMember.team_id);
          }
        }
      }
    } catch {
      // Error loading data - will show empty state
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadPlayers(teamId: string) {
    const supabase = createClient();

    // Load team players via golf_team_members
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    const playerIds = (teamMembers || []).map(tm => tm.player_id);

    if (playerIds.length > 0) {
      const { data: playersData } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .in('id', playerIds)
        .order('last_name');

      if (playersData) {
        setPlayers(playersData);
      }
    }
  }

  const activeCount = tasks.filter(t => t.status === 'active').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const loading = initialLoading || tasksLoading;

  if (loading) {
    return (
      <div className="min-h-full bg-[#FAF6F1]">
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
    <div className="min-h-full bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex items-center justify-between mb-8"
        >
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
              {/* Real-time indicator */}
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                Live
              </span>
            </div>
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

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tasks List - Main Column */}
          <div className="lg:col-span-2">
            <TasksList tasks={tasks} filter={filter} />
          </div>

          {/* Templates Sidebar - Coach Only */}
          {userRole === 'coach' && teamId && (
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="sticky top-6"
              >
                {/* Templates Section */}
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-lg overflow-hidden">
                  <button
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <IconClipboardList size={18} className="text-slate-600" />
                      <span className="font-semibold text-slate-900">Templates</span>
                    </div>
                    {showTemplates ? (
                      <IconChevronDown size={18} className="text-slate-400" />
                    ) : (
                      <IconChevronRight size={18} className="text-slate-400" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showTemplates && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-200"
                      >
                        <div className="p-4">
                          <TaskTemplateList
                            teamId={teamId}
                            onSelectTemplate={(template) => setSelectedTemplate(template)}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quick Stats */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-4 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-lg p-4"
                >
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Quick Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-slate-50 rounded-lg">
                      <p className="text-2xl font-semibold text-slate-900">{activeCount}</p>
                      <p className="text-xs text-slate-500">Active</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-semibold text-green-600">{completedCount}</p>
                      <p className="text-xs text-slate-500">Completed</p>
                    </div>
                  </div>
                  {stats.overdue_tasks > 0 && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg text-center">
                      <p className="text-lg font-semibold text-red-600">{stats.overdue_tasks}</p>
                      <p className="text-xs text-red-500">Overdue</p>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {userRole === 'coach' && teamId && (
        <CreateTaskModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onTaskCreated={refetch}
          teamId={teamId}
          players={players}
        />
      )}

      {/* Create From Template Modal */}
      {userRole === 'coach' && teamId && selectedTemplate && (
        <CreateFromTemplateModal
          isOpen={!!selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onTaskCreated={() => {
            refetch();
            setSelectedTemplate(null);
          }}
          template={selectedTemplate}
          teamId={teamId}
          players={players}
        />
      )}
    </div>
  );
}
