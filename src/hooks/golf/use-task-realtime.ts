'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Task priority levels (based on golf_tasks.priority)
 */
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent' | string | null;

/**
 * Task status (based on golf_tasks.status)
 */
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | string | null;

/**
 * Task with player info
 * Based on golf_tasks table schema
 */
interface TaskWithPlayer {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_by: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  task_type: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_overdue: boolean;
  reminder_at: string | null;
  reminder_sent: boolean;
  category: string | null;
}

/**
 * Task stats summary
 */
interface TaskStats {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
}

interface UseTaskRealtimeResult {
  tasks: TaskWithPlayer[];
  stats: TaskStats;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for real-time task updates
 *
 * Subscribes to:
 * - golf_tasks: For task status changes, new tasks, completions
 *
 * @param teamId - The team ID to get tasks for
 * @param options - Filter options
 */
export function useTaskRealtime(
  teamId: string | null,
  options?: {
    /** Filter by assigned player */
    playerId?: string | null;
    /** Only show incomplete tasks */
    incompleteOnly?: boolean;
    /** Only show tasks assigned to current player or all team tasks */
    assignedToPlayerOnly?: boolean;
  }
): UseTaskRealtimeResult {
  const [tasks, setTasks] = useState<TaskWithPlayer[]>([]);
  const [stats, setStats] = useState<TaskStats>({
    total_tasks: 0,
    completed_tasks: 0,
    pending_tasks: 0,
    in_progress_tasks: 0,
    overdue_tasks: 0,
    completion_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchTasks = useCallback(async () => {
    if (!teamId) {
      setTasks([]);
      setStats({
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        in_progress_tasks: 0,
        overdue_tasks: 0,
        completion_rate: 0,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build query with filters
      let query = supabase
        .from('golf_tasks')
        .select(`
          *,
          assigned_player:golf_players!golf_tasks_assigned_to_fkey(id, first_name, last_name)
        `)
        .eq('team_id', teamId);

      // Filter by assigned player if specified
      if (options?.playerId) {
        query = query.or(`assigned_to.eq.${options.playerId},assigned_to.is.null`);
      }

      // Filter to only incomplete tasks
      if (options?.incompleteOnly) {
        query = query.neq('status', 'completed');
      }

      // Only tasks assigned to specific player (excludes team-wide)
      if (options?.assignedToPlayerOnly && options?.playerId) {
        query = query.eq('assigned_to', options.playerId);
      }

      const { data: tasksData, error: tasksError } = await query
        .order('due_date', { ascending: true, nullsFirst: false });

      if (tasksError) throw tasksError;

      // Transform tasks
      const now = new Date();
      let completedCount = 0;
      let pendingCount = 0;
      let inProgressCount = 0;
      let overdueCount = 0;

      // Type assertion for task data that includes columns added via migration
      type TaskDataWithExtras = typeof tasksData[number] & {
        category?: string | null;
      };

      const transformedTasks: TaskWithPlayer[] = (tasksData || []).map((task) => {
        const taskWithExtras = task as TaskDataWithExtras;
        const assignedPlayer = task.assigned_player as { id: string; first_name: string | null; last_name: string | null } | null;

        // Calculate if overdue
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const isOverdue = dueDate && dueDate < now && task.status !== 'completed';

        // Count by status
        if (task.status === 'completed') {
          completedCount++;
        } else if (task.status === 'in_progress') {
          inProgressCount++;
        } else if (isOverdue) {
          overdueCount++;
        } else {
          pendingCount++;
        }

        return {
          id: task.id,
          team_id: task.team_id,
          title: task.title,
          description: task.description,
          assigned_to: task.assigned_to,
          assigned_to_name: assignedPlayer
            ? `${assignedPlayer.first_name || ''} ${assignedPlayer.last_name || ''}`.trim() || null
            : null,
          assigned_by: task.assigned_by,
          due_date: task.due_date,
          priority: task.priority as TaskPriority,
          status: task.status as TaskStatus,
          task_type: task.task_type,
          completed_at: task.completed_at,
          created_at: task.created_at,
          updated_at: task.updated_at,
          is_overdue: isOverdue ?? false,
          reminder_at: task.reminder_at || null,
          reminder_sent: task.reminder_sent || false,
          category: taskWithExtras.category || null,
        };
      });

      setTasks(transformedTasks);

      // Calculate stats
      const totalTasks = transformedTasks.length;
      setStats({
        total_tasks: totalTasks,
        completed_tasks: completedCount,
        pending_tasks: pendingCount,
        in_progress_tasks: inProgressCount,
        overdue_tasks: overdueCount,
        completion_rate: totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0,
      });
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [teamId, options?.playerId, options?.incompleteOnly, options?.assignedToPlayerOnly, supabase]);

  useEffect(() => {
    fetchTasks();

    if (!teamId) return;

    // Set up real-time subscription
    const channel = supabase
      .channel(`tasks-${teamId}`)
      // Listen for task changes (new tasks, updates, completions, deletions)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_tasks',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, fetchTasks, supabase]);

  return {
    tasks,
    stats,
    loading,
    error,
    refetch: fetchTasks,
  };
}
