'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  IconCheck,
  IconCheckCheck,
  IconClock,
  IconPencil,
  IconWarning,
} from '@/components/icons';
import { completeCrmTask } from '@/app/golf/actions/crm-foundations';
import { Button, IconButton } from '@/components/ui/button';
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
  /**
   * Opens the edit dialog for this task. Omit to hide the affordance — completed
   * cards pass nothing, since editing a finished task is not a workflow we want.
   */
  onEdit?: (task: CrmTask) => void;
  /** Hides the complete checkbox (e.g. for already-completed cards). */
  readOnly?: boolean;
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-border-strong',
  normal: 'bg-text-tertiary',
  high: 'bg-fw-warning',
  urgent: 'bg-fw-danger',
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
  general: 'bg-surface-sunken text-text-secondary border-border-subtle',
  follow_up: 'bg-surface-sunken text-text-secondary border-border-subtle',
  call: 'bg-accent-50 text-accent-700 border-accent-200',
  demo: 'bg-accent-50 text-accent-800 border-accent-200',
  email: 'bg-surface-sunken text-text-secondary border-border-subtle',
  research: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring',
};

export function TaskCard({
  task,
  onClick,
  onCompleted,
  onEdit,
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
        'group rounded-fw-md border bg-surface px-3 py-2.5 transition-colors',
        completed
          ? 'border-border-subtle opacity-70'
          : 'border-border-subtle hover:border-border-strong/80',
        onClick && 'cursor-pointer hover:bg-surface-sunken/40',
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
              'mt-0.5 w-4 h-4 rounded-fw-sm border flex items-center justify-center flex-shrink-0 transition-colors',
              completed
                ? 'bg-accent-650 border-accent-650 text-text-on-accent'
                : 'border-border-strong hover:border-accent-500 hover:bg-accent-50',
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
                completed ? 'text-text-tertiary line-through' : 'text-text-primary',
              )}
            >
              {task.title}
            </p>
            <div className="flex flex-shrink-0 items-center gap-1">
              {assigneeInitials && (
                <span
                  title={`Assigned to ${task.assignee_id}`}
                  className="w-5 h-5 rounded-full bg-surface-sunken text-eyebrow font-semibold text-text-secondary flex items-center justify-center"
                >
                  {assigneeInitials}
                </span>
              )}
              {/* Always rendered rather than revealed on group-hover: hover does
                  not exist on touch, and an edit affordance that only appears to
                  mouse users is the same "unreachable on mobile" bug in a
                  smaller package. Low-contrast at rest, strengthens on hover. */}
              {onEdit && !completed && (
                <IconButton
                  variant="default"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  aria-label={`Edit task: ${task.title}`}
                  className="h-7 w-7 rounded-fw-sm p-0 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary"
                >
                  <IconPencil size={12} />
                </IconButton>
              )}
            </div>
          </div>

          {task.description && (
            <p className="mt-0.5 text-xs text-text-tertiary line-clamp-2">
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
                    ? 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25'
                    : 'bg-surface-sunken text-text-secondary border-border-subtle',
                )}
                title={due.absolute}
              >
                {due.overdue ? <IconWarning size={9} /> : <IconClock size={9} />}
                {due.overdue ? `Overdue · ${due.label}` : `Due ${due.label}`}
              </span>
            )}

            {completed && (
              <span className="inline-flex items-center gap-1 text-eyebrow font-medium px-1.5 py-0.5 rounded-full border bg-accent-50 text-accent-700 border-accent-200">
                <IconCheckCheck size={9} /> Completed
              </span>
            )}
          </div>

          {error && (
            <p className="mt-1.5 text-eyebrow text-fw-danger-ink">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
