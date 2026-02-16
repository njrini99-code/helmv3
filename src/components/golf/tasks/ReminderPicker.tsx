'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { REMINDER_PRESETS, ReminderType, ReminderPreset } from '@/lib/types/golf';

interface ReminderPickerProps {
  dueDate?: string;
  value?: string;
  reminderType?: ReminderType;
  onChange: (reminderAt: string | null, reminderType: ReminderType) => void;
  disabled?: boolean;
  className?: string;
}

export function ReminderPicker({
  dueDate,
  value,
  reminderType = 'in_app',
  onChange,
  disabled = false,
  className,
}: ReminderPickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [selectedType, setSelectedType] = useState<ReminderType>(reminderType);
  const [isEnabled, setIsEnabled] = useState(!!value);

  // Calculate the reminder time from the preset
  const calculateReminderFromPreset = (preset: ReminderPreset): string | null => {
    if (!dueDate || preset.value === 'custom') return null;

    const due = new Date(dueDate);

    if (preset.offsetDays) {
      due.setDate(due.getDate() - preset.offsetDays);
    }

    if (preset.offsetHours) {
      due.setHours(due.getHours() - preset.offsetHours);
    }

    return due.toISOString();
  };

  // Handle preset selection
  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);

    if (presetValue === 'custom') {
      // Use custom date/time
      if (customDate) {
        const reminderAt = new Date(`${customDate}T${customTime}`).toISOString();
        onChange(reminderAt, selectedType);
      }
    } else if (presetValue) {
      const preset = REMINDER_PRESETS.find((p) => p.value === presetValue);
      if (preset) {
        const reminderAt = calculateReminderFromPreset(preset);
        onChange(reminderAt, selectedType);
      }
    } else {
      onChange(null, selectedType);
    }
  };

  // Handle custom date/time change
  const handleCustomChange = (date: string, time: string) => {
    setCustomDate(date);
    setCustomTime(time);

    if (date && selectedPreset === 'custom') {
      const reminderAt = new Date(`${date}T${time}`).toISOString();
      onChange(reminderAt, selectedType);
    }
  };

  // Handle reminder type change
  const handleTypeChange = (type: ReminderType) => {
    setSelectedType(type);
    if (value) {
      onChange(value, type);
    }
  };

  // Handle toggle
  const handleToggle = () => {
    if (isEnabled) {
      setIsEnabled(false);
      setSelectedPreset('');
      onChange(null, selectedType);
    } else {
      setIsEnabled(true);
    }
  };

  // Format reminder preview
  const formatReminderPreview = (): string => {
    if (!value) return '';

    const reminderDate = new Date(value);
    const now = new Date();
    const diffMs = reminderDate.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 0) {
      return 'Reminder time has passed';
    } else if (diffHours < 1) {
      return 'Reminder in less than 1 hour';
    } else if (diffHours < 24) {
      return `Reminder in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
      return `Reminder in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else {
      return `Reminder on ${reminderDate.toLocaleDateString()}`;
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-warm-700">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-warm-500"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Set Reminder
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={handleToggle}
          disabled={disabled || !dueDate}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isEnabled ? 'bg-primary-600' : 'bg-warm-200'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform',
              isEnabled ? 'translate-x-4' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {!dueDate && (
        <p className="text-xs text-warm-500">Set a due date first to enable reminders</p>
      )}

      {/* Reminder options */}
      {isEnabled && dueDate && (
        <div className="space-y-3 pl-6 border-l-2 border-primary-100">
          {/* Preset options */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-warm-600">
              When to remind
            </label>
            <div className="flex flex-wrap gap-2">
              {REMINDER_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePresetChange(preset.value)}
                  disabled={disabled}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    selectedPreset === preset.value
                      ? 'bg-primary-50 text-primary-700 border-primary-200'
                      : 'bg-white text-warm-600 border-warm-200 hover:border-warm-300 hover:bg-warm-50'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date/time */}
          {selectedPreset === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => handleCustomChange(e.target.value, customTime)}
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm bg-white border border-warm-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => handleCustomChange(customDate, e.target.value)}
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm bg-white border border-warm-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Notification type */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-warm-600">
              How to notify
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'in_app', label: 'In-app', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                { value: 'email', label: 'Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                { value: 'push', label: 'Push', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
                { value: 'all', label: 'All', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
              ].map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleTypeChange(type.value as ReminderType)}
                  disabled={disabled}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    selectedType === type.value
                      ? 'bg-primary-50 text-primary-700 border-primary-200'
                      : 'bg-white text-warm-600 border-warm-200 hover:border-warm-300 hover:bg-warm-50'
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {value && (
            <div className="flex items-center gap-2 p-2 bg-primary-50 rounded-lg">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary-600"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-xs text-primary-700">{formatReminderPreview()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ReminderPicker;
