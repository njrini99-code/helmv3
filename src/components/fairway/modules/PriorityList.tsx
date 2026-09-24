'use client';

/**
 * ============================================================================
 * PriorityList — the spine's ranked priority rows (mockup §01 .prio)
 * ----------------------------------------------------------------------------
 * Clean rows for a light surface: the rank ("01", "02"…) in a small neutral
 * circle, the title in primary ink, and the value right-aligned in tabular
 * figures. A value that leads with a minus sign ("−0.8 SG") is a loss and
 * reads in `fw-danger-ink`; everything else stays secondary — a leading "+"
 * is NOT read as good, because some priority values ("+0.41 / hole") are
 * costs. Mounted inside `Spine` under the "Priorities" eyebrow, exported
 * standalone so it can be reused (e.g. inside a drill panel).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';
import type { PriorityItem } from './types';

export interface PriorityListProps {
  items: PriorityItem[];
  className?: string;
}

/** True when a priority value leads with a minus sign (hyphen or U+2212). */
export function isLossValue(value: string): boolean {
  return /^\s*[-−]\s*\d/.test(value);
}

export function PriorityList({ items, className }: PriorityListProps) {
  return (
    <ol data-slot="priority-list" className={cn('grid gap-3', className)}>
      {items.map((item) => (
        <li key={item.rank} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
          <span
            style={TABULAR_NUMS}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-sunken font-fw-sans text-eyebrow font-semibold tabular-nums text-text-secondary"
          >
            {String(item.rank).padStart(2, '0')}
          </span>
          <span className="min-w-0 truncate font-fw-sans text-body-sm font-semibold text-text-primary">
            {item.title}
          </span>
          <span
            data-slot="priority-value"
            data-loss={isLossValue(item.value) || undefined}
            style={TABULAR_NUMS}
            className={cn(
              'text-right font-fw-sans text-caption font-semibold tabular-nums',
              isLossValue(item.value) ? 'text-fw-danger-ink' : 'text-text-secondary',
            )}
          >
            {item.value}
          </span>
        </li>
      ))}
    </ol>
  );
}
