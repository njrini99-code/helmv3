'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { ReminderPicker } from './ReminderPicker';
import { createTask, updateTask } from '@/app/golf/actions/tasks';
import type {
  GolfTask,
  CreateTaskData,
  TaskPriority,
  ReminderType,
} from '@/lib/types/golf';

interface TaskFormWithReminderProps {
  teamId: string;
  task?: GolfTask; // If provided, form is in edit mode
  teamMembers?: { id: string; full_name: string; avatar_url?: string }[];
  onSuccess?: (task: GolfTask) => void;
  onCancel?: () => void;
  className?: string;
}

export function TaskFormWithReminder({
  teamId,
  task,
  teamMembers = [],
  onSuccess,
  onCancel,
  className,
}: TaskFormWithReminderProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'medium');
  const [dueDate, setDueDate] = useState(
    task?.due_date ? task.due_date.split('T')[0] : ''
  );
  const [dueTime, setDueTime] = useState(
    task?.due_date ? task.due_date.split('T')[1]?.substring(0, 5) || '17:00' : '17:00'
  );
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || '');
  const [reminderAt, setReminderAt] = useState<string | null>(task?.reminder_at || null);
  const [reminderType, setReminderType] = useState<ReminderType>(
    task?.reminder_type || 'in_app'
  );

  const isEditing = !!task;

  // Get full due date ISO string
  const getFullDueDate = (): string | undefined => {
    if (!dueDate) return undefined;
    return new Date(`${dueDate}T${dueTime}`).toISOString();
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    startTransition(async () => {
      try {
        const fullDueDate = getFullDueDate();

        if (isEditing && task) {
          // Update existing task
          const { data, error: updateError } = await updateTask(task.id, {
            title: title.trim(),
            description: description.trim() || undefined,
            priority,
            due_date: fullDueDate,
            assigned_to: assignedTo || undefined,
            reminder_at: reminderAt || undefined,
            reminder_type: reminderAt ? reminderType : undefined,
          });

          if (updateError) {
            setError(updateError);
            return;
          }

          if (data && onSuccess) {
            onSuccess(data);
          }
        } else {
          // Create new task
          const taskData: CreateTaskData = {
            team_id: teamId,
            title: title.trim(),
            description: description.trim() || undefined,
            priority,
            due_date: fullDueDate,
            assigned_to: assignedTo || undefined,
            reminder_at: reminderAt || undefined,
            reminder_type: reminderAt ? reminderType : undefined,
          };

          const { data, error: createError } = await createTask(taskData);

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

  // Handle reminder change
  const handleReminderChange = (at: string | null, type: ReminderType) => {
    setReminderAt(at);
    setReminderType(type);
  };

  const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
    { value: 'high', label: 'High', color: 'bg-red-100 text-red-700' },
  ];

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)}>
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          disabled={isPending}
          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details..."
          rows={3}
          disabled={isPending}
          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 resize-none disabled:opacity-50"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Priority
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

      {/* Assignee */}
      {teamMembers.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Assign To
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Due Date & Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Due Time
          </label>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            disabled={isPending || !dueDate}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Reminder */}
      <div className="pt-2 border-t border-gray-100">
        <ReminderPicker
          dueDate={getFullDueDate()}
          value={reminderAt || undefined}
          reminderType={reminderType}
          onChange={handleReminderChange}
          disabled={isPending}
        />
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
          disabled={isPending || !title.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && (
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
          )}
          {isEditing ? 'Update Task' : 'Create Task'}
        </button>
      </div>
    </form>
  );
}

export default TaskFormWithReminder;
