'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';
import {
  IconCheck,
  IconClipboardList,
  IconClock,
  IconWarning,
} from '@/components/icons';
import {
  completeCrmTask,
  listMyDueTasks,
} from '@/app/golf/actions/crm-foundations';
import type {
  CrmTask,
  TaskPriority,
} from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// TasksDueWidget — inbox-style widget showing due-by-EOD tasks for the
// current admin user across all coaches.
// ============================================================================

interface TasksDueWidgetProps {
  /** Maximum tasks to fetch / render. Defaults to 50. */
  limit?: number;
  /** Fired when a row is clicked, e.g. to navigate to the coach detail. */
  onSelectCoach?: (coachId: string, task: CrmTask) => void;
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-warm-300',
  normal: 'bg-blue-400',
  high: 'bg-amber-500',
  urgent: 'bg-red-500',
};

export function TasksDueWidget({
  limit = 50,
  onSelectCoach,
}: TasksDueWidgetProps) {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listMyDueTasks({ byEod: true, limit });
      setTasks(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load due tasks');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buckets = useMemo(() => {
    const overdue: CrmTask[] = [];
    const today: CrmTask[] = [];
    const noDate: CrmTask[] = [];
    const now = Date.now();
    for (const t of tasks) {
      if (!t.due_at) {
        noDate.push(t);
        continue;
      }
      const dueMs = new Date(t.due_at).getTime();
      if (dueMs < now) overdue.push(t);
      else today.push(t);
    }
    return { overdue, today, noDate };
  }, [tasks]);

  const handleComplete = async (id: string) => {
    try {
      await completeCrmTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  return (
    <div className="rounded-2xl border border-warm-200/60 bg-cream-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-100">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <IconClipboardList size={14} className="text-amber-600" />
          </span>
          <h3 className="text-sm font-semibold text-warm-900">Tasks due today</h3>
          {!loading && tasks.length > 0 && (
            <span className="text-eyebrow text-warm-400 tabular-nums">
              {tasks.length}
            </span>
          )}
        </div>
        {buckets.overdue.length > 0 && (
          <span className="inline-flex items-center gap-1 text-eyebrow font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
            <IconWarning size={9} />
            {buckets.overdue.length} overdue
          </span>
        )}
      </div>

      <div className="p-3">
        {loading && (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-warm-50/60 skeleton-shimmer" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="py-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
              <IconCheck size={18} className="text-primary-500" />
            </div>
            <p className="text-sm font-medium text-warm-700">All caught up</p>
            <p className="text-xs text-warm-500 mt-1">
              Nothing due today — nice work.
            </p>
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <ul className="divide-y divide-warm-100">
            {[...buckets.overdue, ...buckets.today, ...buckets.noDate].map((task) => (
              <DueRow
                key={task.id}
                task={task}
                onComplete={() => handleComplete(task.id)}
                onClick={onSelectCoach ? () => onSelectCoach(task.coach_id, task) : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// DueRow
// ----------------------------------------------------------------------------
interface DueRowProps {
  task: CrmTask;
  onComplete: () => void;
  onClick?: () => void;
}

function DueRow({ task, onComplete, onClick }: DueRowProps) {
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = !!due && due.getTime() < Date.now();
  const dueLabel = due ? formatDistanceToNow(due, { addSuffix: true }) : null;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- role="button" with keyboard handler already present; li used to preserve list structure
    <li
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-2.5 px-2 py-2 transition-colors rounded-lg',
        onClick && 'cursor-pointer hover:bg-warm-50/60',
      )}
    >
      <IconButton variant="primary"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        aria-label="Mark complete"
        className="w-4 h-4 rounded-md border border-warm-300 hover:border-primary-500 hover:bg-primary-50 flex items-center justify-center flex-shrink-0 transition-colors"
      >
        {/* Empty checkbox visual — the label lives in aria-label; see note below. */}
        <span aria-hidden="true" />
      </IconButton>
      {/* No IconCheck here: rows in this list are always open tasks —
          handleComplete removes a task from state the instant it's marked
          done, so a completed checkmark state is never actually rendered
          (compare TaskCard, which does show it for readOnly/completed rows). */}

      <span
        className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_DOT[task.priority])}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-warm-900 truncate">
          {task.title}
        </p>
        {dueLabel && (
          <p
            className={cn(
              'text-eyebrow inline-flex items-center gap-1 mt-0.5',
              overdue ? 'text-red-600' : 'text-warm-500',
            )}
          >
            {overdue ? <IconWarning size={9} /> : <IconClock size={9} />}
            {overdue ? `Overdue · ${dueLabel}` : `Due ${dueLabel}`}
          </p>
        )}
      </div>
    </li>
  );
}
