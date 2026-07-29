'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconClipboardList, IconX } from '@/components/icons';
import { createCrmTask, updateCrmTask } from '@/app/golf/actions/crm-foundations';
import { createClient } from '@/lib/supabase/client';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type {
  CrmTask,
  TaskKind,
  TaskPriority,
} from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// CreateTaskDialog — capture a new CrmTask against a coach, or edit one.
// ============================================================================
// 2026-07-29: `updateCrmTask` had been written, tested and revalidate-wired for
// months with ZERO callers, so a task was immutable once saved — the only verb
// the UI offered was "complete". A typo in a title, a due date set to the wrong
// day, a priority that turned out to be urgent: all permanent. Passing `task`
// puts this dialog in edit mode instead of adding a second near-identical one,
// the same shape ScheduleEventModal uses for its `event` prop.

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachId: string;
  /** Fired with the newly-created task. */
  onCreated?: (task: CrmTask) => void;
  /**
   * When set, the dialog edits this task instead of creating one: fields
   * prefill from it and submit calls updateCrmTask.
   */
  task?: CrmTask | null;
  /** Fired with the updated task after a successful edit. */
  onUpdated?: (task: CrmTask) => void;
  /** Optional default priority (defaults to 'normal'). */
  defaultPriority?: TaskPriority;
  /** Optional default kind (defaults to 'general'). */
  defaultKind?: TaskKind;
}

/**
 * ISO instant -> the `YYYY-MM-DDTHH:mm` a datetime-local input expects, in LOCAL
 * time.
 *
 * Deliberately not `iso.slice(0, 16)` or `toISOString().slice(0, 16)`: both hand
 * back UTC, so opening the editor on a task due 9:00am would display it shifted
 * by the offset (4pm in UTC+7, or the previous evening in UTC-5) and saving
 * without touching the field would silently MOVE the due date. Round-tripping
 * has to be a no-op.
 */
function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const KIND_OPTIONS: TaskKind[] = [
  'general',
  'follow_up',
  'call',
  'demo',
  'email',
  'research',
];
const KIND_LABEL: Record<TaskKind, string> = {
  general: 'General',
  follow_up: 'Follow-up',
  call: 'Call',
  demo: 'Demo',
  email: 'Email',
  research: 'Research',
};

export function CreateTaskDialog({
  open,
  onOpenChange,
  coachId,
  onCreated,
  task,
  onUpdated,
  defaultPriority = 'normal',
  defaultKind = 'general',
}: CreateTaskDialogProps) {
  const isEdit = !!task;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(defaultPriority);
  const [kind, setKind] = useState<TaskKind>(defaultKind);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Edit mode prefills from the task; create mode starts blank. Keyed on
      // task.id so reopening the dialog on a DIFFERENT task refreshes the fields
      // rather than showing the previous one's values.
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setDueAt(task?.due_at ? toLocalDateTimeInput(task.due_at) : '');
      setPriority(task?.priority ?? defaultPriority);
      setKind(task?.kind ?? defaultKind);
      setSubmitting(false);
      setError(null);
    }
  }, [
    open,
    defaultPriority,
    defaultKind,
    task?.id,
    task?.title,
    task?.description,
    task?.due_at,
    task?.priority,
    task?.kind,
  ]);

  // Resolve the acting admin so new tasks self-assign by default — without
  // this, assignee_id stays null and the task can never surface in the
  // creator's own "due today" inbox (listMyDueTasks filters on assignee_id).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }

    let dueIso: string | null = null;
    if (dueAt) {
      const date = new Date(dueAt);
      if (Number.isNaN(date.getTime())) {
        setError('Invalid due date');
        return;
      }
      dueIso = date.toISOString();
    }

    setSubmitting(true);
    setError(null);
    try {
      if (task) {
        // Only the five editable fields. status / completed_at stay out of the
        // patch on purpose — completion is completeCrmTask's job, and letting an
        // edit reopen a completed task would make the two paths fight over the
        // same columns. (updateCrmTask also strips id/created_by/created_at
        // server-side, so this is belt-and-braces.)
        const updated = await updateCrmTask(task.id, {
          title: trimmedTitle,
          description: description.trim() || null,
          due_at: dueIso,
          priority,
          kind,
        });
        onUpdated?.(updated);
      } else {
        const created = await createCrmTask({
          coach_id: coachId,
          assignee_id: currentUserId,
          title: trimmedTitle,
          description: description.trim() || null,
          due_at: dueIso,
          status: 'pending',
          priority,
          kind,
          source: 'manual',
          reminder_at: null,
          metadata: {},
        });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${task ? 'update' : 'create'} task`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog */}
      <div
        className="fixed inset-0 z-50 bg-nav-bg/35"
        onClick={() => onOpenChange(false)}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-title"
          className="w-full max-w-md bg-surface rounded-card border border-border-subtle shadow-raise pointer-events-auto"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-fw-sm bg-accent-50 flex items-center justify-center">
                  <IconClipboardList size={16} className="text-accent-700" />
                </span>
                <h2 id="create-task-title" className="text-base font-semibold text-text-primary">
                  {isEdit ? 'Edit task' : 'New task'}
                </h2>
              </div>
              <IconButton variant="default"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
              >
                <IconX size={14} />
              </IconButton>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label htmlFor="task-title" className="block text-xs font-medium text-text-secondary mb-1">
                  Title <span className="text-fw-danger">*</span>
                </label>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                <Input autoFocus
                  id="task-title"
                  type="text"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Follow up on demo invite"
                />
              </div>

              <div>
                <label htmlFor="task-description" className="block text-xs font-medium text-text-secondary mb-1">
                  Description <span className="text-text-tertiary font-normal">(optional)</span>
                </label>
                <Textarea
                  id="task-description"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Context or next steps"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Select
                    label="Priority"
                    options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
                    value={priority}
                    onChange={(v) => setPriority(v as TaskPriority)}
                  />
                </div>

                <div>
                  <Select
                    label="Kind"
                    options={KIND_OPTIONS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                    value={kind}
                    onChange={(v) => setKind(v as TaskKind)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="task-due" className="block text-xs font-medium text-text-secondary mb-1">
                  Due <span className="text-text-tertiary font-normal">(optional)</span>
                </label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>

              {!isEdit && (
                <p className="text-eyebrow text-text-tertiary">
                  Assigned to you — appears in your Inbox &quot;Due today&quot; list.
                </p>
              )}

              {error && (
                <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface-sunken/60 rounded-b-card">
              <Button variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="submit"
                disabled={submitting || !title.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-fw-md shadow-flat transition-colors',
                  'bg-accent-650 text-text-on-accent hover:bg-accent-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save changes' : 'Create task'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
