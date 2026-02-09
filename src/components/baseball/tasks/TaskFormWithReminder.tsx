'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ReminderPicker } from './ReminderPicker';
import { createTask } from '@/app/baseball/actions/tasks';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'academic', label: 'Academic' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'practice', label: 'Practice' },
  { value: 'game_prep', label: 'Game Prep' },
];

type TaskPriority = 'low' | 'normal' | 'high';

interface TaskFormWithReminderProps {
  teamId: string;
  players?: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function TaskFormWithReminder({
  teamId,
  players = [],
  onSuccess,
  onCancel,
  className,
}: TaskFormWithReminderProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [category, setCategory] = useState('general');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('17:00');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [assignToAll] = useState(true);
  const [selectedPlayers] = useState<string[]>([]);

  const getFullDueDate = (): string | undefined => {
    if (!dueDate) return undefined;
    return new Date(`${dueDate}T${dueTime}`).toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsPending(true);

    try {
      const fullDueDate = getFullDueDate();
      const playerIds = assignToAll ? players.map(p => p.id) : selectedPlayers;

      const result = await createTask(teamId, {
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: fullDueDate,
        category,
        priority,
        reminder_at: reminderAt || undefined,
        player_ids: playerIds,
      });

      if (!result.success) {
        setError(result.error || 'Failed to create task');
        return;
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
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)}>
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          autoComplete="off"
          disabled={isPending}
          className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details..."
          autoComplete="off"
          rows={3}
          disabled={isPending}
          className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 resize-none disabled:opacity-50"
        />
      </div>

      {/* Category & Priority */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
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
      </div>

      {/* Due Date & Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Due Time</label>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            disabled={isPending || !dueDate}
            className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-50 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Reminder */}
      <div className="pt-2 border-t border-slate-100">
        <ReminderPicker
          dueDate={getFullDueDate()}
          value={reminderAt || undefined}
          onChange={(newReminderAt) => setReminderAt(newReminderAt)}
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
          disabled={isPending || !title.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Create Task
        </button>
      </div>
    </form>
  );
}

export default TaskFormWithReminder;
