'use client';

/**
 * ============================================================================
 * Fairway · Tasks · FairwayTaskTemplateList  (ADDITIVE · FLAG-GATED · COACH)
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy TaskTemplateList (the coach Templates rail).
 * Presentation rebuild on Fairway primitives; ALL template reads + writes are
 * REUSED VERBATIM via the unchanged task server actions (same import paths):
 *   seedDefaultTemplates · getTaskTemplates · createTaskTemplate ·
 *   updateTaskTemplate · deleteTaskTemplate.
 *
 * No destructive list-rebuilds: each mutation calls its single-row action and
 * then re-reads via getTaskTemplates. Delete is gated behind a ModalShell
 * confirm. Toasts use fairwayToast only. Selecting a template bubbles up so the
 * parent can open the create-from-template modal.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  Surface,
  Button,
  Chip,
  EmptyState,
  ModalShell,
  Skeleton,
  Form,
  FormField,
  Input,
  TextArea,
  NumberField,
  Select,
  fairwayToast,
} from '@/components/fairway';
import { IconPlus, IconEdit, IconTrash, IconX, IconCheck } from '@/components/icons';
import { ClipboardList } from 'lucide-react';
import {
  getTaskTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  seedDefaultTemplates,
  type TaskTemplate,
} from '@/app/golf/actions/tasks';

export interface FairwayTaskTemplateListProps {
  teamId: string;
  onSelectTemplate: (template: TaskTemplate) => void;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const ASSIGNEE_OPTIONS = [
  { value: 'all_players', label: 'All players' },
  { value: 'individual', label: 'Individual' },
];

export function FairwayTaskTemplateList({ teamId, onSelectTemplate }: FairwayTaskTemplateListProps) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [fTitle, setFTitle] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fDueDays, setFDueDays] = useState<number | null>(null);
  const [fPriority, setFPriority] = useState('normal');
  const [fAssignee, setFAssignee] = useState('all_players');
  const [submitting, setSubmitting] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    // Seed defaults once (idempotent in the action), then read.
    await seedDefaultTemplates(teamId);
    const result = await getTaskTemplates(teamId);
    if (result.success && result.data) {
      setTemplates(result.data);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  function resetForm() {
    setFTitle('');
    setFDescription('');
    setFCategory('');
    setFDueDays(null);
    setFPriority('normal');
    setFAssignee('all_players');
    setShowForm(false);
    setEditing(null);
  }

  function startEdit(t: TaskTemplate) {
    setEditing(t);
    setFTitle(t.title);
    setFDescription(t.description ?? '');
    setFCategory(t.category ?? '');
    setFDueDays(t.default_due_days ?? null);
    setFPriority(t.default_priority ?? 'normal');
    setFAssignee(t.default_assignee_type);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fTitle.trim()) {
      fairwayToast.warning('Template title is required.');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const result = await updateTaskTemplate(editing.id, {
          title: fTitle.trim(),
          description: fDescription.trim() || undefined,
          category: fCategory.trim() || undefined,
          defaultDueDays: fDueDays,
          defaultPriority: fPriority,
          defaultAssigneeType: fAssignee,
        });
        if (result.success) {
          fairwayToast.success('Template updated.');
          resetForm();
          await loadTemplates();
        } else {
          fairwayToast.error(result.error ?? 'Failed to update template.');
        }
      } else {
        const result = await createTaskTemplate(
          teamId,
          fTitle.trim(),
          fDescription.trim() || undefined,
          fAssignee,
          fCategory.trim() || undefined,
          fPriority,
          fDueDays ?? undefined,
        );
        if (result.success) {
          fairwayToast.success('Template created.');
          resetForm();
          await loadTemplates();
        } else {
          fairwayToast.error(result.error ?? 'Failed to create template.');
        }
      }
    } catch {
      fairwayToast.error('An error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await deleteTaskTemplate(pendingDelete.id);
      if (result.success) {
        fairwayToast.success('Template deleted.');
        await loadTemplates();
      } else {
        fairwayToast.error(result.error ?? 'Failed to delete template.');
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  // Group by category (same grouping as legacy).
  const grouped = templates.reduce<Record<string, TaskTemplate[]>>((acc, t) => {
    const cat = t.category || 'Uncategorized';
    (acc[cat] ??= []).push(t);
    return acc;
  }, {});

  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-2.5">
        <span className="sr-only">Loading templates…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-fw-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-fw-sans text-body font-medium text-text-primary">Task templates</p>
        {!showForm && (
          <Button variant="secondary" size="sm" onClick={() => setShowForm(true)} leftIcon={<IconPlus size={14} />}>
            New
          </Button>
        )}
      </div>

      {/* Create / edit form */}
      {showForm && (
        <Surface elevation="border" padding="sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">
              {editing ? 'Edit template' : 'New template'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetForm}
              aria-label="Close form"
              className="h-7 w-7 p-0 [@media(pointer:coarse)]:min-w-[44px]"
            >
              <IconX size={15} />
            </Button>
          </div>
          <Form spacing="cozy" onSubmit={handleSubmit}>
            <FormField label="Title" required>
              <Input
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="Template title"
                required
              />
            </FormField>
            <FormField label="Description" showOptional>
              <TextArea
                rows={2}
                value={fDescription}
                onChange={(e) => setFDescription(e.target.value)}
                placeholder="Optional"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Category" showOptional>
                <Input
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  placeholder="e.g. Tournament"
                />
              </FormField>
              <FormField label="Default due (days)" showOptional>
                <NumberField value={fDueDays} onValueChange={setFDueDays} min={1} max={365} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Priority">
                <Select
                  options={PRIORITY_OPTIONS}
                  value={fPriority}
                  onValueChange={(v) => setFPriority(v as string)}
                />
              </FormField>
              <FormField label="Assign to">
                <Select
                  options={ASSIGNEE_OPTIONS}
                  value={fAssignee}
                  onValueChange={(v) => setFAssignee(v as string)}
                />
              </FormField>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" busy={submitting} leftIcon={<IconCheck size={14} />}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </Form>
        </Surface>
      )}

      {/* Templates list */}
      {Object.keys(grouped).length === 0 ? (
        <Surface elevation="border" padding="none">
          <EmptyState
            variant="subtle"
            icon={ClipboardList}
            title="No templates yet"
            description="Create a template to quickly add common tasks."
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="flex flex-col gap-2">
              <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                {category}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((t) => (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectTemplate(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectTemplate(t);
                      }
                    }}
                    className={cn(
                      'group flex cursor-pointer items-start justify-between gap-2 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5',
                      'transition-[border-color,box-shadow] [transition-duration:180ms] hover:border-border-strong hover:shadow-soft motion-reduce:transition-none',
                      'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                          {t.title}
                        </p>
                        {t.category && (
                          <Chip tone="neutral" size="sm">
                            {t.category}
                          </Chip>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 font-fw-sans text-caption text-text-tertiary">
                          {t.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3 font-fw-sans text-caption text-text-tertiary">
                        {t.default_due_days != null && (
                          <span className="tabular-nums">Due in {t.default_due_days} days</span>
                        )}
                        {t.default_priority && t.default_priority !== 'normal' && (
                          <span className="font-medium capitalize text-text-secondary">
                            {t.default_priority}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit template"
                        className="h-7 w-7 p-0 [@media(pointer:coarse)]:min-w-[44px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(t);
                        }}
                      >
                        <IconEdit size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete template"
                        className="h-7 w-7 p-0 [@media(pointer:coarse)]:min-w-[44px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(t);
                        }}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <ModalShell
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next && !deleting) setPendingDelete(null);
        }}
        size="sm"
        title="Delete template?"
        description="This can't be undone. Tasks already created from it are unaffected."
      >
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" busy={deleting} onClick={confirmDelete}>
            Delete
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    </div>
  );
}

export default FairwayTaskTemplateList;
