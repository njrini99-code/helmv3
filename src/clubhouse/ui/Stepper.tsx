'use client';

import { Minus, Plus } from 'lucide-react';
import { IconButton } from './Button';
import { haptic } from '../lib/haptics';

/**
 * A number set by steps (premium plan batch 5): − value +, as UIStepper and Radix's number field. The value is a
 * spinbutton, so arrow keys, Page Up and Down, Home and End work and VoiceOver reads it with its range; each step is a
 * selection haptic, and a key at its end is unavailable rather than silent. The practice builder's own stepper is its
 * first user.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  unit,
  format = (n) => String(n),
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Read after the value: "minutes", "reps". */
  unit?: string;
  format?: (n: number) => string;
}) {
  const set = (n: number) => {
    const next = Math.min(max, Math.max(min, n));
    if (next === value) return;
    haptic('select');
    onChange(next);
  };
  return (
    <div className="ch-stepper" role="group" aria-label={label}>
      <IconButton data-ctl="CTL-P000-044" icon={Minus} label={`Less ${label.toLowerCase()}`} size="sm" variant="secondary" disabled={value <= min} onClick={() => set(value - step)} />
      <span
        className="ch-stepper__v ch-num"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={unit ? `${format(value)} ${unit}` : format(value)}
        onKeyDown={(e) => {
          const by: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 10, PageDown: -step * 10 };
          if (e.key in by) {
            e.preventDefault();
            set(value + by[e.key]!);
          } else if (e.key === 'Home') {
            e.preventDefault();
            set(min);
          } else if (e.key === 'End') {
            e.preventDefault();
            set(max);
          }
        }}
      >
        {format(value)}
        {unit && <span className="ch-stepper__u"> {unit}</span>}
      </span>
      <IconButton data-ctl="CTL-P000-045" icon={Plus} label={`More ${label.toLowerCase()}`} size="sm" variant="secondary" disabled={value >= max} onClick={() => set(value + step)} />
    </div>
  );
}
