'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconPlus, IconTrash, IconEdit, IconCheck, IconX, IconClipboardList } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Shimmer } from '@/components/ui/shimmer';
import { cn } from '@/lib/utils';
import {
  getTaskTemplates,
  createTaskTemplate,
  deleteTaskTemplate,
  updateTaskTemplate,
  seedDefaultTemplates,
  type TaskTemplate,
} from '@/app/golf/actions/tasks';

interface TaskTemplateListProps {
  teamId: string;
  onSelectTemplate: (template: TaskTemplate) => void;
}

const categoryColors: Record<string, string> = {
  Equipment: 'bg-blue-100 text-blue-700',
  Tournament: 'bg-purple-100 text-purple-700',
  Practice: 'bg-primary-100 text-primary-700',
  Travel: 'bg-amber-100 text-amber-700',
  Fitness: 'bg-red-100 text-red-700',
  Training: 'bg-cyan-100 text-cyan-700',
  default: 'bg-warm-100 text-warm-700',
};

export function TaskTemplateList({ teamId, onSelectTemplate }: TaskTemplateListProps) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const { showToast } = useToast();

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDueDays, setFormDueDays] = useState<number | ''>('');
  const [formPriority, setFormPriority] = useState('normal');
  const [formAssigneeType, setFormAssigneeType] = useState('all_players');
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);

    // First seed defaults if needed
    await seedDefaultTemplates(teamId);

    const result = await getTaskTemplates(teamId);
    if (result.success && result.data) {
      setTemplates(result.data);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function resetForm() {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('');
    setFormDueDays('');
    setFormPriority('normal');
    setFormAssigneeType('all_players');
    setShowCreateForm(false);
    setEditingTemplate(null);
  }

  function startEditing(template: TaskTemplate) {
    setEditingTemplate(template);
    setFormTitle(template.title);
    setFormDescription(template.description || '');
    setFormCategory(template.category || '');
    setFormDueDays(template.default_due_days || '');
    setFormPriority(template.default_priority || 'normal');
    setFormAssigneeType(template.default_assignee_type);
    setShowCreateForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formTitle.trim()) {
      showToast('Template title is required', 'error');
      return;
    }

    setSubmitting(true);

    try {
      if (editingTemplate) {
        // Update existing
        const result = await updateTaskTemplate(editingTemplate.id, {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          category: formCategory.trim() || undefined,
          defaultDueDays: formDueDays !== '' ? Number(formDueDays) : null,
          defaultPriority: formPriority,
          defaultAssigneeType: formAssigneeType,
        });

        if (result.success) {
          showToast('Template updated', 'success');
          resetForm();
          loadTemplates();
        } else {
          showToast(result.error || 'Failed to update template', 'error');
        }
      } else {
        // Create new
        const result = await createTaskTemplate(
          teamId,
          formTitle.trim(),
          formDescription.trim() || undefined,
          formAssigneeType,
          formCategory.trim() || undefined,
          formPriority,
          formDueDays !== '' ? Number(formDueDays) : undefined
        );

        if (result.success) {
          showToast('Template created', 'success');
          resetForm();
          loadTemplates();
        } else {
          showToast(result.error || 'Failed to create template', 'error');
        }
      }
    } catch {
      showToast('An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(templateId: string) {
    setPendingDeleteId(templateId);
  }

  async function confirmDeleteTemplate() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setIsDeleting(true);
    try {
      const result = await deleteTaskTemplate(id);
      if (result.success) {
        showToast('Template deleted', 'success');
        loadTemplates();
      } else {
        showToast(result.error || 'Failed to delete template', 'error');
      }
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  }

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, TaskTemplate[]>);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Shimmer key={i} staggerIndex={i - 1} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">Task Templates</h3>
        {!showCreateForm && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowCreateForm(true)}
          >
            <IconPlus size={14} />
            New Template
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
            style={{ overflow: 'hidden' }}
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-warm-200 p-4 space-y-3"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-warm-900">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </p>
              <IconButton variant="default"
                type="button"
                onClick={resetForm}
                className="p-1 rounded-full hover:bg-warm-100 transition-colors active:bg-warm-200"
                aria-label="Close form"
              >
                <IconX size={16} className="text-warm-400" />
              </IconButton>
            </div>

            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Template title"
              aria-label="Template title"
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="next"
              className="w-full px-3 py-2 rounded-lg border border-warm-200 text-base lg:text-sm min-h-[44px]
                       focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            />

            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              aria-label="Template description"
              autoCapitalize="sentences"
              autoCorrect="on"
              className="w-full px-3 py-2 rounded-lg border border-warm-200 text-base lg:text-sm resize-none
                       focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-warm-500 block mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g., Tournament"
                  list="category-suggestions"
                  aria-label="Category"
                  autoCapitalize="words"
                  autoCorrect="off"
                  enterKeyHint="next"
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 text-base lg:text-sm min-h-[44px]
                           focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                />
                <datalist id="category-suggestions">
                  <option value="Equipment" />
                  <option value="Tournament" />
                  <option value="Practice" />
                  <option value="Travel" />
                  <option value="Fitness" />
                  <option value="Training" />
                </datalist>
              </div>

              <div>
                <label className="text-xs font-medium text-warm-500 block mb-1">
                  Default Due (days)
                </label>
                <input
                  type="number"
                  value={formDueDays}
                  onChange={(e) => setFormDueDays(e.target.value ? Number(e.target.value) : '')}
                  min={1}
                  placeholder="e.g., 7"
                  aria-label="Default due days"
                  inputMode="numeric"
                  enterKeyHint="done"
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 text-base lg:text-sm min-h-[44px] tabular-nums
                           focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-warm-500 block mb-1">
                  Priority
                </label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  aria-label="Priority"
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 text-base lg:text-sm min-h-[44px] bg-white
                           focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-warm-500 block mb-1">
                  Assign To
                </label>
                <select
                  value={formAssigneeType}
                  onChange={(e) => setFormAssigneeType(e.target.value)}
                  aria-label="Assign to"
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 text-base lg:text-sm min-h-[44px] bg-white
                           focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                >
                  <option value="all_players">All Players</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting}>
                <IconCheck size={14} />
                {editingTemplate ? 'Update' : 'Create'}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Templates List */}
      {Object.keys(groupedTemplates).length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<IconClipboardList size={28} />}
          title="No templates yet"
          description="Create templates to quickly add common tasks."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category}>
              <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-2">
                {category}
              </p>
              <div className="space-y-2">
                {categoryTemplates.map((template, index) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative bg-white rounded-lg border border-warm-200 p-3
                             hover:border-primary-200 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => onSelectTemplate(template)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-warm-900 text-sm">
                            {template.title}
                          </h4>
                          {template.category && (
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-xs font-medium',
                                categoryColors[template.category] || categoryColors.default
                              )}
                            >
                              {template.category}
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-xs text-warm-500 line-clamp-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {template.default_due_days && (
                            <span className="text-xs text-warm-400">
                              Due in {template.default_due_days} days
                            </span>
                          )}
                          {template.default_priority && template.default_priority !== 'normal' && (
                            <span className={cn(
                              'text-xs font-medium',
                              template.default_priority === 'high' && 'text-amber-600',
                              template.default_priority === 'urgent' && 'text-red-600'
                            )}>
                              {template.default_priority.charAt(0).toUpperCase() + template.default_priority.slice(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions (shown on hover) */}
                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <IconButton variant="default"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(template);
                          }}
                          className="p-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 transition-colors"
                          aria-label="Edit template"
                        >
                          <IconEdit size={14} className="text-warm-400" />
                        </IconButton>
                        <IconButton variant="default"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(template.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          aria-label="Delete template"
                        >
                          <IconTrash size={14} className="text-warm-400 hover:text-red-500" />
                        </IconButton>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete template?"
        message="Are you sure you want to delete this template? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={() => { void confirmDeleteTemplate(); }}
        onCancel={() => {
          if (!isDeleting) setPendingDeleteId(null);
        }}
      />
    </div>
  );
}
