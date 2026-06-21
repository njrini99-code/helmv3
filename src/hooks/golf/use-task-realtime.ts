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
 * Per-task assignment row (one per assigned player) — the SOURCE OF TRUTH for
 * who a task is assigned to and whether they've completed it. golf_tasks.assigned_to
 * is NEVER written by create/complete; the M:N golf_task_assignments join is.
 */
export interface TaskAssignment {
  id: string;
  status: string;
  completed_at: string | null;
  player: {
    first_name: string;
    last_name: string;
  };
}

/**
 * Task with assignment-derived completion info.
 * Based on golf_tasks + its golf_task_assignments rows.
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
  /**
   * Effective status. For a player view this is the player's OWN assignment
   * status; for a coach view it's 'completed' only when every assignee has
   * completed, else the task's own status (pending/in_progress).
   */
  status: TaskStatus;
  task_type: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_overdue: boolean;
  reminder_at: string | null;
  reminder_sent: boolean;
  category: string | null;
  /** Per-player assignment rows — drives coach N-of-M progress + the legacy card. */
  assignments: TaskAssignment[];
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

const EMPTY_STATS: TaskStats = {
  total_tasks: 0,
  completed_tasks: 0,
  pending_tasks: 0,
  in_progress_tasks: 0,
  overdue_tasks: 0,
  completion_rate: 0,
};

/** Shape of an assignment row joined with its player (coach query). */
interface AssignmentRowWithPlayer {
  id: string;
  task_id: string;
  player_id: string;
  status: string | null;
  completed_at: string | null;
  player: { id: string; first_name: string | null; last_name: string | null } | null;
}

/** Shape of a task row joined with its assignments (player query). */
interface PlayerAssignmentRow {
  id: string;
  status: string | null;
  completed_at: string | null;
  task: TaskRow | null;
}

interface TaskRow {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  task_type: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  reminder_at: string | null;
  reminder_sent: boolean | null;
  category: string | null;
}

const TASK_COLUMNS =
  'id, team_id, title, description, assigned_to, assigned_by, due_date, priority, status, task_type, completed_at, created_at, updated_at, reminder_at, reminder_sent, category';

/**
 * Hook for real-time task updates — UNIFIED on golf_task_assignments.
 *
 * The READ model keys on the M:N golf_task_assignments join (the table that
 * create/complete actually write), NOT golf_tasks.assigned_to (which is never
 * written). Without this, players see an empty tab and coaches see "0 of 0".
 *
 * Subscribes to:
 * - golf_tasks: new/edited/deleted tasks
 * - golf_task_assignments: assignment + completion changes (the real signal)
 *
 * @param teamId - The team ID to get tasks for
 * @param options - Filter options
 */
export function useTaskRealtime(
  teamId: string | null,
  options?: {
    /** The viewing player's id. When set (player view), tasks are listed from
     *  this player's assignment rows and status reflects their own progress. */
    playerId?: string | null;
    /** Only show incomplete tasks */
    incompleteOnly?: boolean;
    /** Player view: list ONLY tasks assigned to this player (vs all team tasks). */
    assignedToPlayerOnly?: boolean;
  }
): UseTaskRealtimeResult {
  const [tasks, setTasks] = useState<TaskWithPlayer[]>([]);
  const [stats, setStats] = useState<TaskStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const playerId = options?.playerId ?? null;
  const incompleteOnly = options?.incompleteOnly ?? false;
  const assignedToPlayerOnly = options?.assignedToPlayerOnly ?? false;
  // Player view = we have a playerId AND we're scoping to that player's tasks.
  const isPlayerView = !!playerId && assignedToPlayerOnly;

  const fetchTasks = useCallback(async () => {
    if (!teamId) {
      setTasks([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      let transformedTasks: TaskWithPlayer[] = [];

      if (isPlayerView) {
        // ── PLAYER VIEW ─────────────────────────────────────────────────────
        // List the tasks assigned to THIS player by joining from their
        // assignment rows up to golf_tasks. Status = the player's own
        // assignment status (so completion reflects immediately).
        const { data: rows, error: rowsError } = await supabase
          .from('golf_task_assignments')
          .select(`id, status, completed_at, task:golf_tasks!golf_task_assignments_task_id_fkey(${TASK_COLUMNS})`)
          .eq('player_id', playerId!)
          .order('created_at', { ascending: false });

        if (rowsError) throw rowsError;

        transformedTasks = ((rows as unknown as PlayerAssignmentRow[]) || [])
          .filter((row) => row.task && row.task.team_id === teamId)
          .map((row) => {
            const task = row.task!;
            const status: TaskStatus = row.status || 'pending';
            const dueDate = task.due_date ? new Date(task.due_date) : null;
            const isOverdue = !!dueDate && dueDate < now && status !== 'completed';
            return {
              id: task.id,
              team_id: task.team_id,
              title: task.title,
              description: task.description,
              assigned_to: task.assigned_to,
              assigned_to_name: null,
              assigned_by: task.assigned_by,
              due_date: task.due_date,
              priority: task.priority as TaskPriority,
              status,
              task_type: task.task_type,
              completed_at: row.completed_at,
              created_at: task.created_at,
              updated_at: task.updated_at,
              is_overdue: isOverdue,
              reminder_at: task.reminder_at || null,
              reminder_sent: task.reminder_sent || false,
              category: task.category || null,
              // The player view exposes the viewer's own single assignment so
              // the card can reason about completion without a fake 0/0.
              assignments: [
                {
                  id: row.id,
                  status,
                  completed_at: row.completed_at,
                  player: { first_name: '', last_name: '' },
                },
              ],
            };
          });
      } else {
        // ── COACH / TEAM VIEW ────────────────────────────────────────────────
        // List the team's tasks, then attach real per-player assignment rows so
        // coach progress reads N-of-M honestly. Status rolls up to 'completed'
        // only when every assignee has completed.
        const { data: taskRows, error: tasksError } = await supabase
          .from('golf_tasks')
          .select(TASK_COLUMNS)
          .eq('team_id', teamId)
          .order('due_date', { ascending: true, nullsFirst: false });

        if (tasksError) throw tasksError;

        const taskList = (taskRows as unknown as TaskRow[]) || [];
        const taskIds = taskList.map((t) => t.id);

        // Fetch all assignment rows for these tasks (joined with player names).
        const assignmentsByTask = new Map<string, TaskAssignment[]>();
        if (taskIds.length > 0) {
          const { data: assignRows, error: assignError } = await supabase
            .from('golf_task_assignments')
            .select('id, task_id, player_id, status, completed_at, player:golf_players!golf_task_assignments_player_id_fkey(id, first_name, last_name)')
            .in('task_id', taskIds);

          if (assignError) throw assignError;

          for (const a of (assignRows as unknown as AssignmentRowWithPlayer[]) || []) {
            const list = assignmentsByTask.get(a.task_id) ?? [];
            list.push({
              id: a.id,
              status: a.status || 'pending',
              completed_at: a.completed_at,
              player: {
                first_name: a.player?.first_name || '',
                last_name: a.player?.last_name || '',
              },
            });
            assignmentsByTask.set(a.task_id, list);
          }
        }

        transformedTasks = taskList.map((task) => {
          const assignments = assignmentsByTask.get(task.id) ?? [];
          const total = assignments.length;
          const completed = assignments.filter((a) => a.status === 'completed').length;
          // A task is "completed" when it has assignees and ALL have completed,
          // OR (no assignees / team-wide) when the task's own status says so.
          const allDone = total > 0 && completed === total;
          const status: TaskStatus = allDone ? 'completed' : task.status || 'pending';
          const dueDate = task.due_date ? new Date(task.due_date) : null;
          const isOverdue = !!dueDate && dueDate < now && status !== 'completed';
          return {
            id: task.id,
            team_id: task.team_id,
            title: task.title,
            description: task.description,
            assigned_to: task.assigned_to,
            assigned_to_name: null,
            assigned_by: task.assigned_by,
            due_date: task.due_date,
            priority: task.priority as TaskPriority,
            status,
            task_type: task.task_type,
            completed_at: task.completed_at,
            created_at: task.created_at,
            updated_at: task.updated_at,
            is_overdue: isOverdue,
            reminder_at: task.reminder_at || null,
            reminder_sent: task.reminder_sent || false,
            category: task.category || null,
            assignments,
          };
        });
      }

      // Optional incomplete-only filter (applied after status resolution).
      if (incompleteOnly) {
        transformedTasks = transformedTasks.filter((t) => t.status !== 'completed');
      }

      // Compute stats from the resolved status of each task.
      let completedCount = 0;
      let pendingCount = 0;
      let inProgressCount = 0;
      let overdueCount = 0;
      for (const t of transformedTasks) {
        if (t.status === 'completed') completedCount++;
        else if (t.status === 'in_progress') inProgressCount++;
        else if (t.is_overdue) overdueCount++;
        else pendingCount++;
      }

      setTasks(transformedTasks);
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
  }, [teamId, playerId, isPlayerView, incompleteOnly, supabase]);

  useEffect(() => {
    fetchTasks();

    if (!teamId) return;

    // Real-time: tasks change (new/edited/deleted) AND — crucially —
    // assignment rows change (a player completing a task). The assignment
    // table has no team_id column to filter on, so it's subscribed unfiltered
    // and fetchTasks re-derives the team-scoped view (which is RLS-bounded).
    const channel = supabase
      .channel(`tasks-${teamId}`)
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_task_assignments',
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
