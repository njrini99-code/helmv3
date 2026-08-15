'use client';

/**
 * ============================================================================
 * PriorityList — the spine's ranked priority rows (mockup §01 .prio)
 * ----------------------------------------------------------------------------
 * A tight 22px-rank / title / mono-value grid, ranked 01, 02, 03… Mounted
 * inside `Spine` under the "Priorities" eyebrow, exported standalone so it
 * can be reused (e.g. inside a drill panel).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';
import type { PriorityItem } from './types';

export interface PriorityListProps {
  items: PriorityItem[];
  className?: string;
}

export function PriorityList({ items, className }: PriorityListProps) {
  return (
    <ol data-slot="priority-list" className={cn('grid gap-2.5', className)}>
      {items.map((item) => (
        <li key={item.rank} className="grid grid-cols-[22px_1fr_auto] items-baseline gap-2.5">
          <span
            style={TABULAR_NUMS}
            className="font-fw-mono text-caption tabular-nums text-accent-300"
          >
            {String(item.rank).padStart(2, '0')}
          </span>
          <span className="min-w-0 truncate font-fw-sans text-body-sm font-semibold text-text-on-accent">
            {item.title}
          </span>
          <span
            style={TABULAR_NUMS}
            className="font-fw-mono text-caption tabular-nums text-ink-on-deep-soft"
          >
            {item.value}
          </span>
        </li>
      ))}
    </ol>
  );
}
