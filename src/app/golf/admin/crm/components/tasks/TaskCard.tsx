'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  IconCheck,
  IconCheckCheck,
  IconClock,
  IconWarning,
} from '@/components/icons';
import { completeCrmTask } from '@/app/golf/actions/crm-foundations';
import { Button } from '@/components/ui/button';
import type {
  CrmTask,
  TaskKind,
  TaskPriority,
} from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// TaskCard — single CrmTask row with priority dot, due pill, kind badge.
// ============================================================================

interface TaskCardProps {
  task: CrmTask;
  /** Optional click handler, e.g. to open a detail drawer. */
  onClick?: (task: CrmTask) => void;
  /** Fired with the updated task after a successful complete. */
  onCompleted?: (task: CrmTask) => void;
  /** Hides the complete checkbox (e.g. for already-completed cards). */
  readOnly?: boolean;
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-warm-300',
  normal: 'bg-blue-400',
  high: 'bg-amber-500',
  urgent: 'bg-red-500',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const KIND_LABEL: Record<TaskKind, string> = {
  general: 'General',
  follow_up: 'Follow-up',
  call: 'Call',
  demo: 'Demo',
  email: 'Email',
  research: 'Research',
};

const KIND_TONE: Record<TaskKind, string> = {
  general: 'bg-warm-100 text-warm-700 border-warm-200',
  follow_up: 'bg-blue-50 text-blue-700 border-blue-200',
  call: 'bg-primary-50 text-primary-700 border-primary-200',
  demo: 'bg-purple-50 text-purple-700 border-purple-200',
  email: 'bg-sky-50 text-sky-700 border-sky-200',
  research: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function TaskCard({
  task,
  onClick,
  onCompleted,
  readOnly,
}: TaskCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = useMemo(() => {
    if (!task.due_at) return null;
    try {
      const date = new Date(task.due_at);
      const overdue = date.getTime() < Date.now() && task.status !== 'completed';
      return {
        label: formatDistanceToNow(date, { addSuffix: true }),
        absolute: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
        overdue,
      };
    } catch {
      return null;
    }
  }, [task.due_at, task.status]);

  const completed = task.status === 'completed' || !!task.completed_at;
  const assigneeInitials = useMemo(() => {
    if (!task.assignee_id) return null;
    return task.assignee_id.slice(0, 2).toUpperCase();
  }, [task.assignee_id]);

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await completeCrmTask(task.id);
      onCompleted?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setBusy(false);
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- role="button" with keyboard handler already present; div used to preserve layout constraints
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? () => onClick(task) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(task);
              }
            }
          : undefined
      }
      className={cn(
        'group rounded-xl border bg-cream-50 px-3 py-2.5 transition-colors',
        completed
          ? 'border-warm-200/60 opacity-70'
          : 'border-warm-200/60 hover:border-warm-300/80',
        onClick && 'cursor-pointer hover:bg-warm-50/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Complete checkbox */}
        {!readOnly && (
          <Button variant="primary"
            type="button"
            onClick={handleComplete}
            disabled={busy || completed}
            aria-label={completed ? 'Task completed' : 'Mark task complete'}
            className={cn(
              'mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors',
              completed
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-warm-300 hover:border-primary-500 hover:bg-primary-50',
            )}
          >
            {completed && <IconCheck size={10} />}
          </Button>
        )}

        {/* Priority dot */}
        <span
          className={cn(
            'mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
            PRIORITY_DOT[task.priority],
          )}
          aria-label={`Priority: ${PRIORITY_LABEL[task.priority]}`}
          title={`Priority: ${PRIORITY_LABEL[task.priority]}`}
        />

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                'text-sm font-medium leading-snug',
                completed ? 'text-warm-500 line-through' : 'text-warm-900',
              )}
            >
              {task.title}
            </p>
            {assigneeInitials && (
              <span
                title={`Assigned to ${task.assignee_id}`}
                className="flex-shrink-0 w-5 h-5 rounded-full bg-warm-100 text-eyebrow font-semibold text-warm-700 flex items-center justify-center"
              >
                {assigneeInitials}
              </span>
            )}
          </div>

          {task.description && (
            <p className="mt-0.5 text-xs text-warm-500 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center text-eyebrow font-medium px-1.5 py-0.5 rounded-full border',
                KIND_TONE[task.kind],
              )}
            >
              {KIND_LABEL[task.kind]}
            </span>

            {due && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-eyebrow font-medium px-1.5 py-0.5 rounded-full border',
                  due.overdue
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-warm-50 text-warm-700 border-warm-200',
                )}
                title={due.absolute}
              >
                {due.overdue ? <IconWarning size={9} /> : <IconClock size={9} />}
                {due.overdue ? `Overdue · ${due.label}` : `Due ${due.label}`}
              </span>
            )}

            {completed && (
              <span className="inline-flex items-center gap-1 text-eyebrow font-medium px-1.5 py-0.5 rounded-full border bg-primary-50 text-primary-700 border-primary-200">
                <IconCheckCheck size={9} /> Completed
              </span>
            )}
          </div>

          {error && (
            <p className="mt-1.5 text-eyebrow text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
