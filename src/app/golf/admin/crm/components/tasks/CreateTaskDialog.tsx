'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconClipboardList, IconX } from '@/components/icons';
import { createCrmTask } from '@/app/golf/actions/crm-foundations';
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
// CreateTaskDialog — capture a new CrmTask against a coach.
// ============================================================================

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachId: string;
  /** Fired with the newly-created task. */
  onCreated?: (task: CrmTask) => void;
  /** Optional default priority (defaults to 'normal'). */
  defaultPriority?: TaskPriority;
  /** Optional default kind (defaults to 'general'). */
  defaultKind?: TaskKind;
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
  defaultPriority = 'normal',
  defaultKind = 'general',
}: CreateTaskDialogProps) {
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
      setTitle('');
      setDescription('');
      setDueAt('');
      setPriority(defaultPriority);
      setKind(defaultKind);
      setSubmitting(false);
      setError(null);
    }
  }, [open, defaultPriority, defaultKind]);

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
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
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
                  New task
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

              <p className="text-eyebrow text-text-tertiary">
                Assigned to you — appears in your Inbox &quot;Due today&quot; list.
              </p>

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
                {submitting ? 'Creating...' : 'Create task'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
