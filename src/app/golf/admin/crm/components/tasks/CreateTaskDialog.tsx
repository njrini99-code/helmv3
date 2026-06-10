'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconClipboardList, IconX } from '@/components/icons';
import { createCrmTask } from '@/app/golf/actions/crm-foundations';
import { Button, IconButton } from '@/components/ui/button';
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
        assignee_id: null,
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
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-title"
          className="w-full max-w-md bg-white rounded-2xl border border-warm-200/60 shadow-2xl pointer-events-auto"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <IconClipboardList size={16} className="text-primary-600" />
                </span>
                <h2 id="create-task-title" className="text-base font-semibold text-warm-900">
                  New task
                </h2>
              </div>
              <IconButton variant="default"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
              >
                <IconX size={14} />
              </IconButton>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label htmlFor="task-title" className="block text-xs font-medium text-warm-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                <input autoFocus
                  id="task-title"
                  type="text"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Follow up on demo invite"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              <div>
                <label htmlFor="task-description" className="block text-xs font-medium text-warm-700 mb-1">
                  Description <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="task-description"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Context or next steps"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="task-priority" className="block text-xs font-medium text-warm-700 mb-1">
                    Priority
                  </label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="task-kind" className="block text-xs font-medium text-warm-700 mb-1">
                    Kind
                  </label>
                  <select
                    id="task-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as TaskKind)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="task-due" className="block text-xs font-medium text-warm-700 mb-1">
                  Due <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-100 bg-warm-50/40 rounded-b-2xl">
              <Button variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="submit"
                disabled={submitting || !title.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm transition-colors',
                  'bg-primary-600 text-white hover:bg-primary-700',
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
