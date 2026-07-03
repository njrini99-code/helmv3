'use client';

import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DateRange {
  from: Date;
  to: Date;
  preset: string;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const presets = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function today(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const activePreset = value?.preset ?? '30d';

  const handlePreset = useCallback(
    (label: string, days: number) => {
      setShowCustom(false);
      onChange({ from: daysAgo(days), to: today(), preset: label });
    },
    [onChange]
  );

  const handleCustomFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const from = new Date(e.target.value + 'T00:00:00');
      const to = value?.to ?? today();
      onChange({ from, to, preset: 'custom' });
    },
    [onChange, value?.to]
  );

  const handleCustomToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const from = value?.from ?? daysAgo(30);
      const to = new Date(e.target.value + 'T23:59:59');
      onChange({ from, to, preset: 'custom' });
    },
    [onChange, value?.from]
  );

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {presets.map(({ label, days }) => (
        <Button variant="primary"
          key={label}
          type="button"
          onClick={() => handlePreset(label, days)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150',
            activePreset === label
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-cream-50 text-warm-600 border-warm-200 hover:bg-cream-100 hover:border-warm-300'
          )}
        >
          {label}
        </Button>
      ))}

      <Button variant="primary"
        type="button"
        onClick={() => setShowCustom((v) => !v)}
        className={cn(
          'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150',
          activePreset === 'custom'
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-cream-50 text-warm-600 border-warm-200 hover:bg-cream-100 hover:border-warm-300'
        )}
      >
        Custom
      </Button>

      {/* Selected range label */}
      {value && (
        <span className="text-xs text-warm-400 ml-1 tabular-nums">
          {formatShortDate(value.from)} &ndash; {formatShortDate(value.to)}
        </span>
      )}

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0">
          <Input
            type="date"
            className="min-h-0 rounded-lg border border-warm-200 bg-cream-50 px-2.5 py-1.5 text-sm text-warm-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            value={
              value?.from
                ? value.from.toISOString().split('T')[0]
                : ''
            }
            onChange={handleCustomFromChange}
          />
          <span className="text-xs text-warm-400">to</span>
          <Input
            type="date"
            className="min-h-0 rounded-lg border border-warm-200 bg-cream-50 px-2.5 py-1.5 text-sm text-warm-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            value={
              value?.to
                ? value.to.toISOString().split('T')[0]
                : ''
            }
            onChange={handleCustomToChange}
          />
        </div>
      )}
    </div>
  );
}
