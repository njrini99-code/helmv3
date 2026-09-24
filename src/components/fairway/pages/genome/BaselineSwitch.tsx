'use client';

/**
 * Team / Tour baseline switch. A two-segment control whose thumb springs
 * between segments (CSS transform, so it needs no layout projection) and fires
 * a selection haptic on commit. The content it controls swaps instantly.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import type { Baseline } from './strand-model';

export interface BaselineSwitchProps {
  value: Baseline;
  onChange: (b: Baseline) => void;
  tourLabel?: string;
  className?: string;
}

export function BaselineSwitch({ value, onChange, tourLabel = 'Tour', className }: BaselineSwitchProps) {
  const options: Array<{ value: Baseline; label: string }> = [
    { value: 'team', label: 'Team' },
    { value: 'tour', label: tourLabel },
  ];
  const index = value === 'team' ? 0 : 1;

  function pick(next: Baseline) {
    if (next === value) return;
    fwHaptic('selection');
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      pick(value === 'team' ? 'tour' : 'team');
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Compare against"
      onKeyDown={onKeyDown}
      data-slot="genome-baseline-switch"
      className={cn(
        'relative grid h-11 w-[168px] shrink-0 grid-cols-2 rounded-full bg-surface-sunken p-1',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.06)] transition-transform [transition-duration:240ms] [transition-timing-function:var(--fw-ease-spring,cubic-bezier(0.34,1.3,0.5,1))] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => pick(o.value)}
            className={cn(
              'relative z-[1] rounded-full font-fw-sans text-body-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              selected ? 'text-text-primary' : 'text-text-secondary active:text-text-primary',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
