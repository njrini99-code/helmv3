'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Task priority levels (based on golf_tasks.priority)
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent' | string | null;

/**
 * Task status (based on golf_tasks.status)
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | string | null;

/**
 * Task with player info
 * Based on golf_tasks table schema
 */
export interface TaskWithPlayer {
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
export interface TaskStats {
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
  const supabase = createClient();

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
  }, [teamId, options?.playerId, options?.incompleteOnly, options?.assignedToPlayerOnly]);

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
  }, [teamId, fetchTasks]);

  return {
    tasks,
    stats,
    loading,
    error,
    refetch: fetchTasks,
  };
}

/**
 * Hook for a single task with real-time updates
 * Useful for task detail views
 *
 * @param taskId - The task ID to subscribe to
 */
export function useSingleTaskRealtime(taskId: string | null) {
  const [task, setTask] = useState<TaskWithPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchTask = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch task with assigned player
      const { data: taskData, error: taskError } = await supabase
        .from('golf_tasks')
        .select(`
          *,
          assigned_player:golf_players!golf_tasks_assigned_to_fkey(id, first_name, last_name)
        `)
        .eq('id', taskId)
        .single();

      if (taskError) throw taskError;

      // Type assertion for task data that includes columns added via migration
      const taskWithExtras = taskData as typeof taskData & { category?: string | null };
      const assignedPlayer = taskData.assigned_player as { id: string; first_name: string | null; last_name: string | null } | null;

      // Calculate if overdue
      const now = new Date();
      const dueDate = taskData.due_date ? new Date(taskData.due_date) : null;
      const isOverdue = dueDate && dueDate < now && taskData.status !== 'completed';

      setTask({
        id: taskData.id,
        team_id: taskData.team_id,
        title: taskData.title,
        description: taskData.description,
        assigned_to: taskData.assigned_to,
        assigned_to_name: assignedPlayer
          ? `${assignedPlayer.first_name || ''} ${assignedPlayer.last_name || ''}`.trim() || null
          : null,
        assigned_by: taskData.assigned_by,
        due_date: taskData.due_date,
        priority: taskData.priority as TaskPriority,
        status: taskData.status as TaskStatus,
        task_type: taskData.task_type,
        completed_at: taskData.completed_at,
        created_at: taskData.created_at,
        updated_at: taskData.updated_at,
        is_overdue: isOverdue ?? false,
        reminder_at: taskData.reminder_at || null,
        reminder_sent: taskData.reminder_sent || false,
        category: taskWithExtras.category || null,
      });
    } catch (err) {
      console.error('Error fetching task:', err);
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();

    if (!taskId) return;

    const channel = supabase
      .channel(`task-${taskId}`)
      // Listen for task updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_tasks',
          filter: `id=eq.${taskId}`,
        },
        () => {
          fetchTask();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, fetchTask]);

  return {
    task,
    loading,
    error,
    refetch: fetchTask,
  };
}

/**
 * Hook to get task counts by status for dashboard widgets
 *
 * @param teamId - The team ID
 * @param playerId - Optional player ID to filter by
 */
export function useTaskCountsRealtime(teamId: string | null, playerId?: string | null) {
  const [counts, setCounts] = useState<TaskStats>({
    total_tasks: 0,
    completed_tasks: 0,
    pending_tasks: 0,
    in_progress_tasks: 0,
    overdue_tasks: 0,
    completion_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchCounts = useCallback(async () => {
    if (!teamId) {
      setCounts({
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

    try {
      let query = supabase
        .from('golf_tasks')
        .select('status, due_date, completed_at')
        .eq('team_id', teamId);

      if (playerId) {
        query = query.or(`assigned_to.eq.${playerId},assigned_to.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const now = new Date();
      let completed = 0;
      let pending = 0;
      let inProgress = 0;
      let overdue = 0;

      (data || []).forEach(task => {
        if (task.status === 'completed') {
          completed++;
        } else if (task.status === 'in_progress') {
          inProgress++;
        } else {
          const dueDate = task.due_date ? new Date(task.due_date) : null;
          if (dueDate && dueDate < now) {
            overdue++;
          } else {
            pending++;
          }
        }
      });

      const total = (data || []).length;
      setCounts({
        total_tasks: total,
        completed_tasks: completed,
        pending_tasks: pending,
        in_progress_tasks: inProgress,
        overdue_tasks: overdue,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    } catch (err) {
      console.error('Error fetching task counts:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId, playerId]);

  useEffect(() => {
    fetchCounts();

    if (!teamId) return;

    const channel = supabase
      .channel(`task-counts-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_tasks',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, fetchCounts]);

  return { counts, loading, refetch: fetchCounts };
}

/**
 * Hook for real-time reminder updates
 */
export function useReminderRealtime(userId: string, enabled = true) {
  const [reminders, setReminders] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!enabled || !userId) return;

    const fetchReminders = async () => {
      setLoading(true);
      // Note: golf_task_reminders may not exist in generated types
      // Using type assertion for tables added via migration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('golf_task_reminders')
        .select(`
          *,
          task:golf_tasks(*)
        `)
        .eq('sent', false)
        .gte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(10);

      // Filter to user's tasks
      const filtered = (data || []).filter((r: { task?: { created_by?: string; assigned_to?: string } }) => {
        const task = r.task;
        return task && (task.created_by === userId || task.assigned_to === userId);
      });

      setReminders(filtered);
      setLoading(false);
    };

    fetchReminders();

    const channel = supabase
      .channel(`reminders:user_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_task_reminders',
        },
        () => {
          fetchReminders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enabled, supabase]);

  return { reminders, loading };
}

/**
 * Hook for real-time template updates
 */
export function useTemplateRealtime(teamId: string, enabled = true) {
  const [templates, setTemplates] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!enabled || !teamId) return;

    const fetchTemplates = async () => {
      setLoading(true);
      // Note: golf_task_templates may not exist in generated types
      // Using type assertion for tables added via migration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('golf_task_templates')
        .select('*')
        .eq('team_id', teamId)
        .order('title', { ascending: true });

      setTemplates(data || []);
      setLoading(false);
    };

    fetchTemplates();

    const channel = supabase
      .channel(`templates:team_${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_task_templates',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          fetchTemplates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, enabled, supabase]);

  return { templates, loading };
}
