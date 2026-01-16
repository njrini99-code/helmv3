'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { createTemplate, updateTemplate } from '@/app/golf/actions/task-templates';
import type {
  TaskTemplate,
  CreateTemplateData,
  TaskPriority,
  AssigneeType,
  RecurrencePattern,
  TaskCategory,
  TASK_CATEGORIES,
  RECURRENCE_OPTIONS,
  DAYS_OF_WEEK,
} from '@/lib/types/golf';

interface TemplateFormProps {
  teamId: string;
  template?: TaskTemplate; // If provided, form is in edit mode
  onSuccess?: (template: TaskTemplate) => void;
  onCancel?: () => void;
  className?: string;
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'academic', label: 'Academic' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
];

const RECURRENCE_OPTIONS_LIST: { value: RecurrencePattern; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'before_event', label: 'Before Each Event' },
];

const DAYS_OF_WEEK_LIST: { value: number; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function TemplateForm({
  teamId,
  template,
  onSuccess,
  onCancel,
  className,
}: TemplateFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [title, setTitle] = useState(template?.title || '');
  const [taskDescription, setTaskDescription] = useState(template?.task_description || '');
  const [category, setCategory] = useState<TaskCategory | ''>(template?.category || '');
  const [priority, setPriority] = useState<TaskPriority>(template?.default_priority || 'medium');
  const [assigneeType, setAssigneeType] = useState<AssigneeType>(
    template?.default_assignee_type || 'all'
  );
  const [dueOffsetDays, setDueOffsetDays] = useState<number | ''>(
    template?.default_due_offset_days ?? ''
  );
  const [reminderOffsetHours, setReminderOffsetHours] = useState<number | ''>(
    template?.default_reminder_offset_hours ?? ''
  );
  const [isRecurring, setIsRecurring] = useState(template?.is_recurring || false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern | ''>(
    template?.recurrence_pattern || ''
  );
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState<number | ''>(
    template?.recurrence_day_of_week ?? ''
  );
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState<number | ''>(
    template?.recurrence_day_of_month ?? ''
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

    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    startTransition(async () => {
      try {
        const templateData: CreateTemplateData = {
          team_id: teamId,
          name: name.trim(),
          description: description.trim() || undefined,
          title: title.trim(),
          task_description: taskDescription.trim() || undefined,
          category: category || undefined,
          default_priority: priority,
          default_assignee_type: assigneeType,
          default_due_offset_days: dueOffsetDays === '' ? undefined : dueOffsetDays,
          default_reminder_offset_hours:
            reminderOffsetHours === '' ? undefined : reminderOffsetHours,
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring && recurrencePattern ? recurrencePattern : undefined,
          recurrence_day_of_week:
            isRecurring && recurrencePattern === 'weekly' && recurrenceDayOfWeek !== ''
              ? recurrenceDayOfWeek
              : undefined,
          recurrence_day_of_month:
            isRecurring && recurrencePattern === 'monthly' && recurrenceDayOfMonth !== ''
              ? recurrenceDayOfMonth
              : undefined,
        };

        if (isEditing && template) {
          const { data, error: updateError } = await updateTemplate(template.id, {
            name: templateData.name,
            description: templateData.description,
            title: templateData.title,
            task_description: templateData.task_description,
            category: templateData.category,
            default_priority: templateData.default_priority,
            default_assignee_type: templateData.default_assignee_type,
            default_due_offset_days: templateData.default_due_offset_days,
            default_reminder_offset_hours: templateData.default_reminder_offset_hours,
            is_recurring: templateData.is_recurring,
            recurrence_pattern: templateData.recurrence_pattern,
            recurrence_day_of_week: templateData.recurrence_day_of_week,
            recurrence_day_of_month: templateData.recurrence_day_of_month,
          });

          if (updateError) {
            setError(updateError);
            return;
          }

          if (data && onSuccess) {
            onSuccess(data);
          }
        } else {
          const { data, error: createError } = await createTemplate(templateData);

          if (createError) {
            setError(createError);
            return;
          }

          if (data && onSuccess) {
            onSuccess(data);
          }
        }
      } catch (err) {
        setError('An unexpected error occurred');
      }
    });
  };

  const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
    { value: 'high', label: 'High', color: 'bg-red-100 text-red-700' },
  ];

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Template Info Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">
          Template Information
        </h4>

        {/* Template Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Template Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Tournament Prep Checklist"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            A descriptive name to identify this template
          </p>
        </div>

        {/* Template Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Template Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of when to use this template"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
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
        <h4 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">
          Task Defaults
        </h4>

        {/* Task Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Default Task Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Complete pre-tournament checklist"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
        </div>

        {/* Task Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Default Task Description
          </label>
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Detailed instructions for the task..."
            rows={3}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 resize-none disabled:opacity-50"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  priority === option.value
                    ? option.color + ' border-transparent'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Assignee Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Default Assignees
          </label>
          <select
            value={assigneeType}
            onChange={(e) => setAssigneeType(e.target.value as AssigneeType)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          >
            <option value="all">All Players</option>
            <option value="specific_players">Specific Players (select when creating)</option>
            <option value="position">By Position</option>
          </select>
        </div>

        {/* Due Date Offset */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave empty to set manually when creating tasks
          </p>
        </div>

        {/* Reminder Offset */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Default Reminder (hours before due)
          </label>
          <input
            type="number"
            min="0"
            max="168"
            value={reminderOffsetHours}
            onChange={(e) =>
              setReminderOffsetHours(e.target.value === '' ? '' : parseInt(e.target.value))
            }
            placeholder="e.g., 24"
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave empty for no automatic reminder
          </p>
        </div>
      </div>

      {/* Recurrence Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">
          Recurrence Settings
        </h4>

        {/* Recurring Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Recurring Template
            </label>
            <p className="text-xs text-gray-500">
              Automatically create tasks on a schedule
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isRecurring}
            onClick={() => setIsRecurring(!isRecurring)}
            disabled={isPending}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isRecurring ? 'bg-brand-600' : 'bg-gray-200'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform',
                isRecurring ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {isRecurring && (
          <>
            {/* Recurrence Pattern */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Frequency
              </label>
              <select
                value={recurrencePattern}
                onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
                disabled={isPending}
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
              >
                <option value="">Select frequency...</option>
                {RECURRENCE_OPTIONS_LIST.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Weekly - Day of Week */}
            {recurrencePattern === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Day of Week
                </label>
                <select
                  value={recurrenceDayOfWeek}
                  onChange={(e) =>
                    setRecurrenceDayOfWeek(
                      e.target.value === '' ? '' : parseInt(e.target.value)
                    )
                  }
                  disabled={isPending}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
                >
                  <option value="">Select day...</option>
                  {DAYS_OF_WEEK_LIST.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Monthly - Day of Month */}
            {recurrencePattern === 'monthly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Day of Month
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={recurrenceDayOfMonth}
                  onChange={(e) =>
                    setRecurrenceDayOfMonth(
                      e.target.value === '' ? '' : parseInt(e.target.value)
                    )
                  }
                  placeholder="1-31"
                  disabled={isPending}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !name.trim() || !title.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
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
          )}
          {isEditing ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}

export default TemplateForm;
