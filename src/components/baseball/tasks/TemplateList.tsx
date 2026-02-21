'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getTaskTemplates, deleteTaskTemplate, type BaseballTaskTemplate } from '@/app/baseball/actions/tasks';
import { IconPlus, IconTrash, IconEdit } from '@/components/icons';
import { useToast } from '@/components/ui/toast';

const categoryColors: Record<string, string> = {
  general: 'bg-slate-50 text-slate-700 border-slate-100',
  conditioning: 'bg-red-50 text-red-700 border-red-100',
  academic: 'bg-amber-50 text-amber-700 border-amber-100',
  administrative: 'bg-blue-50 text-blue-700 border-blue-100',
  practice: 'bg-primary-50 text-primary-700 border-primary-100',
  game_prep: 'bg-purple-50 text-purple-700 border-purple-100',
};

interface TemplateListProps {
  teamId: string;
  onEditTemplate?: (template: BaseballTaskTemplate) => void;
  onCreateTemplate?: () => void;
  onSelectTemplate?: (template: BaseballTaskTemplate) => void;
  className?: string;
}

export function TemplateList({
  teamId,
  onEditTemplate,
  onCreateTemplate,
  onSelectTemplate,
  className,
}: TemplateListProps) {
  const [templates, setTemplates] = useState<BaseballTaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { showToast } = useToast();

  useEffect(() => {
    fetchTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function fetchTemplates() {
    setLoading(true);
    const result = await getTaskTemplates(teamId);
    if (result.success && result.data) {
      setTemplates(result.data);
    } else {
      setError(result.error || 'Failed to load templates');
    }
    setLoading(false);
  }

  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  const categories = ['all', ...new Set(templates.map((t) => t.category).filter(Boolean) as string[])];

  function formatCategoryLabel(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  async function handleDelete(templateId: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;

    const result = await deleteTaskTemplate(templateId);
    if (result.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      showToast('Template deleted', 'success');
    } else {
      showToast(result.error || 'Failed to delete template', 'error');
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <div className="animate-spin h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full" />
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
          <h3 className="text-lg font-semibold text-slate-900">Task Templates</h3>
          <p className="text-sm text-slate-500">
            Create tasks quickly using pre-defined templates
          </p>
        </div>
        {onCreateTemplate && (
          <button
            onClick={onCreateTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 active:bg-primary-800 shadow-sm transition-colors"
          >
            <IconPlus size={16} />
            New Template
          </button>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border whitespace-nowrap transition-colors',
                selectedCategory === cat
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              )}
            >
              {cat === 'all' ? 'All Templates' : formatCategoryLabel(cat)}
            </button>
          ))}
        </div>
      )}

      {/* Templates list */}
      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <IconPlus size={24} className="text-slate-400" />
          </div>
          <h3 className="text-base font-medium text-slate-900 mb-1">No templates yet</h3>
          <p className="text-sm text-slate-500 mb-4 max-w-sm">
            Create templates to quickly assign common tasks to your team.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => onSelectTemplate?.(template)}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-primary-200 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-900 truncate">{template.title}</h4>
                  {template.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {template.category && (
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border',
                        categoryColors[template.category] || categoryColors.general
                      )}>
                        {formatCategoryLabel(template.category)}
                      </span>
                    )}
                    {template.default_due_days && (
                      <span className="text-xs text-slate-500">
                        Due in {template.default_due_days} day{template.default_due_days !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {onEditTemplate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTemplate(template);
                      }}
                      className="p-2 text-slate-500 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors"
                      title="Edit template"
                    >
                      <IconEdit size={16} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(template.id);
                    }}
                    className="p-2 text-slate-500 hover:bg-red-50 active:bg-red-100 hover:text-red-600 rounded-lg transition-colors"
                    title="Delete template"
                  >
                    <IconTrash size={16} />
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
