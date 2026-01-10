'use client';

/**
 * RecurrencePicker Component
 *
 * UI for selecting recurrence patterns for events
 * Supports: Daily, Weekly, Monthly, Yearly with various options
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { RecurrenceRule } from '@/lib/types/calendar';
import { describeRecurrence } from '@/lib/calendar/recurrence';

interface RecurrencePickerProps {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
  startDate?: Date;
}

type EndType = 'never' | 'on' | 'after';

const WEEKDAYS = [
  { value: 'MO', label: 'M', fullLabel: 'Monday' },
  { value: 'TU', label: 'T', fullLabel: 'Tuesday' },
  { value: 'WE', label: 'W', fullLabel: 'Wednesday' },
  { value: 'TH', label: 'T', fullLabel: 'Thursday' },
  { value: 'FR', label: 'F', fullLabel: 'Friday' },
  { value: 'SA', label: 'S', fullLabel: 'Saturday' },
  { value: 'SU', label: 'S', fullLabel: 'Sunday' },
];

export function RecurrencePicker({ value, onChange, startDate }: RecurrencePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Local state for building the rule
  const [frequency, setFrequency] = useState<RecurrenceRule['frequency']>(value?.frequency || 'weekly');
  const [interval, setInterval] = useState<number>(value?.interval || 1);
  const [byDay, setByDay] = useState<string[]>(value?.byDay || []);
  const [endType, setEndType] = useState<EndType>(() => {
    if (value?.until) return 'on';
    if (value?.count) return 'after';
    return 'never';
  });
  const [until, setUntil] = useState(value?.until || '');
  const [count, setCount] = useState(value?.count || 1);

  const handleSave = () => {
    const rule: RecurrenceRule = {
      frequency,
      interval: interval > 1 ? interval : 1,
      byDay: frequency === 'weekly' && byDay.length > 0 ? byDay : undefined,
    };

    if (endType === 'on' && until) {
      rule.until = until;
    } else if (endType === 'after' && count > 0) {
      rule.count = count;
    }

    onChange(rule);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
  };

  const toggleWeekday = (day: string) => {
    setByDay(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  // Generate description
  const description = value ? describeRecurrence(value) : 'Does not repeat';

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Recurrence</label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIsOpen(true)}
          className="w-full justify-start text-left font-normal"
        >
          {description}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border border-slate-200 rounded-lg bg-white">
      <div className="flex items-center justify-between">
        <label className="text-base font-semibold text-slate-700">Repeat Pattern</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(false)}
        >
          ✕
        </Button>
      </div>

      {/* Frequency */}
      <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
        <label className="text-sm text-slate-700">Repeat every</label>
        <div className="flex gap-2">
          <Input
            type="number"
            min="1"
            max="99"
            value={interval}
            onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
            className="w-20"
          />
          <Select
            value={frequency}
            onChange={(value) => setFrequency(value as RecurrenceRule['frequency'])}
            options={[
              { value: 'daily', label: interval === 1 ? 'Day' : 'Days' },
              { value: 'weekly', label: interval === 1 ? 'Week' : 'Weeks' },
              { value: 'monthly', label: interval === 1 ? 'Month' : 'Months' },
              { value: 'yearly', label: interval === 1 ? 'Year' : 'Years' },
            ]}
            className="flex-1"
          />
        </div>
      </div>

      {/* Weekday selection (for weekly) */}
      {frequency === 'weekly' && (
        <div className="space-y-2">
          <label className="text-sm text-slate-700">Repeat on</label>
          <div className="flex gap-2">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleWeekday(day.value)}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  text-sm font-medium transition-colors
                  ${byDay.includes(day.value)
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }
                `}
                title={day.fullLabel}
              >
                {day.label}
              </button>
            ))}
          </div>
          {byDay.length === 0 && (
            <p className="text-xs text-slate-500">
              Select at least one day of the week
            </p>
          )}
        </div>
      )}

      {/* End condition */}
      <div className="space-y-3">
        <label className="text-sm text-slate-700">Ends</label>

        {/* Never */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="end-never"
            checked={endType === 'never'}
            onChange={() => setEndType('never')}
          />
          <label htmlFor="end-never" className="font-normal cursor-pointer text-sm text-slate-700">
            Never
          </label>
        </div>

        {/* On date */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="end-on"
            checked={endType === 'on'}
            onChange={() => setEndType('on')}
          />
          <label htmlFor="end-on" className="font-normal cursor-pointer text-sm text-slate-700">
            On
          </label>
          <Input
            type="date"
            value={until}
            onChange={(e) => {
              setUntil(e.target.value);
              setEndType('on');
            }}
            disabled={endType !== 'on'}
            className="flex-1"
            min={startDate ? startDate.toISOString().split('T')[0] : undefined}
          />
        </div>

        {/* After count */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="end-after"
            checked={endType === 'after'}
            onChange={() => setEndType('after')}
          />
          <label htmlFor="end-after" className="font-normal cursor-pointer text-sm text-slate-700">
            After
          </label>
          <Input
            type="number"
            min="1"
            max="999"
            value={count}
            onChange={(e) => {
              setCount(parseInt(e.target.value) || 1);
              setEndType('after');
            }}
            disabled={endType !== 'after'}
            className="w-20"
          />
          <span className="text-sm text-slate-600">occurrences</span>
        </div>
      </div>

      {/* Preview */}
      <div className="pt-3 border-t border-slate-200">
        <p className="text-sm text-slate-600">
          <span className="font-medium">Preview: </span>
          {describeRecurrence({
            frequency,
            interval: interval > 1 ? interval : 1,
            byDay: frequency === 'weekly' && byDay.length > 0 ? byDay : undefined,
            until: endType === 'on' && until ? until : undefined,
            count: endType === 'after' && count > 0 ? count : undefined,
          })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={frequency === 'weekly' && byDay.length === 0}
          className="flex-1"
        >
          Save
        </Button>
        {value && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleClear}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
