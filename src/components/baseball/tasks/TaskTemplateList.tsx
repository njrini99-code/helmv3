'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconPlus, IconTrash, IconEdit, IconCheck, IconX } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  getTaskTemplates,
  createTaskTemplate,
  deleteTaskTemplate,
  updateTaskTemplate,
  seedDefaultTemplates,
  type BaseballTaskTemplate,
} from '@/app/baseball/actions/tasks';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'academic', label: 'Academic' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'practice', label: 'Practice' },
  { value: 'game_prep', label: 'Game Prep' },
];

const categoryColors: Record<string, string> = {
  general: 'bg-slate-100 text-slate-700',
  conditioning: 'bg-red-100 text-red-700',
  academic: 'bg-amber-100 text-amber-700',
  administrative: 'bg-blue-100 text-blue-700',
  practice: 'bg-green-100 text-green-700',
  game_prep: 'bg-purple-100 text-purple-700',
  default: 'bg-slate-100 text-slate-700',
};

interface TaskTemplateListProps {
  teamId: string;
  onSelectTemplate: (template: BaseballTaskTemplate) => void;
}

export function TaskTemplateList({ teamId, onSelectTemplate }: TaskTemplateListProps) {
  const [templates, setTemplates] = useState<BaseballTaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BaseballTaskTemplate | null>(null);
  const { showToast } = useToast();

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formDueDays, setFormDueDays] = useState<number | ''>('');
  const [formPriority, setFormPriority] = useState('normal');
  const [formAssigneeType, setFormAssigneeType] = useState('all_players');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function loadTemplates() {
    setLoading(true);

    // Seed defaults if needed
    await seedDefaultTemplates(teamId);

    const result = await getTaskTemplates(teamId);
    if (result.success && result.data) {
      setTemplates(result.data);
    }
    setLoading(false);
  }

  function resetForm() {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('general');
    setFormDueDays('');
    setFormPriority('normal');
    setFormAssigneeType('all_players');
    setShowCreateForm(false);
    setEditingTemplate(null);
  }

  function startEditing(template: BaseballTaskTemplate) {
    setEditingTemplate(template);
    setFormTitle(template.title);
    setFormDescription(template.description || '');
    setFormCategory(template.category || 'general');
    setFormDueDays(template.default_due_days || '');
    setFormPriority(template.default_priority || 'normal');
    setFormAssigneeType(template.default_assignee_type);
    setShowCreateForm(true);
  }

  function formatCategoryLabel(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
        const result = await updateTaskTemplate(editingTemplate.id, {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          category: formCategory || undefined,
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
        const result = await createTaskTemplate(teamId, {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          default_assignee_type: formAssigneeType,
          category: formCategory || undefined,
          default_priority: formPriority,
          default_due_days: formDueDays !== '' ? Number(formDueDays) : undefined,
        });

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

  async function handleDelete(templateId: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;

    const result = await deleteTaskTemplate(templateId);
    if (result.success) {
      showToast('Template deleted', 'success');
      loadTemplates();
    } else {
      showToast(result.error || 'Failed to delete template', 'error');
    }
  }

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, template) => {
    const cat = template.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, BaseballTaskTemplate[]>);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Task Templates</h3>
        {!showCreateForm && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowCreateForm(true)}
          >
            <IconPlus size={14} />
            New
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
            transition={{ duration: 0.2 }}
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-slate-900">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </p>
              <button
                type="button"
                onClick={resetForm}
                className="p-1 rounded-full hover:bg-slate-100"
              >
                <IconX size={16} className="text-slate-400" />
              </button>
            </div>

            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Template title"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                       focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />

            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none
                       focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white
                           focus:border-green-500 focus:ring-2 focus:ring-green-100"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Default Due (days)</label>
                <input
                  type="number"
                  value={formDueDays}
                  onChange={(e) => setFormDueDays(e.target.value ? Number(e.target.value) : '')}
                  min={1}
                  placeholder="e.g., 7"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                           focus:border-green-500 focus:ring-2 focus:ring-green-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Priority</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white
                           focus:border-green-500 focus:ring-2 focus:ring-green-100"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Assign To</label>
                <select
                  value={formAssigneeType}
                  onChange={(e) => setFormAssigneeType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white
                           focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
        <div className="text-center py-8">
          <p className="text-slate-500 text-sm">No templates yet</p>
          <p className="text-slate-400 text-xs mt-1">
            Create templates to quickly add common tasks
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedTemplates).map(([cat, catTemplates]) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {formatCategoryLabel(cat)}
              </p>
              <div className="space-y-2">
                {catTemplates.map((template, index) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative bg-white rounded-lg border border-slate-200 p-3
                             hover:border-green-200 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => onSelectTemplate(template)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-slate-900 text-sm">
                            {template.title}
                          </h4>
                          {template.category && (
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-xs font-medium',
                                categoryColors[template.category] || categoryColors.default
                              )}
                            >
                              {formatCategoryLabel(template.category)}
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {template.default_due_days && (
                            <span className="text-xs text-slate-400">
                              Due in {template.default_due_days} days
                            </span>
                          )}
                          {template.default_priority && template.default_priority !== 'normal' && (
                            <span className={cn(
                              'text-xs font-medium',
                              template.default_priority === 'high' && 'text-red-600'
                            )}>
                              {template.default_priority.charAt(0).toUpperCase() + template.default_priority.slice(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions (shown on hover) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(template);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <IconEdit size={14} className="text-slate-400" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(template.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <IconTrash size={14} className="text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
