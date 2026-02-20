'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { createTemplate, updateTemplate } from '@/app/golf/actions/task-templates';
import type {
  TaskTemplate,
  TaskCategory,
} from '@/lib/types/golf';
import { TASK_CATEGORIES } from '@/lib/types/golf';

interface TemplateFormProps {
  teamId: string;
  template?: TaskTemplate; // If provided, form is in edit mode
  onSuccess?: (template: TaskTemplate) => void;
  onCancel?: () => void;
  className?: string;
}

// Use the TASK_CATEGORIES to build the options
const CATEGORIES: { value: TaskCategory; label: string }[] = Object.entries(TASK_CATEGORIES).map(
  ([value, config]) => ({
    value: value as TaskCategory,
    label: config.label,
  })
);

type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export function TemplateForm({
  teamId,
  template,
  onSuccess,
  onCancel,
  className,
}: TemplateFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch user ID on mount
  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    }
    fetchUser();
  }, []);

  // Form state - simplified to match TaskTemplate interface
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState<TaskCategory | ''>(template?.category || '');
  const [priority, setPriority] = useState<TaskPriority>(template?.default_priority || 'normal');
  const [dueOffsetDays, setDueOffsetDays] = useState<number | ''>(
    template?.default_due_days ?? ''
  );

  const isEditing = !!template;

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    if (!userId) {
      setError('Not authenticated. Please refresh and try again.');
      return;
    }

    startTransition(async () => {
      try {
        if (isEditing && template) {
          const { data, error: updateError } = await updateTemplate(template.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            category: category || undefined,
            default_priority: priority,
            default_due_days: dueOffsetDays === '' ? undefined : dueOffsetDays,
          });

          if (updateError) {
            setError(updateError);
            return;
          }

          if (data && onSuccess) {
            onSuccess(data);
          }
        } else {
          const { data, error: createError } = await createTemplate({
            team_id: teamId,
            name: name.trim(),
            description: description.trim() || undefined,
            category: category || undefined,
            default_priority: priority,
            default_due_days: dueOffsetDays === '' ? undefined : dueOffsetDays,
            created_by: userId,
          });

          if (createError) {
            setError(createError);
            return;
          }

          if (data && onSuccess) {
            onSuccess(data);
          }
        }
      } catch {
        setError('An unexpected error occurred');
      }
    });
  };

  const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-warm-100 text-warm-700' },
    { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
  ];

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Template Info Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-warm-900 pb-2 border-b border-warm-100">
          Template Information
        </h4>

        {/* Template Name */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">
            Template Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Tournament Prep Checklist"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-warm-200 rounded-lg placeholder:text-warm-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-warm-500">
            A descriptive name to identify this template
          </p>
        </div>

        {/* Template Description */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of when to use this template and what it's for..."
            rows={3}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-warm-200 rounded-lg placeholder:text-warm-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 resize-none disabled:opacity-50"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-warm-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 disabled:opacity-50"
          >
            <option value="">Select category...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task Defaults Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-warm-900 pb-2 border-b border-warm-100">
          Task Defaults
        </h4>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">
            Default Priority
          </label>
          <div className="flex gap-2">
            {priorityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPriority(option.value)}
                disabled={isPending}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  priority === option.value
                    ? option.color + ' border-transparent'
                    : 'bg-white text-warm-600 border-warm-200 hover:border-warm-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Due Date Offset */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">
            Default Due Date (days from creation)
          </label>
          <input
            type="number"
            min="0"
            max="365"
            value={dueOffsetDays}
            onChange={(e) =>
              setDueOffsetDays(e.target.value === '' ? '' : parseInt(e.target.value))
            }
            placeholder="e.g., 7"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-warm-200 rounded-lg placeholder:text-warm-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-warm-500">
            Leave empty to set manually when creating tasks
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-warm-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-warm-700 bg-white border border-warm-200 rounded-lg hover:bg-warm-50 active:bg-warm-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
            </span>
          )}
          {isEditing ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}

export default TemplateForm;
