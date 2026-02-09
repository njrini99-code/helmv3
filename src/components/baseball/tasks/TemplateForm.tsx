'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { createTaskTemplate, updateTaskTemplate, type BaseballTaskTemplate } from '@/app/baseball/actions/tasks';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'academic', label: 'Academic' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'practice', label: 'Practice' },
  { value: 'game_prep', label: 'Game Prep' },
];

type TaskPriority = 'low' | 'normal' | 'high';

interface TemplateFormProps {
  teamId: string;
  template?: BaseballTaskTemplate;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function TemplateForm({
  teamId,
  template,
  onSuccess,
  onCancel,
  className,
}: TemplateFormProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(template?.title || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState(template?.category || 'general');
  const [priority, setPriority] = useState<TaskPriority>((template?.default_priority as TaskPriority) || 'normal');
  const [dueOffsetDays, setDueOffsetDays] = useState<number | ''>(template?.default_due_days ?? '');

  const isEditing = !!template;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setIsPending(true);

    try {
      if (isEditing && template) {
        const result = await updateTaskTemplate(template.id, {
          title: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          defaultPriority: priority,
          defaultDueDays: dueOffsetDays === '' ? null : dueOffsetDays,
        });

        if (!result.success) {
          setError(result.error || 'Failed to update template');
          return;
        }
      } else {
        const result = await createTaskTemplate(teamId, {
          title: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          default_priority: priority,
          default_due_days: dueOffsetDays === '' ? undefined : dueOffsetDays,
        });

        if (!result.success) {
          setError(result.error || 'Failed to create template');
          return;
        }
      }

      onSuccess?.();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsPending(false);
    }
  };

  const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700' },
    { value: 'normal', label: 'Normal', color: 'bg-green-100 text-green-700' },
    { value: 'high', label: 'High', color: 'bg-red-100 text-red-700' },
  ];

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Template Info Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
          Template Information
        </h4>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Template Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pre-Game Warmup Checklist"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of when to use this template..."
            rows={3}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 resize-none disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
          >
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
        <h4 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
          Task Defaults
        </h4>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  priority === option.value
                    ? option.color + ' border-transparent'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Default Due Date (days from creation)
          </label>
          <input
            type="number"
            min="0"
            max="365"
            value={dueOffsetDays}
            onChange={(e) => setDueOffsetDays(e.target.value === '' ? '' : parseInt(e.target.value))}
            placeholder="e.g., 7"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-slate-500">
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
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isEditing ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}

export default TemplateForm;
