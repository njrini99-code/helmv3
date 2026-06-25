'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessSeveritySlider.tsx
//
// 0–10 severity slider for the soreness region bottom sheet.
// Calm heat color track (severity-colors.ts). Haptic at threshold crossings.
// Accessible with keyboard arrow keys.
// =============================================================================

import { useCallback } from 'react';
import { haptic } from '@/lib/lifting/haptics';
import {
  severityTrackClass,
  severityThumbClass,
  severityTextClass,
  SEVERITY_LABELS,
} from './severity-colors';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export function SorenessSeveritySlider({ value, onChange }: Props) {
  const handleChange = useCallback(
    (raw: number) => {
      const next = Math.round(raw);
      if (next !== value) {
        if (next >= 7 && value < 7) haptic('warning');
        onChange(next);
      }
    },
    [value, onChange],
  );

  const pct = (value / 10) * 100;

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-warm-700">Rate soreness</span>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-3xl font-bold tabular-nums leading-none transition-colors duration-200 ${severityTextClass(value)}`}
          >
            {value}
          </span>
          <span className="text-sm text-warm-400">/ 10</span>
        </div>
      </div>

      {/* Label pill */}
      <div className="flex justify-end">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
            value === 0
              ? 'bg-warm-100 text-warm-400'
              : value <= 2
              ? 'bg-green-100 text-green-700'
              : value <= 4
              ? 'bg-yellow-100 text-yellow-700'
              : value <= 6
              ? 'bg-amber-100 text-amber-700'
              : value <= 8
              ? 'bg-orange-100 text-orange-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {SEVERITY_LABELS[value]}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative py-4">
        {/* Background track */}
        <div className="h-2.5 w-full rounded-full bg-warm-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-150 ${severityTrackClass(value)}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Native range input — invisible, layered over the custom track */}
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Soreness severity 0 to 10"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuetext={`${value} — ${SEVERITY_LABELS[value]}`}
        />

        {/* Custom thumb */}
        <div
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2
            h-7 w-7 rounded-full border-2 shadow-md transition-all duration-150
            ${severityThumbClass(value)}`}
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>

      {/* Scale ticks */}
      <div className="flex justify-between text-[10px] font-medium text-warm-300 px-1">
        <span>0</span>
        <span>2</span>
        <span>4</span>
        <span>6</span>
        <span>8</span>
        <span>10</span>
      </div>
    </div>
  );
}
