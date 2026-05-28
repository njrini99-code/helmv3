'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconBell } from '@/components/icons';

const PRESETS = [
  { value: '1_day', label: '1 day before', offsetDays: 1 },
  { value: '2_hours', label: '2 hours before', offsetHours: 2 },
  { value: 'morning', label: 'Morning of', offsetHours: 8 },
  { value: 'custom', label: 'Custom', offsetDays: 0 },
];

interface ReminderPickerProps {
  dueDate?: string;
  value?: string;
  onChange: (reminderAt: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function ReminderPicker({
  dueDate,
  value,
  onChange,
  disabled = false,
  className,
}: ReminderPickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [isEnabled, setIsEnabled] = useState(!!value);

  function calculateReminderFromPreset(presetValue: string): string | null {
    if (!dueDate) return null;

    const preset = PRESETS.find(p => p.value === presetValue);
    if (!preset || presetValue === 'custom') return null;

    const due = new Date(dueDate);

    if (preset.offsetDays) {
      due.setDate(due.getDate() - preset.offsetDays);
    }
    if (preset.offsetHours) {
      due.setHours(due.getHours() - preset.offsetHours);
    }

    return due.toISOString();
  }

  function handlePresetChange(presetValue: string) {
    setSelectedPreset(presetValue);

    if (presetValue === 'custom') {
      if (customDate) {
        const reminderAt = new Date(`${customDate}T${customTime}`).toISOString();
        onChange(reminderAt);
      }
    } else if (presetValue) {
      const reminderAt = calculateReminderFromPreset(presetValue);
      onChange(reminderAt);
    } else {
      onChange(null);
    }
  }

  function handleCustomChange(date: string, time: string) {
    setCustomDate(date);
    setCustomTime(time);

    if (date && selectedPreset === 'custom') {
      const reminderAt = new Date(`${date}T${time}`).toISOString();
      onChange(reminderAt);
    }
  }

  function handleToggle() {
    if (isEnabled) {
      setIsEnabled(false);
      setSelectedPreset('');
      onChange(null);
    } else {
      setIsEnabled(true);
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-warm-700">
          <IconBell size={16} className="text-warm-500" />
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
          <div className="space-y-2">
            <label className="block text-xs font-medium text-warm-600">
              When to remind
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
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
                      : 'bg-white text-warm-600 border-warm-200 hover:border-warm-300 hover:bg-warm-50 active:bg-warm-100'
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
                <label className="block text-xs font-medium text-warm-600 mb-1">Date</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => handleCustomChange(e.target.value, customTime)}
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm bg-white border border-warm-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1">Time</label>
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

          {/* Preview */}
          {value && (
            <div className="flex items-center gap-2 p-2 bg-primary-50 rounded-lg">
              <IconBell size={14} className="text-primary-600" />
              <span className="text-xs text-primary-700">
                Reminder set for {new Date(value).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

