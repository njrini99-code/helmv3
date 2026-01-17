'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  getTeamTemplates,
  deleteTemplate,
  duplicateTemplate,
  createTaskFromTemplate,
} from '@/app/golf/actions/task-templates';
import type { TaskTemplate, CreateTaskFromTemplate } from '@/lib/types/golf';

interface TemplateListProps {
  teamId: string;
  onEditTemplate?: (template: TaskTemplate) => void;
  onCreateTemplate?: () => void;
  onTaskCreated?: () => void;
  className?: string;
}

export function TemplateList({
  teamId,
  onEditTemplate,
  onCreateTemplate,
  onTaskCreated,
  className,
}: TemplateListProps) {
  const [isPending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      const { data, error } = await getTeamTemplates(teamId);
      if (error) {
        setError(error);
      } else {
        setTemplates(data || []);
      }
      setLoading(false);
    };

    fetchTemplates();
  }, [teamId]);

  // Filter templates by category
  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  // Get unique categories from templates
  const categories = ['all', ...new Set(templates.map((t) => t.category).filter(Boolean))];

  // Handle delete
  const handleDelete = (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    setActionInProgress(templateId);
    startTransition(async () => {
      const { success, error } = await deleteTemplate(templateId);
      if (success) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      } else {
        alert(error || 'Failed to delete template');
      }
      setActionInProgress(null);
    });
  };

  // Handle duplicate
  const handleDuplicate = (templateId: string) => {
    setActionInProgress(templateId);
    startTransition(async () => {
      const { data, error } = await duplicateTemplate(templateId);
      if (data) {
        setTemplates((prev) => [...prev, data]);
      } else {
        alert(error || 'Failed to duplicate template');
      }
      setActionInProgress(null);
    });
  };

  // Handle quick create task
  const handleQuickCreate = (template: TaskTemplate) => {
    setActionInProgress(template.id);
    startTransition(async () => {
      const createData: CreateTaskFromTemplate = {
        template_id: template.id,
        team_id: teamId,
      };
      const { data, error } = await createTaskFromTemplate(createData);
      if (data) {
        onTaskCreated?.();
      } else {
        alert(error || 'Failed to create task');
      }
      setActionInProgress(null);
    });
  };

  // Get category color
  const getCategoryColor = (category?: string | null): string => {
    const colors: { [key: string]: string } = {
      practice: 'bg-blue-50 text-blue-700 border-blue-100',
      tournament: 'bg-purple-50 text-purple-700 border-purple-100',
      academic: 'bg-amber-50 text-amber-700 border-amber-100',
      equipment: 'bg-gray-50 text-gray-700 border-gray-100',
      travel: 'bg-green-50 text-green-700 border-green-100',
      fitness: 'bg-cyan-50 text-cyan-700 border-cyan-100',
      mental: 'bg-purple-50 text-purple-700 border-purple-100',
      administrative: 'bg-orange-50 text-orange-700 border-orange-100',
      other: 'bg-slate-50 text-slate-700 border-slate-100',
    };
    const key = category || 'other';
    const result = colors[key];
    return result !== undefined ? result : 'bg-slate-50 text-slate-700 border-slate-100';
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <svg className="animate-spin h-6 w-6 text-brand-600" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 bg-red-50 border border-red-100 rounded-lg', className)}>
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Task Templates</h3>
          <p className="text-sm text-gray-500">
            Create tasks quickly using pre-defined templates
          </p>
        </div>
        {onCreateTemplate && (
          <button
            onClick={onCreateTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-sm transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Template
          </button>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border whitespace-nowrap transition-colors',
                selectedCategory === category
                  ? 'bg-brand-50 text-brand-700 border-brand-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
            >
              {category === 'all' ? 'All Templates' : category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Templates list */}
      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M12 18v-6M9 15h6" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-gray-900 mb-1">No templates yet</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-sm">
            Create templates to quickly assign common tasks to your team.
          </p>
          {onCreateTemplate && (
            <button
              onClick={onCreateTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-sm transition-colors"
            >
              Create First Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900 truncate">
                      {template.name}
                    </h4>
                    {template.is_active && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-brand-50 text-brand-700">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">{template.description}</p>
                  {template.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {template.category && (
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border',
                          getCategoryColor(template.category)
                        )}
                      >
                        {template.category}
                      </span>
                    )}
                    {template.default_due_days && (
                      <span className="text-xs text-gray-500">
                        Due in {template.default_due_days} day
                        {template.default_due_days !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Quick create */}
                  <button
                    onClick={() => handleQuickCreate(template)}
                    disabled={isPending && actionInProgress === template.id}
                    className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Create task from template"
                  >
                    {isPending && actionInProgress === template.id ? (
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                  </button>

                  {/* Edit */}
                  {onEditTemplate && (
                    <button
                      onClick={() => onEditTemplate(template)}
                      disabled={isPending}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Edit template"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}

                  {/* Duplicate */}
                  <button
                    onClick={() => handleDuplicate(template.id)}
                    disabled={isPending}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Duplicate template"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(template.id)}
                    disabled={isPending}
                    className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete template"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TemplateList;
