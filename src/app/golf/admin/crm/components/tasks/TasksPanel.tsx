'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconClipboardList, IconPlus } from '@/components/icons';
import { listCoachTasks } from '@/app/golf/actions/crm-foundations';
import type {
  CrmTask,
  TaskPriority,
} from '@/app/golf/admin/crm/types/foundations';
import { CreateTaskDialog } from './CreateTaskDialog';
import { TaskCard } from './TaskCard';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/fairway';

// ============================================================================
// TasksPanel — coach-scoped task list. Splits into Open and Completed sections.
// ============================================================================

interface TasksPanelProps {
  coachId: string;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function sortOpen(tasks: CrmTask[]): CrmTask[] {
  // due_at ASC NULLS LAST, priority DESC (urgent first).
  return [...tasks].sort((a, b) => {
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

function sortCompleted(tasks: CrmTask[]): CrmTask[] {
  return [...tasks].sort((a, b) => {
    const aT = a.completed_at ?? a.updated_at ?? a.created_at;
    const bT = b.completed_at ?? b.updated_at ?? b.created_at;
    return (bT || '').localeCompare(aT || '');
  });
}

export function TasksPanel({ coachId }: TasksPanelProps) {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // includeCompleted: pull both buckets in one round-trip.
      const rows = await listCoachTasks(coachId, { includeCompleted: true });
      setTasks(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = useMemo(
    () => sortOpen(tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')),
    [tasks],
  );

  const completed = useMemo(
    () => sortCompleted(tasks.filter((t) => t.status === 'completed')).slice(0, 5),
    [tasks],
  );

  const handleCreated = (created: CrmTask) => {
    setTasks((prev) => [created, ...prev]);
  };

  const handleCompleted = (next: CrmTask) => {
    setTasks((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-fw-sm bg-surface-sunken flex items-center justify-center">
            <IconClipboardList size={14} className="text-text-secondary" />
          </span>
          <h3 className="text-sm font-semibold text-text-primary">Tasks</h3>
          {!loading && open.length > 0 && (
            <span className="text-eyebrow text-text-tertiary tabular-nums">
              {open.length} open
            </span>
          )}
        </div>
        <Button variant="primary"
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-fw-sm bg-accent-650 text-text-on-accent hover:bg-accent-700 transition-colors"
        >
          <IconPlus size={12} /> New task
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 rounded-fw-md border border-border-subtle bg-surface-sunken/70 skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
          {error}
        </p>
      )}

      {!loading && !error && open.length === 0 && completed.length === 0 && (
        <div className="rounded-card border border-dashed border-border-subtle bg-surface-sunken/60">
          <EmptyState
            variant="subtle"
            icon={<IconClipboardList size={18} />}
            title="No tasks yet"
            description="Create a follow-up task for this coach."
          />
        </div>
      )}

      {!loading && !error && open.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-eyebrow font-semibold uppercase tracking-wider text-text-tertiary px-1">
            Open
          </h4>
          <div className="space-y-1.5">
            {open.map((task) => (
              <TaskCard key={task.id} task={task} onCompleted={handleCompleted} />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && completed.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-eyebrow font-semibold uppercase tracking-wider text-text-tertiary px-1">
            Recently completed
          </h4>
          <div className="space-y-1.5">
            {completed.map((task) => (
              <TaskCard key={task.id} task={task} readOnly />
            ))}
          </div>
        </section>
      )}

      <CreateTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coachId={coachId}
        onCreated={handleCreated}
      />
    </div>
  );
}
